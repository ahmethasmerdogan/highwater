import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * Derleme çıktısının yeri değiştirilebilir.
   *
   * `sarnic-web.service` her açılışta `.next`'e derleyip oradan servis
   * eder. Arayüz üzerinde çalışırken aynı dizine ikinci bir derleme
   * yazmak, ayakta duran paneli yarı derlenmiş bir çıktıdan servis
   * etmeye zorlar. Önizleme derlemesi `NEXT_DIST_DIR` ile ayrı bir
   * dizine alınır ve çalışan panele dokunulmaz.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Panel yalnızca FastAPI ile konuşur; Next.js'te iş mantığı ve DB yoktur.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  },
  /*
   * API aynı köken üzerinden proxy'lenir.
   *
   * Panel dışarı bir tünelle açıldığında tarayıcı `localhost:8000`'e
   * ulaşamaz — o adres ziyaretçinin kendi makinesini işaret eder. İki ayrı
   * adres açmak yerine `/api` yolunu panelin kendi sunucusu üzerinden
   * FastAPI'ye yönlendiriyoruz. Üç kazancı var:
   *
   *   1. Tek genel adres yeter; API ayrıca internete açılmaz.
   *   2. İstekler aynı kökenden gittiği için CORS ayarına dokunmak gerekmez.
   *   3. `NEXT_PUBLIC_API_URL` mutlak bir adres taşımaz, yani hangi alan
   *      adından açıldığından bağımsız çalışır.
   *
   * WebSocket bu yönlendirmeden geçmez (Next `rewrites` yükseltme yapmaz);
   * `lib/ws.tsx` göreli adresi tarayıcının konumundan mutlak `ws(s)://`
   * adresine çevirir.
   */
  async rewrites() {
    const target = process.env.SARNIC_API_ORIGIN ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },

  // Docker imajı için: bağımlılıkları da içeren tek klasörlük çıktı.
  output: "standalone",
  eslint: {
    // Lint ayrı bir CI adımıdır; derlemeyi bloklamaz.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
