"""Parola, JWT, TOTP ve sır şifreleme."""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet

from sarnic.config import settings

_ph = PasswordHasher()


# --------------------------------------------------------------------------- #
#  Parola
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _ph.verify(password_hash, password)
        return True
    except (VerifyMismatchError, Exception):
        return False


# --------------------------------------------------------------------------- #
#  JWT
# --------------------------------------------------------------------------- #
def create_token(
    subject: str, token_type: str, expires_delta: timedelta, extra: dict[str, Any] | None = None
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int, role: str) -> str:
    return create_token(
        str(user_id),
        "access",
        timedelta(minutes=settings.access_token_minutes),
        {"role": role},
    )


def create_refresh_token(user_id: int) -> str:
    return create_token(str(user_id), "refresh", timedelta(days=settings.refresh_token_days))


def create_2fa_challenge_token(user_id: int) -> str:
    """Parola doğru ama TOTP henüz girilmedi — 5 dakikalık ara jeton."""
    return create_token(str(user_id), "2fa", timedelta(minutes=5))


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if expected_type and payload.get("typ") != expected_type:
        raise jwt.InvalidTokenError(f"beklenen jeton tipi {expected_type}")
    return payload


def hash_token(token: str) -> str:
    """Refresh jetonları DB'de düz saklanmaz."""
    return hashlib.sha256(token.encode()).hexdigest()


# --------------------------------------------------------------------------- #
#  TOTP
# --------------------------------------------------------------------------- #
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.totp_issuer)


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


# --------------------------------------------------------------------------- #
#  Sır şifreleme (Discord webhook URL'leri vb.)
# --------------------------------------------------------------------------- #
def _fernet() -> Fernet:
    key = settings.secret_encryption_key
    if not key:
        digest = hashlib.sha256(settings.jwt_secret.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    return _fernet().decrypt(ciphertext.encode()).decode()


def mask_secret(value: str, keep: int = 6) -> str:
    """Panelde webhook URL'i maskeli gösterilir."""
    if not value:
        return ""
    if len(value) <= keep * 2:
        return "•" * len(value)
    return f"{value[:keep]}{'•' * 8}{value[-keep:]}"
