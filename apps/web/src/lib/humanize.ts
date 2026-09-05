/**
 * Makine dilini insan diline çeviren katman.
 *
 * Motor loglarını `universe_input_unavailable` gibi sabit kodlarla yazar ve
 * olayların yükünü ham JSON olarak taşır. Bu doğrudur — makineye makine
 * konuşmalıdır. Ama panelde bunu olduğu gibi göstermek, kullanıcıyı kaynak
 * kodu okumaya zorlar.
 *
 * Bu dosya tek çeviri noktasıdır: kod → başlık, açıklama, kategori, önem ve
 * (varsa) ne yapılması gerektiği. Karşılığı olmayan bir kod geldiğinde
 * uydurmaz — kodu okunur hâle getirip olduğu gibi gösterir, böylece yeni bir
 * kod eklendiğinde panel bozulmaz, sadece o satır sade görünür.
 */

import { GLOSSARY } from "./glossary";

/* ------------------------------------------------------------------ */
/*  Kategoriler                                                        */
/* ------------------------------------------------------------------ */

export type LogCategory =
  | "havuz"
  | "puanlama"
  | "islem"
  | "risk"
  | "veri"
  | "baglanti"
  | "bot"
  | "sistem";

export const CATEGORY_LABEL: Record<LogCategory, string> = {
  havuz: "Havuz",
  puanlama: "Puanlama",
  islem: "İşlem",
  risk: "Risk",
  veri: "Veri",
  baglanti: "Bağlantı",
  bot: "Bot",
  sistem: "Sistem",
};

/** Kategori açıklamaları — log sayfasındaki süzgeç ipuçları. */
export const CATEGORY_HINT: Record<LogCategory, string> = {
  havuz: "Havuzun kurulması, yenilenmesi ve içeriğinin değişmesi.",
  puanlama: "Coinlerin puanlanması ve puan gözlemlerinin kaydı.",
  islem: "Pozisyon açılışı, kapanışı ve emirlerin akıbeti.",
  risk: "Devre kesiciler, giriş yasakları ve acil durdurma.",
  veri: "Piyasa verisinin çekilmesi, boşluklar ve kalite denetimi.",
  baglanti: "Borsa bağlantısı, hız sınırı ve yeniden bağlanma.",
  bot: "Bot süreçlerinin başlaması, durması ve çökmesi.",
  sistem: "Servislerin açılıp kapanması ve genel işleyiş.",
};

export type Severity = "info" | "success" | "warn" | "error";

export interface HumanEntry {
  /** Tek satırlık okunur başlık. */
  title: string;
  /** Ne olduğunu ve neden önemli olduğunu anlatan cümle. */
  detail?: string;
  /** Kullanıcı ne yapmalı — yalnızca eylem gerektiren durumlarda. */
  action?: string;
  category: LogCategory;
  severity: Severity;
  /** Açıklaması sözlükte olan ilgili terim. */
  term?: string;
}

/* ------------------------------------------------------------------ */
/*  Motor log kodları                                                  */
/*                                                                     */
/*  Kaynak: `grep -rhoP 'log\.(info|warning|error)\("\K[a-z_.]+'        */
/*  apps/engine/sarnic/ — kod eklendikçe buraya karşılığı yazılır.      */
/* ------------------------------------------------------------------ */

type LogSpec = Omit<HumanEntry, "title"> & { title: string };

