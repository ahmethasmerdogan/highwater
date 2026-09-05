"use client";

/**
 * Giriş.
 *
 * Açık kayıt yoktur: hesaplar yalnızca yönetici daveti ile oluşur ve iki
 * adımlı doğrulama zorunludur. Akış iki adımlı — önce parola, sonra kod.
 *
 * v4 dili burada da geçerli: tek renk vurgusu hata için ayrılmıştır, sayılar
 * mono, metin serif değil sans (bu bir muhakeme değil bir form).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { demoCredentials, devCredentials, totpNow } from "@/lib/dev-auth";

const KUTU: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  border: "1px solid var(--v4-cizgi-koyu)",
  borderRadius: 2,
  background: "var(--v4-kagit)",
  fontFamily: "var(--v4-mono)",
  fontSize: "var(--v4-olcum)",
  color: "var(--v4-murekkep)",
};

const DUGME: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--v4-murekkep)",
  borderRadius: 2,
  background: "var(--v4-murekkep)",
  color: "var(--v4-kagit)",
  fontSize: 12,
  letterSpacing: "0.04em",
  transition: "opacity var(--v4-gecis)",
};

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
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--v4-zemin)" }}
    >
      <div className="w-full" style={{ maxWidth: 340 }}>
        <div className="v4-etiket" style={{ color: "var(--v4-murekkep)", letterSpacing: "0.16em" }}>
          HIGHWATER
        </div>
        <p className="v4-kunye" style={{ marginTop: 4 }}>
          kontrol odası · kağıt üstü · canlı para yok
        </p>

        <div className="v4-bolum" style={{ marginTop: 14, padding: 16 }}>
          {adim === "parola" ? (
            <form onSubmit={parolaGonder} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="v4-etiket">e-posta</span>
                <input
                  style={KUTU}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="v4-etiket">parola</span>
                <input
                  style={KUTU}
                  type="password"
                  autoComplete="current-password"
                  value={parola}
                  onChange={(e) => setParola(e.target.value)}
                  required
                />
              </label>
              <button type="submit" style={{ ...DUGME, opacity: mesgul ? 0.5 : 1 }} disabled={mesgul}>
                {mesgul ? "doğrulanıyor…" : "devam"}
              </button>
            </form>
          ) : (
            <form onSubmit={kodGonder} className="flex flex-col gap-3">
              {kurulumAnahtari ? (
                <div style={{ background: "var(--v4-amber-zemin)", padding: 10, borderRadius: 2 }}>
                  <div className="v4-etiket" style={{ color: "var(--v4-amber)" }}>
                    ilk kurulum
                  </div>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    Bu anahtarı doğrulama uygulamanıza ekleyin; bir daha gösterilmeyecek.
                  </p>
                  <div className="v4-olcum" style={{ marginTop: 6, wordBreak: "break-all" }}>
                    {kurulumAnahtari}
                  </div>
                </div>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="v4-etiket">altı haneli kod</span>
                <input
                  style={{ ...KUTU, letterSpacing: "0.3em", textAlign: "center" }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={kod}
                  onChange={(e) => setKod(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </label>
              <button type="submit" style={{ ...DUGME, opacity: mesgul ? 0.5 : 1 }} disabled={mesgul}>
                {mesgul ? "doğrulanıyor…" : "giriş"}
              </button>
              <button
                type="button"
                onClick={() => setAdim("parola")}
                className="v4-kunye"
                style={{ background: "none", border: 0, textAlign: "center" }}
              >
                geri
              </button>
            </form>
          )}

          {hata ? (
            <div
              style={{
                marginTop: 12,
                padding: "7px 9px",
                borderRadius: 2,
                background: "var(--v4-kirmizi-zemin)",
                color: "var(--v4-kirmizi)",
                fontSize: 12,
              }}
              role="alert"
            >
              {hata}
            </div>
          ) : null}
        </div>

        {demo ? (
          <button
            type="button"
            onClick={demoGir}
            disabled={mesgul}
            className="v4-kunye"
            style={{
              marginTop: 10,
              width: "100%",
              padding: "5px 8px",
              border: "1px solid var(--v4-cizgi-koyu)",
              borderRadius: 2,
              background: "var(--v4-kagit)",
            }}
          >
            demo hesabıyla gir
          </button>
        ) : null}
      </div>
    </div>
  );
}
