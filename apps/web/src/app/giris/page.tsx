"use client";

/**
 * Giriş.
 *
 * Açık kayıt yoktur: hesaplar yalnızca yönetici daveti ile oluşur ve iki
 * adımlı doğrulama zorunludur. Akış iki adımlı — önce parola, sonra kod.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { demoCredentials, devCredentials, totpNow } from "@/lib/dev-auth";
import { Reveal } from "uicean";
import { LogoTile } from "@/design/logo";
import { Alert, Button, FormField, Tag, TextInput, TooltipHost } from "@/design";

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
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
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
   * üretilir.
   */
  const enterDemo = async () => {
    if (!demo) return;
    setError("");
    setBusy(true);
    try {
      const result = await startLogin(demo.email, demo.password);
      if (!demo.totpSecret) throw new Error("Demo hesabının doğrulama anahtarı tanımlı değil.");
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
        setSetupSecret(result.totp_setup.secret);
        setShowSetup(true);
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
    <TooltipHost>
      <div
        className="sn-root flex min-h-screen items-center justify-center p-4"
        style={{ background: "var(--sn-bg)" }}
      >
        <Reveal className="w-full max-w-sm">
        <div className="w-full">
          <div className="mb-5 flex items-center gap-2.5">
            <LogoTile size={32} />
            <div className="min-w-0">
              <div
                className="font-semibold"
                style={{ fontSize: "var(--sn-t-title)", color: "var(--sn-ink)", letterSpacing: "0.01em" }}
              >
                SARNIÇ
              </div>
              <div style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
                kağıt üstü işlem sistemi
              </div>
            </div>
            <span className="ml-auto">
              <Tag tone="brand">canlı para yok</Tag>
            </span>
          </div>

          {dev && (
            <div className="mb-3">
              <Alert tone="warn" title="Form otomatik dolduruldu">
                {dev.totpSecret ? "Doğrulama kodu dahil. " : ""}Bu kolaylık{" "}
                <span className="sn-num">NEXT_PUBLIC_AUTOFILL</span> bayrağına bağlıdır ve panel
                dışarı açılırken kaldırılmalıdır.
              </Alert>
            </div>
          )}

          <div
            className="rounded-[var(--sn-r-lg)] p-6"
            style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
          >
            {step === "password" ? (
              <form onSubmit={submitPassword} className="flex flex-col gap-4">
                <div>
                  <h1
                    className="font-semibold"
                    style={{ fontSize: "var(--sn-t-title)", color: "var(--sn-ink)" }}
                  >
                    Giriş yap
                  </h1>
                  <p
                    className="mt-1"
                    style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
                  >
                    E-posta ve parolanızı girin. Ardından doğrulama kodu istenecek.
                  </p>
                </div>

                <FormField label="E-posta">
                  <TextInput
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-10"
                  />
                </FormField>

                <FormField label="Parola">
                  <TextInput
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-10"
                  />
                </FormField>

                {error && <Alert tone="down">{error}</Alert>}

                <Button type="submit" variant="primary" disabled={busy} className="h-10">
                  {busy ? "Kontrol ediliyor…" : "Devam et"}
                </Button>

                {demo && (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1" style={{ background: "var(--sn-hairline)" }} />
                      <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
                        ya da
                      </span>
                      <span className="h-px flex-1" style={{ background: "var(--sn-hairline)" }} />
                    </div>

                    <div
                      className="rounded-[var(--sn-r-sm)] p-3"
                      style={{ background: "var(--sn-raised)", border: "1px solid var(--sn-hairline)" }}
                    >
                      <Button
                        type="button"
                        variant="neutral"
                        className="h-10 w-full"
                        disabled={busy}
                        onClick={() => void enterDemo()}
                      >
                        {busy ? "Giriş yapılıyor…" : "Demo hesabıyla gir"}
                      </Button>
                      <p
                        className="mt-2"
                        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}
                      >
                        Sistemin tamamını gerçek veriyle gezebilirsiniz: havuz, puanlar,
                        pozisyonlar, backtest ve loglar.
                      </p>
                      <p
                        className="mt-1"
                        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}
                      >
                        Canlı para yoktur — tüm emirler kağıt üstü motordan geçer. Yine de bu
                        hesap botları durdurabilir ve ayarları değiştirebilir; lütfen yalnızca
                        bakın.
                      </p>
                    </div>
                  </>
                )}
              </form>
            ) : (
              <form onSubmit={submitCode} className="flex flex-col gap-4">
                <div>
                  <h1
                    className="font-semibold"
                    style={{ fontSize: "var(--sn-t-title)", color: "var(--sn-ink)" }}
                  >
                    Doğrulama kodu
                  </h1>
                  <p
                    className="mt-1"
                    style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
                  >
                    Kimlik doğrulayıcı uygulamanızdaki altı haneli kodu girin.
                  </p>
                </div>

                {showSetup && setupSecret && (
                  <Alert tone="info" title="İki adımlı doğrulama kurulumu">
                    Kimlik doğrulayıcı uygulamanıza aşağıdaki anahtarı ekleyin, sonra ürettiği
                    kodu girin.{" "}
                    <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>
                      Bu anahtar bir daha gösterilmeyecek.
                    </strong>
                    <span
                      className="sn-num mt-2 block rounded-[var(--sn-r-xs)] p-2 break-all"
                      style={{ background: "var(--sn-sunken)", fontSize: "var(--sn-t-micro)" }}
                    >
                      {setupSecret}
                    </span>
                  </Alert>
                )}

                <FormField label="Kod">
                  <TextInput
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    required
                    autoFocus
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="000000"
                    className="sn-num h-10 text-center"
                    style={{ letterSpacing: "0.3em", textAlign: "center" }}
                  />
                </FormField>

                {error && <Alert tone="down">{error}</Alert>}

                <Button
                  type="submit"
                  variant="primary"
                  className="h-10"
                  disabled={busy || code.length < 6}
                >
                  {busy ? "Doğrulanıyor…" : "Giriş yap"}
                </Button>

                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    setStep("password");
                    setError("");
                  }}
                >
                  Geri dön
                </Button>
              </form>
            )}
          </div>

          <p
            className="mt-4 text-center"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}
          >
            Açık kayıt yok. Hesaplar yalnızca yönetici daveti ile oluşur ve iki adımlı doğrulama
            zorunludur.
          </p>
        </div>
        </Reveal>
      </div>
    </TooltipHost>
  );
}