const LOG_CODES: Record<string, LogSpec> = {
  /* --- Havuz ----------------------------------------------------- */
  universe_unchanged: {
    title: "Havuz değişmedi",
    detail:
      "Filtre zinciri yeniden çalıştı ve aynı listeyi üretti. Yeni fotoğraf yazılmadı — değişmeyen bir havuzu tekrar kaydetmek kaydı şişirir.",
    category: "havuz",
    severity: "info",
    term: "havuz",
  },
  universe_input_unavailable: {
    title: "Havuz kurulamadı — girdi yok",
    detail:
      "Filtreleri besleyecek piyasa verisi gelmediği için havuz yenilenemedi. Önceki havuz yürürlükte kalıyor; boş bir liste yazılmıyor.",
    action:
      "Tekrarlıyorsa Veri sekmesinden piyasa verisi servisinin ayakta olup olmadığına bakın.",
    category: "havuz",
    severity: "error",
    term: "havuz",
  },
  universe_no_tickers: {
    title: "Borsadan fiyat listesi gelmedi",
    detail: "Havuz adaylarını çıkarmak için gereken özet fiyat listesi boş döndü.",
    category: "havuz",
    severity: "warn",
    term: "havuz",
  },
  universe_config_overridden: {
    title: "Havuz ayarları veritabanından okundu",
    detail:
      "Filtre eşikleri Ayarlar sayfasında değiştirilmiş; bu yenilemede dosyadaki varsayılanlar yerine o değerler kullanıldı.",
    category: "havuz",
    severity: "info",
    term: "havuz",
  },
  clusters_computed: {
    title: "Korelasyon kümeleri yeniden hesaplandı",
    detail:
      "Birlikte hareket eden coinler gruplandı. Aynı gruba açılan toplam pozisyon bir üst sınırla kısıtlanır.",
    category: "havuz",
    severity: "info",
    term: "kume",
  },

  /* --- Puanlama --------------------------------------------------- */
  observations_written: {
    title: "Puan gözlemleri kaydedildi",
    detail:
      "Hesaplanan puanlar ileri getirilerle eşleştirilmek üzere yazıldı. Kalibrasyon sayfası bu kayıtlardan beslenir.",
    category: "puanlama",
    severity: "info",
    term: "kalibrasyon",
  },

  /* --- İşlem ------------------------------------------------------ */
  paper_rejected: {
    title: "Emir reddedildi",
    detail:
      "Kağıt motoru emri kabul etmedi. Sebep genellikle yetersiz nakit, asgari emir büyüklüğünün altında kalma veya emir defterinde yeterli derinlik bulunmamasıdır.",
    category: "islem",
    severity: "warn",
    term: "kagit_uzeri",
  },

  /* --- Risk ------------------------------------------------------- */
  data_stale: {
    title: "Piyasa verisi bayatladı",
    detail:
      "Veri belirlenen süredir yenilenmiyor. Eski fiyatla karar almak kör işlem olacağı için yeni giriş yapılmıyor.",
    action: "Kısa sürelisi normaldir. Sürüyorsa veri akışında gerçek bir sorun vardır.",
    category: "risk",
    severity: "warn",
    term: "ck_stale_data",
  },
  stale_recovered: {
    title: "Veri akışı normale döndü",
    detail: "Bayat veri uyarısı kalktı, kararlar yeniden alınıyor.",
    category: "risk",
    severity: "success",
    term: "ck_stale_data",
  },
  regime_reference_insufficient: {
    title: "Rejim ölçümü için referans veri yetersiz",
    detail:
      "Piyasanın genel yönünü belirleyen referans sembolün geçmişi hesap için kısa kaldı. Rejim çarpanı bu turda uygulanmadı.",
    category: "risk",
    severity: "warn",
    term: "referans_sembol",
  },

  /* --- Veri ------------------------------------------------------- */
  gaps_repaired: {
    title: "Veri boşlukları dolduruldu",
    detail: "Eksik mumlar borsadan yeniden çekilip kaydedildi.",
    category: "veri",
    severity: "success",
    term: "bosluk",
  },
  gap_repair_failed: {
    title: "Veri boşluğu doldurulamadı",
    detail:
      "Eksik mumları çekme denemesi başarısız oldu. Boşluk açık kalıyor ve bir sonraki denetimde yeniden denenecek.",
    category: "veri",
    severity: "error",
    term: "bosluk",
  },
  quality_gaps_closed: {
    title: "Kalite bulguları kapatıldı",
    detail: "Daha önce açılan veri boşluğu kayıtları giderildiği için kapatıldı.",
    category: "veri",
    severity: "success",
  },
  backfill_failed: {
    title: "Geçmiş veri dolgusu başarısız",
    detail: "Arşivden geçmiş mumların indirilmesi tamamlanamadı.",
    category: "veri",
    severity: "error",
  },
  backfill_rest_failed: {
    title: "Geçmiş veri isteği başarısız",
    detail: "Borsadan geçmiş mum isteği hata döndürdü.",
    category: "veri",
    severity: "error",
  },
  backfill_aborted_ip_ban: {
    title: "Dolgu durduruldu — IP engeli",
    detail:
      "Borsa hız sınırı nedeniyle erişimi engelledi; geçmiş veri dolgusu güvenlik için durduruldu.",
    action: "Engel kalkana kadar bekleyin. Sık tekrarlıyorsa istek yoğunluğu fazladır.",
    category: "veri",
    severity: "error",
    term: "ck_ip_ban",
  },
  archive_fetch_failed: {
    title: "Arşiv dosyası indirilemedi",
    category: "veri",
    severity: "warn",
  },
  archive_bad_status: {
    title: "Arşiv beklenmeyen yanıt döndürdü",
    category: "veri",
    severity: "warn",
  },
  archive_parse_failed: {
    title: "Arşiv dosyası okunamadı",
    detail: "İndirilen dosyanın içeriği beklenen biçimde değil.",
    category: "veri",
    severity: "warn",
  },
  spread_sampled: {
    title: "Spread ölçümü alındı",
    detail:
      "Gerçek emir defterinden alış-satış farkı örneklendi. Maliyet hesabındaki tek ölçülmüş (varsayılmamış) girdi budur.",
    category: "veri",
    severity: "info",
    term: "spread",
  },
  spread_samples_pruned: {
    title: "Eski spread ölçümleri temizlendi",
    category: "veri",
    severity: "info",
  },
  exchange_info_refreshed: {
    title: "Borsa kuralları yenilendi",
    detail:
      "İşlem çiftlerinin asgari emir büyüklüğü, fiyat adımı ve işlem durumu borsadan güncellendi.",
    category: "veri",
    severity: "info",
  },
  book_ticker_failed: {
    title: "Emir defteri özeti alınamadı",
    category: "veri",
    severity: "warn",
  },

  /* --- Bağlantı --------------------------------------------------- */
  ws_connected: {
    title: "Canlı veri bağlantısı kuruldu",
    category: "baglanti",
    severity: "success",
  },
  ws_disconnected: {
    title: "Canlı veri bağlantısı koptu",
    detail: "Yeniden bağlanılıyor. Bu sırada veri REST üzerinden yedeklenir.",
    category: "baglanti",
    severity: "warn",
  },
  ws_client_error: {
    title: "Canlı veri bağlantısında hata",
    category: "baglanti",
    severity: "error",
  },
  ticker_stream_recovered: {
    title: "Fiyat akışı normale döndü",
    category: "baglanti",
    severity: "success",
  },
  ticker_fallback_failed: {
    title: "Fiyat akışı yedeği de başarısız",
    detail:
      "Canlı akış sessiz kaldığı için devreye giren yedek istek de hata döndürdü. Fiyatlar bu turda güncellenmedi.",
    category: "baglanti",
    severity: "error",
  },
  binance_http_retry: {
    title: "Borsa isteği yeniden deneniyor",
    detail: "Geçici bir hata alındı; istek kısa bir bekleme sonrası tekrarlanıyor.",
    category: "baglanti",
    severity: "info",
  },
  binance_ip_banned: {
    title: "Borsa erişimi engellendi",
    detail:
      "Hız sınırı aşıldığı için borsa bu IP'yi geçici olarak engelledi. Engel kalkana kadar hiçbir istek gönderilmiyor.",
    action: "Engel süresi dolana kadar beklenir. Tekrarlıyorsa istek yoğunluğu düşürülmelidir.",
    category: "baglanti",
    severity: "error",
    term: "ck_ip_ban",
  },
  rate_limit_: {
    title: "Hız sınırı yönetimi",
    detail: "İstek bütçesi korunuyor; gerekirse istekler bekletiliyor.",
    category: "baglanti",
    severity: "info",
    term: "agirlik",
  },

  /* --- Bot -------------------------------------------------------- */
  worker_spawned: {
    title: "Bot süreci başlatıldı",
    category: "bot",
    severity: "success",
    term: "bot",
  },
  worker_starting: {
    title: "Bot başlatılıyor",
    category: "bot",
    severity: "info",
    term: "bot",
  },
  worker_exited: {
    title: "Bot süreci sonlandı",
    category: "bot",
    severity: "warn",
    term: "bot",
  },
  worker_terminated: {
    title: "Bot süreci durduruldu",
    category: "bot",
    severity: "info",
    term: "bot",
  },
  worker_restarting: {
    title: "Bot yeniden başlatılıyor",
    detail: "Süreç beklenmedik biçimde sonlandığı için süpervizör onu yeniden ayağa kaldırıyor.",
    category: "bot",
    severity: "warn",
    term: "bot",
  },
  worker_restart_storm: {
    title: "Bot sürekli yeniden başlıyor",
    detail:
      "Kısa aralıklarla tekrar tekrar çöküyor. Süpervizör yeniden başlatmayı durdurdu; kalıcı bir hata var.",
    action: "Bot detayındaki olay kayıtlarından çökme sebebine bakın.",
    category: "bot",
    severity: "error",
    term: "bot",
  },

  /* --- Sistem ----------------------------------------------------- */
  api_starting: { title: "API servisi başlıyor", category: "sistem", severity: "info" },
  api_stopped: { title: "API servisi durdu", category: "sistem", severity: "warn" },
  marketdata_started: {
    title: "Piyasa verisi servisi başladı",
    category: "sistem",
    severity: "success",
  },
  marketdata_stopped: {
    title: "Piyasa verisi servisi durdu",
    detail: "Bu servis durduğunda hiçbir bot yeni veri alamaz.",
    category: "sistem",
    severity: "warn",
  },
  supervisor_starting: { title: "Bot süpervizörü başlıyor", category: "sistem", severity: "info" },
  supervisor_stopping: { title: "Bot süpervizörü duruyor", category: "sistem", severity: "warn" },
  notifier_started: { title: "Bildirim servisi başladı", category: "sistem", severity: "info" },
  settings_group_not_a_dict: {
    title: "Ayar kaydı bozuk",
    detail: "Bir ayar grubu beklenen biçimde değil; o grup yok sayıldı ve varsayılanlar kullanıldı.",
    category: "sistem",
    severity: "warn",
  },

  /* --- Olay veriyolu ---------------------------------------------- */
  event_publish_failed: {
    title: "Olay yayınlanamadı",
    detail:
      "Olay veriyoluna yazılamadı. İşlem motoru bundan etkilenmez ama panel ve bildirimler bu olayı görmez.",
    category: "sistem",
    severity: "warn",
  },
  event_read_failed: {
    title: "Olay okunamadı",
    category: "sistem",
    severity: "warn",
  },
  event_decode_failed: {
    title: "Olay çözümlenemedi",
    detail: "Veriyolundan gelen bir kayıt beklenen biçimde değildi ve atlandı.",
    category: "sistem",
    severity: "warn",
  },
  event_history_failed: {
    title: "Olay geçmişi okunamadı",
    category: "sistem",
    severity: "warn",
  },

  /* --- Bildirim --------------------------------------------------- */
  discord_send_failed: {
    title: "Discord mesajı gönderilemedi",
    action: "Entegrasyonlar sayfasından webhook adresini test edin.",
    category: "sistem",
    severity: "warn",
  },
  discord_bad_status: {
    title: "Discord beklenmeyen yanıt döndürdü",
    category: "sistem",
    severity: "warn",
  },
  discord_rate_limited: {
    title: "Discord hız sınırı",
    detail: "Çok sık mesaj gönderildiği için bekleniyor.",
    category: "sistem",
    severity: "info",
  },
  discord_config_decrypt_failed: {
    title: "Discord ayarı çözülemedi",
    detail: "Kayıtlı webhook adresi okunamadı; şifreleme anahtarı değişmiş olabilir.",
    action: "Entegrasyonlar sayfasından webhook adreslerini yeniden kaydedin.",
    category: "sistem",
    severity: "error",
  },
  benchmark_insufficient_symbols: {
    title: "Kıyas için yeterli sembol yok",
    detail: "Karşılaştırma sepeti kurulamadığı için kıyas eğrisi bu turda hesaplanmadı.",
    category: "sistem",
    severity: "info",
    term: "kiyas",
  },
};

