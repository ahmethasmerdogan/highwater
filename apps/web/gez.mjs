import { chromium } from "playwright";
const DIZIN = "/tmp/claude-1000/-home-ahmet-Projects-Sarnic-Proje/a2752448-ad3d-4f42-aa31-9911a6f75d55/scratchpad/sok";
const tarayici = await chromium.launch();
const sayfa = await tarayici.newPage({ viewport: { width: 1560, height: 1200 } });
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(`[console] ${m.text()}`); });
sayfa.on("pageerror", (e) => hatalar.push(`[pageerror] ${e.message}`));
sayfa.on("requestfailed", (r) => hatalar.push(`[net] ${r.url()} ${r.failure()?.errorText}`));

await sayfa.goto("http://localhost:3000/giris", { waitUntil: "networkidle" });
const demo = sayfa.getByRole("button", { name: /demo hesab/i });
if (await demo.count()) { await demo.click(); } else {
  console.log("DEMO DÜĞMESİ YOK — sayfa metni:", (await sayfa.textContent("body")).slice(0, 300));
}
await sayfa.waitForURL("http://localhost:3000/", { timeout: 20000 }).catch(() => {});
await sayfa.waitForTimeout(3500);

for (const [yol, ad] of [["/kanit", "kanit"]]) {
  await sayfa.goto(`http://localhost:3000${yol}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sayfa.waitForTimeout(6000);
  await sayfa.screenshot({ path: `${DIZIN}/${ad}.png`, fullPage: true });
  const govde = await sayfa.textContent("body");
  console.log(`\n=== ${ad} (${govde.length} karakter) ===`);
  console.log(govde.replace(/\s+/g, " ").slice(0, 700));
}
console.log("\n=== HATALAR ===");
console.log(hatalar.length ? [...new Set(hatalar)].join("\n") : "yok");
await tarayici.close();
