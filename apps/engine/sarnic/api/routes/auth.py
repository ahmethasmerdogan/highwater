"""Kimlik doğrulama — JWT + zorunlu TOTP 2FA.

Açık kayıt yoktur; kullanıcılar yalnızca `ADMIN` daveti ile oluşur (§17).
Giriş iki adımlıdır: parola → TOTP. 2FA hiç kurulmamışsa ilk girişte kurulur.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from sarnic.api.deps import CurrentUser, SessionDep, client_ip, write_audit
from sarnic.api.schemas import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    TokenPair,
    TotpSetup,
    TwoFactorRequest,
    UserOut,
)
from sarnic.config import settings
from sarnic.core.security import (
    WS_TICKET_SECONDS,
    create_2fa_challenge_token,
    create_access_token,
    create_refresh_token,
    create_ws_ticket,
    decode_token,
    generate_totp_secret,
    hash_token,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)
from sarnic.db.models import Session as SessionRow
from sarnic.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

INVALID = "E-posta veya parola hatalı."

# --------------------------------------------------------------------------- #
#  Deneme sınırlaması
#
#  Panel dışarı açıldığında parola + 2FA tek savunma hattıdır ve ikisinde de
#  sınırsız deneme yapılabiliyordu. TOTP altı hanedir (`valid_window=1` ile her
#  an üç kod geçerli) ve doğrulama jetonu beş dakika yaşar: parolayı ele
#  geçirmiş biri o pencerede sınırsız kod deneyebilirdi.
#
#  Süreç içi, bellekte tutulan basit bir sayaç. Tek API süreci olduğu için
#  yeterli; Redis'e taşımak ancak yatay ölçeklenirken gerekir. Yeniden
#  başlatmada sıfırlanması kabul edilebilir — saldırgan servisi yeniden
#  başlatamaz.
# --------------------------------------------------------------------------- #
_ATTEMPTS: dict[str, list[float]] = {}

#: Aynı anahtar için pencere içinde izin verilen deneme sayısı.
MAX_ATTEMPTS = 8
#: Sayaç penceresi (saniye).
ATTEMPT_WINDOW = 300.0


def _rate_limit(key: str) -> None:
    """Sayacı ilerletir; sınır aşıldıysa 429 atar."""
    now = time.monotonic()
    hits = [t for t in _ATTEMPTS.get(key, []) if now - t < ATTEMPT_WINDOW]
    if len(hits) >= MAX_ATTEMPTS:
        retry = int(ATTEMPT_WINDOW - (now - hits[0])) + 1
        _ATTEMPTS[key] = hits
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Çok fazla başarısız deneme. {retry} saniye sonra tekrar deneyin.",
            headers={"Retry-After": str(retry)},
        )
    hits.append(now)
    _ATTEMPTS[key] = hits


def _clear_attempts(key: str) -> None:
    """Başarılı girişten sonra sayaç sıfırlanır."""
    _ATTEMPTS.pop(key, None)


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, session: SessionDep) -> LoginResponse:
    _rate_limit(f"login:{client_ip(request)}:{payload.email.lower()}")
    user = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        # Kullanıcı var mı yok mu bilgisini sızdırmayız.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID)
    _clear_attempts(f"login:{client_ip(request)}:{payload.email.lower()}")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hesap pasif durumda.")

    if not user.totp_enabled:
        # 2FA zorunlu — ilk girişte kurulum verisi döner, kod doğrulanınca aktifleşir.
        secret = user.totp_secret or generate_totp_secret()
        user.totp_secret = secret
        await session.commit()
        return LoginResponse(
            requires_2fa=True,
            challenge_token=create_2fa_challenge_token(user.id),
            totp_setup=TotpSetup(
                secret=secret, provisioning_uri=totp_provisioning_uri(secret, user.email)
            ),
        )

    return LoginResponse(requires_2fa=True, challenge_token=create_2fa_challenge_token(user.id))


@router.post("/2fa", response_model=TokenPair)
async def verify_two_factor(
    payload: TwoFactorRequest, request: Request, session: SessionDep
) -> TokenPair:
    try:
        claims = decode_token(payload.challenge_token, expected_type="2fa")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Doğrulama süresi doldu, tekrar giriş yapın."
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz doğrulama jetonu.") from exc

    user = (
        await session.execute(select(User).where(User.id == int(claims["sub"])))
    ).scalar_one_or_none()
    if user is None or not user.totp_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kullanıcı bulunamadı.")

    # Kod denemesi kullanıcı başına sınırlanır: jeton beş dakika yaşıyor ve
    # o pencerede kaba kuvvet uygulanabiliyordu.
    _rate_limit(f"2fa:{user.id}")

    if not verify_totp(user.totp_secret, payload.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Doğrulama kodu hatalı.")
    _clear_attempts(f"2fa:{user.id}")

    if not user.totp_enabled:
        user.totp_enabled = True

    user.last_login_at = datetime.now(UTC)
    tokens = await _issue(session, user, request)
    await write_audit(session, request, user.id, "auth.login", target=user.email)
    await session.commit()
    return tokens


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, request: Request, session: SessionDep) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz yenileme jetonu.") from exc

    row = (
        await session.execute(
            select(SessionRow).where(SessionRow.token_hash == hash_token(payload.refresh_token))
        )
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if row is None or row.revoked_at is not None or row.expires_at < now:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Oturum sonlandırılmış. Tekrar giriş yapın."
        )

    user = (
        await session.execute(select(User).where(User.id == int(claims["sub"])))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kullanıcı bulunamadı veya pasif.")

    row.revoked_at = now  # rotasyon: eski refresh jetonu tek kullanımlıktır
    tokens = await _issue(session, user, request)
    await session.commit()
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: RefreshRequest, request: Request, session: SessionDep, user: CurrentUser
) -> None:
    row = (
        await session.execute(
            select(SessionRow).where(SessionRow.token_hash == hash_token(payload.refresh_token))
        )
    ).scalar_one_or_none()
    if row is not None:
        row.revoked_at = datetime.now(UTC)
    await write_audit(session, request, user.id, "auth.logout")
    await session.commit()


@router.post("/ws-ticket")
async def ws_ticket(user: CurrentUser) -> dict:
    """WebSocket için tek kullanımlık, 30 saniyelik bilet.

    Neden ayrı bir uç: tarayıcı WebSocket el sıkışmasında `Authorization`
    başlığı gönderemez, kimlik sorgu dizgesinden geçmek zorunda ve sorgu
    dizgeleri loglara düşer. Bilet normal başlıkla alınır, sonra tek atımlık
    olarak URL'de harcanır (`core/security.py::create_ws_ticket`).
    """
    return {"ticket": create_ws_ticket(user.id, str(user.role)), "expires_in": WS_TICKET_SECONDS}


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


async def _issue(session, user: User, request: Request) -> TokenPair:
    access = create_access_token(user.id, str(user.role))
    refresh_token = create_refresh_token(user.id)
    session.add(
        SessionRow(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent", "")[:400],
        )
    )
    return TokenPair(access_token=access, refresh_token=refresh_token)