/* ------------------------------------------------------------------ */
/*  Olay tipleri (Redis Streams / bot olayları)                        */
/* ------------------------------------------------------------------ */

const EVENT_KINDS: Record<string, LogSpec> = {
  "pool.updated": {
    title: "Havuz güncellendi",
    detail: "Filtre zinciri yeniden çalıştı ve havuzun içeriği değişti.",
    category: "havuz",
    severity: "info",
    term: "havuz",
  },
  "scores.updated": {
    title: "Puanlar yenilendi",
    detail: "Karar barı kapandı ve havuzdaki coinler yeniden puanlandı.",
    category: "puanlama",
    severity: "info",
    term: "puan",
  },
  "score.threshold_crossed": {
    title: "Puan eşiği aşıldı",
    detail: "Bir coinin puanı giriş eşiğinin üstüne çıktı; aday listesine girdi.",
    category: "puanlama",
    severity: "info",
    term: "puan",
  },
  "position.opened": {
    title: "Pozisyon açıldı",
    category: "islem",
    severity: "success",
  },
  "position.closed": {
    title: "Pozisyon kapandı",
    category: "islem",
    severity: "info",
    term: "cikis_sebebi",
  },
  "order.submitted": {
    title: "Emir gönderildi",
    category: "islem",
    severity: "info",
  },
  "order.rejected": {
    title: "Emir reddedildi",
    detail: "Emir yürütme katmanı tarafından kabul edilmedi.",
    category: "islem",
    severity: "warn",
  },
  "risk.circuit_breaker": {
    title: "Devre kesici tetiklendi",
    detail:
      "Bir risk sınırı aşıldı ve sistem kendini frenledi. Bu bir arıza değil, tasarlanmış bir korumadır.",
    category: "risk",
    severity: "warn",
    term: "devre_kesici",
  },
  "bot.state_changed": {
    title: "Bot durumu değişti",
    category: "bot",
    severity: "info",
    term: "bot_durum",
  },
  "bot.heartbeat": {
    title: "Bot yaşam sinyali",
    category: "bot",
    severity: "info",
    term: "heartbeat",
  },
  "data.stale": {
    title: "Veri bayatladı",
    category: "risk",
    severity: "warn",
    term: "ck_stale_data",
  },
  "api.banned": {
    title: "Borsa erişimi engellendi",
    category: "baglanti",
    severity: "error",
    term: "ck_ip_ban",
  },
  "backtest.finished": {
    title: "Geçmişe dönük test bitti",
    category: "sistem",
    severity: "success",
    term: "backtest",
  },
  "chat.message": { title: "Yeni mesaj", category: "sistem", severity: "info" },
  log: { title: "Kayıt", category: "sistem", severity: "info" },
  "worker.spawned": {
    title: "Bot süreci başlatıldı",
    category: "bot",
    severity: "success",
    term: "bot",
  },
  "worker.restart": {
    title: "Bot yeniden başlatıldı",
    category: "bot",
    severity: "warn",
    term: "bot",
  },
};

