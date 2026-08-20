/**
 * Panel denetçisi — her sayfayı gerçek bir tarayıcıda açar, konsol hatalarını
 * ve başarısız istekleri toplar, ekran görüntüsü alır.
 *
 * Neden var: arayüz hataları (React anahtar çakışması, "Object is disposed",
 * hydration uyuşmazlığı) sunucu loglarında **görünmez**. Uçların 200 dönmesi
 * panelin çalıştığını göstermiyor — bu ders §9.11 ve §9.12'de iki kez alındı.
 *
 * Kullanım:
 *   node scripts/audit-ui.mjs [--shots] [--url http://localhost:3000]
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { totp } from "./totp.mjs";

const args = process.argv.slice(2);
const BASE = args.includes("--url") ? args[args.indexOf("--url") + 1] : "http://localhost:3000";
const SHOTS = args.includes("--shots");
const SHOT_DIR = args.includes("--out") ? args[args.indexOf("--out") + 1] : "/tmp/sarnic-ui";

const PAGES = [
  ["panel", "/"],
  ["havuz", "/havuz"],
  ["puanlar", "/puanlar"],
  ["pozisyonlar", "/pozisyonlar"],
  ["botlar", "/botlar"],
  ["bot-detay", "/botlar/1"],
  ["kalibrasyon", "/kalibrasyon"],
  ["backtest", "/backtest"],
  ["indikatorler", "/indikatorler"],
  ["terminal", "/terminal"],
  ["stratejiler", "/stratejiler"],
  ["loglar", "/loglar"],
  ["bildirimler", "/bildirimler"],
  ["sohbet", "/sohbet"],
  ["kullanicilar", "/kullanicilar"],
  ["entegrasyonlar", "/entegrasyonlar"],
  ["ayarlar", "/ayarlar"],
  ["hesap", "/hesap"],
];

/** Tarayıcıya gerçek bir oturum ver — giriş formunu doldurmak yerine jetonu enjekte et. */
async function login() {
  const post = async (path, body) => {
    const res = await fetch(`http://localhost:8000${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
    return res.json();
  };
  const stage = await post("/auth/login", {
    email: "admin@sarnic.local",
    password: "sarnic-dev-parola",
  });
  return post("/auth/2fa", {
    challenge_token: stage.challenge_token,
    code: await totp("MHH4GPRGLSUZK5XCGHEVHDZP2Y42PNV7"),
  });
}

/** Gürültü: gerçek bir kusura işaret etmeyen bilinen mesajlar. */
const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /webpack-hmr/i,
  /favicon\.ico/i,
];

const isNoise = (text) => IGNORE.some((re) => re.test(text));

/**
 * Next.js, görünür bağlantıları önceden getirir (`?_rsc=...`). Denetçi sayfayı
 * kapattığında uçuştaki bu istekler `ERR_ABORTED` ile düşer — kusur değil,
 * denetimin kendi yan etkisidir. Üretim derlemesine geçince ortaya çıktı;
 * `next dev` bu kadar agresif önceden getirmiyordu.
 *
 * Yalnızca **iptal edilmiş prefetch** susturulur: gerçek bir başarısızlık
 * (bağlantı reddi, zaman aşımı) yine raporlanır. Denetçi yanlış alarm verirse
 * onu görmezden gelmeyi öğreniriz ve var olma amacı kalmaz.
 */
const isAbortedPrefetch = (request) =>
  request.url().includes("_rsc=") && request.failure()?.errorText === "net::ERR_ABORTED";

/**
 * Sunucunun hazır olmasını bekler.
 *
 * Üretim derlemesine geçtikten sonra servis yeniden başlatıldığında panel
 * birkaç saniye ayakta olmuyor; denetçi o aralıkta koşunca 34 sahte sorun
 * raporladı. Yanlış alarm veren bir denetçi görmezden gelinmeyi öğretir.
 */
async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/giris`);
      if (res.ok) return;
    } catch {
      /* henüz ayakta değil */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`sunucu ${timeoutMs / 1000} sn içinde hazır olmadı: ${BASE}`);
}

async function main() {
  await waitForServer();
  const tokens = await login();
  await mkdir(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });

  // Panel jetonu localStorage'da tutuyor; sayfa açılmadan yerleştiriyoruz.
  await context.addInitScript((t) => {
    localStorage.setItem("sarnic.access", t.access_token);
    if (t.refresh_token) localStorage.setItem("sarnic.refresh", t.refresh_token);
  }, tokens);

  const report = [];
  for (const [name, path] of PAGES) {
    const page = await context.newPage();
    const problems = [];

    page.on("console", (msg) => {
      if (!["error", "warning"].includes(msg.type())) return;
      const text = msg.text();
      if (isNoise(text)) return;
      problems.push({ kind: msg.type(), text: text.slice(0, 300) });
    });
    page.on("pageerror", (err) => problems.push({ kind: "pageerror", text: String(err).slice(0, 300) }));
    page.on("requestfailed", (req) => {
      if (isNoise(req.url()) || isAbortedPrefetch(req)) return;
      problems.push({ kind: "requestfailed", text: `${req.method()} ${req.url()} — ${req.failure()?.errorText}` });
    });
    page.on("response", (res) => {
      if (res.status() < 400 || isNoise(res.url())) return;
      problems.push({ kind: "http", text: `${res.status()} ${res.url()}` });
    });

    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
      // Grafiklerin çizilmesi ve ilk WebSocket karesinin gelmesi için pay.
      await page.waitForTimeout(2500);
      if (SHOTS) {
        await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
      }
    } catch (error) {
      problems.push({ kind: "navigation", text: String(error).slice(0, 300) });
    }

    report.push({ name, path, problems });
    const mark = problems.length === 0 ? "✓" : "✗";
    console.log(`${mark} ${name.padEnd(14)} ${String(problems.length).padStart(2)} sorun`);
    for (const p of problems.slice(0, 6)) console.log(`      [${p.kind}] ${p.text}`);
    await page.close();
  }

  await browser.close();
  await writeFile(`${SHOT_DIR}/report.json`, JSON.stringify(report, null, 2));

  const total = report.reduce((n, r) => n + r.problems.length, 0);
  console.log(`\n${report.length} sayfa · toplam ${total} sorun`);
  if (SHOTS) console.log(`ekran görüntüleri: ${SHOT_DIR}`);
  process.exit(total === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
