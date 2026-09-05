"use client";

/**
 * Giriş.
 *
 * Açık kayıt yoktur: hesaplar yalnızca yönetici daveti ile oluşur ve iki
 * adımlı doğrulama zorunludur. Akış iki adımlı — önce parola, sonra kod.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiShieldKeyholeLine } from "@remixicon/react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { demoCredentials, devCredentials, totpNow } from "@/lib/dev-auth";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { InputOtp } from "@/components/base/input-otp/input-otp";
import { cx } from "@/utils/cx";

export default function GirisSayfasi() {
  const router = useRouter();
  const { user, loading, startLogin, completeLogin } = useAuth();
  const dev = devCredentials();
  const demo = demoCredentials();

  const [adim, setAdim] = useState<"parola" | "kod">("parola");
  const [email, setEmail] = useState(dev?.email ?? "");
  const [parola, setParola] = useState(dev?.password ?? "");
  const [kod, setKod] = useState("");
  const [challenge, setChallenge] = useState("");
  const [kurulumAnahtari, setKurulumAnahtari] = useState<string | null>(null);
  const [hata, setHata] = useState("");
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  /* Paper modda TOTP kodu otomatik üretilir; akışın kendisi değişmez. */
  useEffect(() => {
    if (adim !== "kod" || !dev?.totpSecret) return;
    let iptal = false;
    const doldur = async () => {
      const uretilen = await totpNow(dev.totpSecret!);
      if (!iptal) setKod(uretilen);
    };
    void doldur();
    const sayac = setInterval(() => void doldur(), 5_000);
    return () => {
      iptal = true;
      clearInterval(sayac);
    };
  }, [adim, dev?.totpSecret]);

  const yakala = (e: unknown, varsayilan: string) =>
    setHata(e instanceof ApiError ? e.message : varsayilan);

  const demoGir = async () => {
    if (!demo) return;
    setHata("");
    setMesgul(true);
    try {
      const sonuc = await startLogin(demo.email, demo.password);
      if (!demo.totpSecret) throw new Error("Demo hesabının doğrulama anahtarı tanımlı değil.");
      await completeLogin(sonuc.challenge_token ?? "", await totpNow(demo.totpSecret));
      router.replace("/");
    } catch (e) {
      yakala(e, "Demo hesabına girilemedi. Sunucuya ulaşılamıyor olabilir.");
    } finally {
      setMesgul(false);
    }
  };

  const parolaGonder = async (event: React.FormEvent) => {
    event.preventDefault();
    setHata("");
    setMesgul(true);
    try {
      const sonuc = await startLogin(email, parola);
      setChallenge(sonuc.challenge_token ?? "");
      if (sonuc.totp_setup) setKurulumAnahtari(sonuc.totp_setup.secret);
      setAdim("kod");
    } catch (e) {
      yakala(e, "Giriş yapılamadı. Sunucuya ulaşılamıyor olabilir.");
    } finally {
      setMesgul(false);
    }
  };

  const kodGonder = async (event: React.FormEvent) => {
    event.preventDefault();
    setHata("");
    setMesgul(true);
    try {
      await completeLogin(challenge, kod);
      router.replace("/");
    } catch (e) {
      yakala(e, "Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin.");
    } finally {
      setMesgul(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-full p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-background-tertiary-default text-foreground-icon-secondary">
            <RiShieldKeyholeLine className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-title-3-semibold text-text-primary">HIGHWATER</p>
            <p className="text-body-2-regular text-text-tertiary">
              kontrol odası · kağıt üstü · canlı para yok
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-5">
          {adim === "parola" ? (
            <form onSubmit={parolaGonder} className="flex flex-col gap-4">
              <Input
                label="E-posta"
                type="email"
                autoComplete="username"
                value={email}
                onChange={setEmail}
                isRequired
              />
              <Input
                label="Parola"
                type="password"
                autoComplete="current-password"
                value={parola}
                onChange={setParola}
                isRequired
              />
              <Button type="submit" disabled={mesgul} className="w-full">
                {mesgul ? "doğrulanıyor…" : "Devam"}
              </Button>
            </form>
          ) : (
            <form onSubmit={kodGonder} className="flex flex-col gap-4">
              {kurulumAnahtari ? (
                <div className="rounded-2xl bg-status-yellow-background/60 p-3">
                  <p className="text-body-2-medium text-status-yellow-text">İlk kurulum</p>
                  <p className="mt-1 text-body-2-regular text-text-secondary">
                    Bu anahtarı doğrulama uygulamanıza ekleyin; bir daha gösterilmeyecek.
                  </p>
                  <p className="mt-2 font-mono text-body-2-regular break-all text-text-primary">
                    {kurulumAnahtari}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="mb-2 text-body-2-medium text-text-secondary">Altı haneli kod</p>
                <InputOtp length={6} value={kod} onChange={setKod} groupEvery={3} />
              </div>
              <Button type="submit" disabled={mesgul || kod.length < 6} className="w-full">
                {mesgul ? "doğrulanıyor…" : "Giriş"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdim("parola")}
                className="w-full"
              >
                Geri
              </Button>
            </form>
          )}

          {hata ? (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-status-rose-background/60 px-3 py-2 text-body-2-regular text-status-rose-text"
            >
              {hata}
            </div>
          ) : null}
        </div>

        {demo ? (
          <Button
            variant="secondary"
            size="small"
            onClick={demoGir}
            disabled={mesgul}
            className={cx("mt-3 w-full")}
          >
            Demo hesabıyla gir
          </Button>
        ) : null}
      </div>
    </div>
  );
}