/* ------------------------------------------------------------------ */
/*  Sabit sözlükler                                                    */
/* ------------------------------------------------------------------ */

export const CIRCUIT_BREAKER_LABEL: Record<string, string> = {
  DAILY_LOSS: "Günlük zarar sınırı",
  WEEKLY_LOSS: "Haftalık zarar sınırı",
  MAX_DRAWDOWN: "Azami düşüş sınırı",
  CONSECUTIVE_LOSSES: "Üst üste zarar",
  STALE_DATA: "Bayat veri",
  API_ERROR_RATE: "API hata oranı",
  IP_BAN: "IP engeli",
  KILL_SWITCH: "Acil durdurma",
};

/** Devre kesici adının sözlükteki terim karşılığı. */
export const CIRCUIT_BREAKER_TERM: Record<string, string> = {
  DAILY_LOSS: "ck_daily_loss",
  WEEKLY_LOSS: "ck_weekly_loss",
  MAX_DRAWDOWN: "ck_max_drawdown",
  CONSECUTIVE_LOSSES: "ck_consecutive_losses",
  STALE_DATA: "ck_stale_data",
  API_ERROR_RATE: "ck_api_error_rate",
  IP_BAN: "ck_ip_ban",
  KILL_SWITCH: "kill_switch",
};

