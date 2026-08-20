/**
 * Giriş formunu otomatik doldurur — paper modda her yenilemede parola + TOTP
 * girme zahmetini ortadan kaldırır. 2FA akışının kendisi değişmez; kod yine
 * doğrulanır, yalnızca otomatik üretilir.
 *
 * ⚠ **Kapı artık `NODE_ENV` değil, açık bir bayrak:** `NEXT_PUBLIC_AUTOFILL`.
 *
 * Önceden yalnızca `development` modunda çalışıyordu ve bu, paneli sürekli
 * `next dev` ile çalıştırmayı zorunlu kılıyordu — 1,6 GB bellek ve yavaş
 * sayfalar. Bayrak ayrılınca panel üretim derlemesiyle (~150 MB) çalışabiliyor
 * ve otomatik doldurma isteğe bağlı kalıyor.
 *
 * Bayrak **açıkken** kimlik bilgileri derlemeye gömülür. Bu bilinçli bir
 * tercihtir ve yalnızca şu koşullarda kabul edilebilir: panel yerel ağa
 * kapalıdır, mod `paper`'dır ve canlı para yoktur. Paneli dışarı açarken
 * `NEXT_PUBLIC_AUTOFILL` **kaldırılmalıdır**.
 *
 * Kimlik bilgileri koda yazılmaz; `.env.local`'dan `NEXT_PUBLIC_DEV_*` ile gelir.
 */

const autofillEnabled = process.env.NEXT_PUBLIC_AUTOFILL === "1";

export interface DevCredentials {
  email: string;
  password: string;
  totpSecret: string | null;
}

export function devCredentials(): DevCredentials | null {
  if (!autofillEnabled) return null;

  const email = process.env.NEXT_PUBLIC_DEV_EMAIL;
  const password = process.env.NEXT_PUBLIC_DEV_PASSWORD;
  if (!email || !password) return null;

  return {
    email,
    password,
    totpSecret: process.env.NEXT_PUBLIC_DEV_TOTP_SECRET || null,
  };
}

/**
 * Demo hesabı — giriş ekranındaki tek tıkla giriş.
 *
 * Otomatik doldurmadan **farklıdır** ve karıştırılmamalıdır: orada yönetici
 * kimliği kazara derlemeye sızıyordu, burada herkese açık olması *amaçlanan*
 * bir hesap var.
 *
 * Bu değerlerin istemci paketinde bulunması kabul edilebilir, çünkü hesap
 * yalnızca İZLEYİCİ yetkisi taşır: API tarafındaki `RequireTrader` ve
 * `RequireAdmin` kapıları bot başlatmayı, ayar değiştirmeyi ve acil durdurmayı
 * reddeder. Buraya daha yetkili bir hesap yazmak, o kapıları anlamsız kılar.
 */
export interface DemoCredentials {
  email: string;
  password: string;
  totpSecret: string | null;
}

export function demoCredentials(): DemoCredentials | null {
  const email = process.env.NEXT_PUBLIC_DEMO_EMAIL;
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
  if (!email || !password) return null;

  return {
    email,
    password,
    totpSecret: process.env.NEXT_PUBLIC_DEMO_TOTP_SECRET || null,
  };
}

/* ------------------------------------------------------------------ */
/*  TOTP (RFC 6238) — yalnızca geliştirmede, tarayıcıda üretilir.       */
/* ------------------------------------------------------------------ */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/**
 * Verilen base32 sırdan o anki 6 haneli TOTP kodunu üretir.
 * 30 saniyelik pencere, HMAC-SHA1 — `pyotp` ile birebir uyumlu.
 */
export async function totpNow(secret: string, at: number = Date.now()): Promise<string> {
  const counter = Math.floor(at / 1000 / 30);

  const counterBytes = new Uint8Array(8);
  // JS bit işlemleri 32 bit; sayacı iki yarıya bölerek yazıyoruz.
  const view = new DataView(counterBytes.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));

  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}
