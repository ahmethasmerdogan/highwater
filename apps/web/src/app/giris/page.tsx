"use client";

/**
 * Giriş.
 *
 * Açık kayıt yoktur: hesaplar yalnızca yönetici daveti ile oluşur ve iki
 * adımlı doğrulama zorunludur. İki adımlı akış — önce parola, sonra kod.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, StatusPill } from "@/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { demoCredentials, devCredentials, totpNow } from "@/lib/dev-auth";

const FIELD =
  "h-10 w-full rounded-lg border border-line bg-inset px-3 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-brand";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, startLogin, completeLogin } = useAuth();
  const dev = devCredentials();
  const demo = demoCredentials();

  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState(dev?.email ?? "");
  const [password, setPassword] = useState(dev?.password ?? "");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [setupUri, setSetupUri] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  /* Geliştirme kolaylığı: TOTP kodu otomatik üretilir. */
  useEffect(() => {
    if (step !== "code" || !dev?.totpSecret) return;
    let cancelled = false;
    const fill = async () => {
      const generated = await totpNow(dev.totpSecret!);
      if (!cancelled) setCode(generated);
    };
    void fill();
    const timer = setInterval(() => void fill(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, dev?.totpSecret]);

  /**
   * Demo hesabıyla tek tıkla giriş.
   *
   * İki adımlı akışın kendisi değişmez — parola doğrulanır, kod doğrulanır.
   * Yalnızca ikisi de kullanıcıdan istenmek yerine gömülü demo kimliğinden
   * üretilir. Hesap İZLEYİCİ olduğu için görebildiğinden fazlasını yapamaz.
   */
  const enterDemo = async () => {
    if (!demo) return;
    setError("");
    setBusy(true);
    try {
      const result = await startLogin(demo.email, demo.password);
      if (!demo.totpSecret) {
        throw new Error("Demo hesabının doğrulama anahtarı tanımlı değil.");
      }
      await completeLogin(result.challenge_token ?? "", await totpNow(demo.totpSecret));
      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Demo hesabına girilemedi. Sunucuya ulaşılamıyor olabilir.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await startLogin(email, password);
      setChallenge(result.challenge_token ?? "");
      if (result.totp_setup) {
        setSetupUri(result.totp_setup.provisioning_uri);
        setSetupSecret(result.totp_setup.secret);
      }
      setStep("code");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Giriş yapılamadı. Sunucuya ulaşılamıyor olabilir.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await completeLogin(challenge, code);
      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        {/* Marka */}
        <div className="mb-5 flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-lg bg-accent-solid text-[15px] font-bold text-accent-ink"
          >
            S
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight text-ink">SARNIÇ</div>
            <div className="text-[11px] text-ink-3">kağıt üstü işlem sistemi</div>
          </div>
          <StatusPill size="sm" tone="amber" className="ml-auto">
            canlı para yok
          </StatusPill>
        </div>

        {dev && (
          <Alert tone="warning" title="Form otomatik dolduruldu" className="mb-3">
            {dev.totpSecret ? "Doğrulama kodu dahil. " : ""}Bu kolaylık{" "}
            <code className="font-mono text-[12px]">NEXT_PUBLIC_AUTOFILL</code> bayrağına
            bağlıdır ve panel dışarı açılırken kaldırılmalıdır.
          </Alert>
        )}

        <Card className="p-6">
          {step === "password" ? (
            <form onSubmit={submitPassword} className="flex flex-col gap-4">
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Giriş yap</h1>
                <p className="mt-1 text-[12.5px] text-ink-2">
                  E-posta ve parolanızı girin. Ardından doğrulama kodu istenecek.
                </p>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">E-posta</span>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Parola</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={FIELD}
                />
              </label>

              {error && (
                <p className="rounded-lg bg-down-soft px-3 py-2 text-[12.5px] text-ink">{error}</p>
              )}

              <Button type="submit" variant="amber" shape="rect" disabled={busy}>
                {busy ? "Kontrol ediliyor…" : "Devam et"}
              </Button>

              {demo && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[11.5px] text-ink-3">ya da</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>

                  <div className="rounded-lg border border-line bg-elev p-3">
                    <Button
                      type="button"
                      variant="outline"
                      shape="rect"
                      className="w-full"
                      disabled={busy}
                      onClick={() => void enterDemo()}
                    >
                      {busy ? "Giriş yapılıyor…" : "Demo hesabıyla gir"}
                    </Button>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">
                      Sistemin tamamını gerçek veriyle gezebilirsiniz: havuz, puanlar,
                      pozisyonlar, backtest ve loglar.
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
                      Canlı para yoktur — tüm emirler kağıt üstü motordan geçer. Yine de
                      bu hesap botları durdurabilir ve ayarları değiştirebilir; lütfen
                      yalnızca bakın.
                    </p>
                  </div>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={submitCode} className="flex flex-col gap-4">
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Doğrulama kodu</h1>
                <p className="mt-1 text-[12.5px] text-ink-2">
                  Kimlik doğrulayıcı uygulamanızdaki altı haneli kodu girin.
                </p>
              </div>

              {setupUri && (
                <Alert tone="info" title="İki adımlı doğrulama kurulumu">
                  Kimlik doğrulayıcı uygulamanıza aşağıdaki anahtarı ekleyin, sonra ürettiği kodu
                  girin. <strong className="font-medium">Bu anahtar bir daha gösterilmeyecek.</strong>
                  <code className="mt-2 block rounded-lg bg-inset p-2 font-mono text-[11px] break-all">
                    {setupSecret}
                  </code>
                </Alert>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Kod</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                  className={`${FIELD} num text-center font-mono tracking-[0.3em]`}
                />
              </label>

              {error && (
                <p className="rounded-lg bg-down-soft px-3 py-2 text-[12.5px] text-ink">{error}</p>
              )}

              <Button
                type="submit"
                variant="amber"
                shape="rect"
                disabled={busy || code.length < 6}
              >
                {busy ? "Doğrulanıyor…" : "Giriş yap"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep("password");
                  setError("");
                }}
                className="text-[12.5px] text-ink-3 hover:text-ink-2"
              >
                Geri dön
              </button>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-3">
          Açık kayıt yok. Hesaplar yalnızca yönetici daveti ile oluşur ve iki adımlı doğrulama
          zorunludur.
        </p>
      </div>
    </div>
  );
}