export const EXIT_REASON_LABEL: Record<string, string> = {
  STOP: "Stop tetiklendi",
  BREAKEVEN: "Başabaşta kapandı",
  TRAILING: "İz süren stop",
  SCORE: "Puan düştü",
  TIME: "Süre doldu",
  ROTATION: "Rotasyon",
  KILL_SWITCH: "Acil durdurma",
  DELIST: "Listeden çıktı",
  MANUAL: "Elle kapatıldı",
};

/** Çıkış sebebinin tek cümlelik açıklaması. */
export const EXIT_REASON_HINT: Record<string, string> = {
  STOP: "Fiyat zarar durdurma seviyesine değdi ve pozisyon kapatıldı.",
  BREAKEVEN: "Korumaya çekilmiş stop tetiklendi; işlem kabaca başabaş kapandı.",
  TRAILING: "Fiyatı takip eden stop tetiklendi ve kârın bir kısmı kilitlendi.",
  SCORE: "Coinin puanı elde tutma eşiğinin altına düştüğü için çıkıldı.",
  TIME: "Pozisyon için tanınan azami süre doldu.",
  ROTATION: "Daha yüksek puanlı bir aday için yer açıldı.",
  KILL_SWITCH: "Acil durdurma tüm pozisyonları kapattı.",
  DELIST: "Coin borsadan kaldırıldığı için pozisyon kapatıldı.",
  MANUAL: "Pozisyon kullanıcı tarafından kapatıldı.",
};

export const BOT_STATE_LABEL: Record<string, string> = {
  DRAFT: "Taslak",
  PAPER_RUNNING: "Çalışıyor",
  PAUSED: "Duraklatıldı",
  STOPPED: "Durduruldu",
  ERROR: "Hata",
  DEGRADED: "Kısıtlı",
};

export const BOT_STATE_HINT: Record<string, string> = {
  DRAFT: "Kurulmuş ama henüz hiç başlatılmamış.",
  PAPER_RUNNING: "Kararlarını alıyor ve yeni pozisyon açabilir.",
  PAUSED: "Açık pozisyonlar yönetiliyor, yeni giriş yapılmıyor.",
  STOPPED: "Çalışmıyor. Elle veya bir devre kesici tarafından durdurulmuş.",
  ERROR: "Beklenmeyen bir hatayla karşılaştı; müdahale gerekiyor.",
  DEGRADED: "Çalışıyor ama bir devre kesici nedeniyle yeni giriş yapmıyor.",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  NEW: "Yeni",
  PARTIALLY_FILLED: "Kısmen doldu",
  FILLED: "Doldu",
  CANCELED: "İptal edildi",
  REJECTED: "Reddedildi",
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Yönetici",
  TRADER: "İşlemci",
  VIEWER: "İzleyici",
};

export const ROLE_HINT: Record<string, string> = {
  ADMIN: "Her şeyi yapabilir: kullanıcı yönetimi, ayarlar, entegrasyonlar, acil durdurma.",
  TRADER: "Bot ve strateji yönetir, işlem açar. Yönetim sayfalarını göremez.",
  VIEWER: "Yalnızca görüntüler. Hiçbir şeyi değiştiremez.",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Bilgi",
  success: "Tamam",
  warn: "Uyarı",
  error: "Hata",
};

/** Emir reddi sebeplerinin okunur karşılığı. */
const REJECT_REASONS: Record<string, string> = {
  INSUFFICIENT_CASH: "Nakit yetersiz",
  MIN_NOTIONAL: "Emir asgari büyüklüğün altında",
  LOT_SIZE: "Emir miktarı borsa adımına uymuyor",
  NO_LIQUIDITY: "Emir defterinde yeterli derinlik yok",
  NO_BOOK: "Emir defteri anlık görüntüsü yok",
  MAX_POSITION: "Tek pozisyon üst sınırı",
  MAX_EXPOSURE: "Toplam maruziyet üst sınırı",
  CLUSTER_LIMIT: "Korelasyon kümesi üst sınırı",
  ENTRIES_BLOCKED: "Devre kesici girişleri kapatmış",
  STALE_PRICE: "Fiyat bayat",
};

export function rejectReason(code: string | null | undefined): string {
  if (!code) return "Sebep belirtilmemiş";
  return REJECT_REASONS[code] ?? readableCode(code);
}

/* ------------------------------------------------------------------ */
/*  Ana çeviriciler                                                    */
/* ------------------------------------------------------------------ */

/**
 * Bilinmeyen bir kodu okunur hâle getirir:
 * `worker_restart_storm` → `Worker restart storm`
 *
 * Uydurma yapmaz — karşılığı yoksa kodu insan gözüne yakışır biçimde basar.
 */
/** Puan düzeltme anahtarları — motor İngilizce yazar, panel Türkçe basar. */
export const MODIFIER_LABELS: Record<string, string> = {
  pattern: "Formasyon",
  candle: "Mum",
  crowding: "Kalabalıklaşma",
};

export function readableCode(code: string): string {
  const text = code.replace(/[._]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Motor log satırını insan diline çevirir.
 *
 * Motor bazen mesajı zaten Türkçe yazar (bot kararları böyledir); o zaman
 * kodun karşılığı başlık olur, motorun cümlesi ayrıntı olarak durur.
 */
export function humanizeLog(
  rawMessage: string,
  level?: string | null,
  payload?: Record<string, unknown> | null,
): HumanEntry {
  const code = extractCode(rawMessage);
  const spec = code ? LOG_CODES[code] : undefined;
  const severity = spec?.severity ?? severityFromLevel(level);

  if (!spec) {
    // Karşılığı yok: motorun kendi cümlesi zaten okunur olabilir.
    return {
      title: rawMessage || "Kayıt",
      category: guessCategory(rawMessage, payload),
      severity,
    };
  }

  // Motorun cümlesi kodun kendisinden farklıysa ayrıntı olarak taşınır.
  const extra = rawMessage && rawMessage !== code ? rawMessage : "";
  return {
    ...spec,
    severity,
    detail: spec.detail ?? (extra || undefined),
  };
}

/** Olay tipini (`position.opened`) insan diline çevirir. */
export function humanizeEvent(
  kind: string,
  level?: string | null,
  payload?: Record<string, unknown> | null,
): HumanEntry {
  const spec = EVENT_KINDS[kind];
  const severity = spec?.severity ?? severityFromLevel(level);

  if (!spec) {
    return {
      title: readableCode(kind),
      category: guessCategory(kind, payload),
      severity,
    };
  }

  // Devre kesici olayında hangi kesicinin tetiklendiği başlığa girer.
  if (kind === "risk.circuit_breaker" && payload) {
    const breaker = String(payload.breaker ?? payload.kind ?? "");
    const label = CIRCUIT_BREAKER_LABEL[breaker];
    if (label) {
      return {
        ...spec,
        severity,
        title: `Devre kesici: ${label}`,
        term: CIRCUIT_BREAKER_TERM[breaker] ?? spec.term,
      };
    }
  }

  // Pozisyon kapanışında çıkış sebebi başlığa girer.
  if (kind === "position.closed" && payload) {
    const reason = String(payload.reason ?? "");
    const label = EXIT_REASON_LABEL[reason];
    if (label) {
      return {
        ...spec,
        severity: Number(payload.pnl ?? 0) >= 0 ? "success" : "warn",
        title: `Pozisyon kapandı — ${label.toLocaleLowerCase("tr")}`,
        detail: EXIT_REASON_HINT[reason],
      };
    }
  }

  return { ...spec, severity };
}

/** Bildirim kaydını insan diline çevirir. */
export function humanizeNotification(n: {
  kind: string;
  level: string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
}): HumanEntry {
  const base = humanizeEvent(n.kind, n.level, n.payload);
  return {
    ...base,
    // Motor zaten başlık yazdıysa ona saygı gösterilir; yoksa çeviri kullanılır.
    title: n.title?.trim() || base.title,
    detail: n.body?.trim() || base.detail,
  };
}

/* ------------------------------------------------------------------ */
/*  Yük (payload) → okunur alan listesi                                */
/* ------------------------------------------------------------------ */

/** Yük alanlarının okunur adları. Karşılığı olmayan alan olduğu gibi geçer. */
const FIELD_LABEL: Record<string, string> = {
  symbol: "Sembol",
  symbols: "Sembol sayısı",
  bot_id: "Bot",
  bot: "Bot",
  name: "Ad",
  qty: "Miktar",
  entry: "Giriş fiyatı",
  entry_price: "Giriş fiyatı",
  exit_price: "Çıkış fiyatı",
  stop: "Stop",
  initial_stop: "İlk stop",
  score: "Puan",
  score_at_entry: "Girişteki puan",
  pnl: "Kâr/zarar",
  pnl_r: "Sonuç (R)",
  fees: "Komisyon",
  slippage_bps: "Kayma",
  reason: "Sebep",
  reject_reason: "Ret sebebi",
  message: "Mesaj",
  level: "Önem",
  state: "Durum",
  breaker: "Devre kesici",
  kind: "Tür",
  timeframe: "Zaman dilimi",
  size: "Havuz boyutu",
  added: "Eklenen",
  removed: "Çıkan",
  count: "Adet",
  bars: "Mum sayısı",
  gap_bars: "Eksik mum",
  from: "Başlangıç",
  to: "Bitiş",
  at: "Zaman",
  duration: "Süre",
  attempt: "Deneme",
  status: "Durum",
  error: "Hata",
  detail: "Ayrıntı",
  value: "Değer",
  threshold: "Eşik",
  limit: "Sınır",
  equity: "Özsermaye",
  cash: "Nakit",
  exposure: "Maruziyet",
  drawdown: "Düşüş",
  config_hash: "Ayar parmak izi",
  strategy_version_id: "Strateji sürümü",
  user_id: "Kullanıcı",
  ip: "IP",
  target: "Hedef",
  action: "Eylem",
  hours: "Saat",
  days: "Gün",
  price: "Fiyat",
  weight: "Ağırlık",
  used: "Kullanılan",
};

export interface PayloadField {
  key: string;
  label: string;
  value: string;
  /** Sözlükte karşılığı varsa terim kimliği. */
  term?: string;
}

/** Alan adının sözlükteki terim karşılığı. */
const FIELD_TERM: Record<string, string> = {
  score: "puan",
  score_at_entry: "puan",
  stop: "stop",
  initial_stop: "stop",
  pnl_r: "r_katsayisi",
  slippage_bps: "kayma",
  reason: "cikis_sebebi",
  breaker: "devre_kesici",
  config_hash: "config_hash",
  drawdown: "drawdown",
  exposure: "maruziyet",
  timeframe: "karar_bari",
};

/**
 * Ham yükü okunur alan listesine çevirir — JSON dökümü yerine.
 *
 * Değerleri biçimlendirmez (para birimi, ondalık ayracı çağıranın işi);
 * yalnızca okunur bir dizeye indirger ve etiketini bulur.
 */
export function payloadFields(
  payload: Record<string, unknown> | null | undefined,
  options: { skip?: string[] } = {},
): PayloadField[] {
  if (!payload || typeof payload !== "object") return [];
  const skip = new Set(options.skip ?? ["message"]);

  return Object.entries(payload)
    .filter(([key, value]) => !skip.has(key) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      label: FIELD_LABEL[key] ?? readableCode(key),
      value: stringifyValue(key, value),
      term: FIELD_TERM[key] && GLOSSARY[FIELD_TERM[key]] ? FIELD_TERM[key] : undefined,
    }));
}

function stringifyValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") {
    // Tam sayıysa ondalık gösterme; değilse en fazla 6 hane.
    return Number.isInteger(value)
      ? value.toLocaleString("tr-TR")
      : value.toLocaleString("tr-TR", { maximumFractionDigits: 6 });
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.length <= 6) return value.map((v) => String(v)).join(", ");
    return `${value.slice(0, 6).map((v) => String(v)).join(", ")} … (${value.length} adet)`;
  }
  if (typeof value === "object") {
    // İç içe nesne: alanlarını "a: 1 · b: 2" biçiminde düzleştir.
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "—";
    return entries
      .slice(0, 6)
      .map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${stringifyValue(k, v)}`)
      .join(" · ");
  }

  const text = String(value);
  // Bilinen kod sözlükleri
  if (key === "reason" && EXIT_REASON_LABEL[text]) return EXIT_REASON_LABEL[text];
  if (key === "state" && BOT_STATE_LABEL[text]) return BOT_STATE_LABEL[text];
  if (key === "breaker" && CIRCUIT_BREAKER_LABEL[text]) return CIRCUIT_BREAKER_LABEL[text];
  if (key === "status" && ORDER_STATUS_LABEL[text]) return ORDER_STATUS_LABEL[text];
  if (key === "reject_reason") return rejectReason(text);
  return text;
}

/** Tek satırlık özet — tabloda ayrıntı sütunu için. */
export function payloadSummary(
  payload: Record<string, unknown> | null | undefined,
  limit = 4,
): string {
  const fields = payloadFields(payload);
  if (fields.length === 0) return "—";
  const head = fields.slice(0, limit).map((f) => `${f.label}: ${f.value}`);
  return fields.length > limit ? `${head.join(" · ")} …` : head.join(" · ");
}

/* ------------------------------------------------------------------ */
/*  Yardımcılar                                                        */
/* ------------------------------------------------------------------ */

/**
 * Log mesajının başındaki makine kodunu ayıklar.
 *
 * `structlog` olayı mesajın kendisi olarak yazar (`universe_unchanged`),
 * ama bot kararları serbest Türkçe cümle yazar. İlk sözcük snake_case bir
 * kodsa onu döndürür; değilse `null`.
 */
function extractCode(message: string): string | null {
  if (!message) return null;
  const first = message.split(/\s+/, 1)[0] ?? "";
  return /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/.test(first) ? first : null;
}

function severityFromLevel(level?: string | null): Severity {
  switch ((level ?? "").toUpperCase()) {
    case "CRITICAL":
    case "ERROR":
      return "error";
    case "WARN":
    case "WARNING":
      return "warn";
    default:
      return "info";
  }
}

/** Kod veya mesajdan kategori tahmini — sözlükte karşılığı yoksa son çare. */
function guessCategory(
  text: string,
  payload?: Record<string, unknown> | null,
): LogCategory {
  const t = (text ?? "").toLowerCase();
  if (payload && ("breaker" in payload || "kill" in payload)) return "risk";
  if (/havuz|universe|pool|filter|cluster/.test(t)) return "havuz";
  if (/puan|score|calibration/.test(t)) return "puanlama";
  if (/pozisyon|position|order|emir|trade|fill/.test(t)) return "islem";
  if (/risk|breaker|stale|kill/.test(t)) return "risk";
  if (/veri|data|ohlcv|gap|backfill|archive|quality|spread/.test(t)) return "veri";
  if (/ws|websocket|connect|rate_limit|binance|ticker|ban/.test(t)) return "baglanti";
  if (/worker|bot|supervisor/.test(t)) return "bot";
  return "sistem";
}
