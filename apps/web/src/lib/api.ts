/**
 * FastAPI istemcisi.
 *
 * Frontend **yalnızca** buraya konuşur. Next.js'te iş mantığı, ORM veya DB
 * bağlantısı yoktur (CLAUDE.md stack kuralı). Bu dosya tek ağ katmanıdır.
 */

/**
 * API kökü.
 *
 * İki biçim de geçerlidir:
 *   · mutlak (`http://localhost:8000`) — API'ye doğrudan gidilir
 *   · göreli (`/api`) — istek panelin kendi kökeninden geçer ve oradan
 *     FastAPI'ye yönlendirilir
 *
 * Göreli biçim panel dışarı açıldığında gereklidir: ziyaretçinin tarayıcısı
 * için `localhost:8000` kendi makinesidir, bizim sunucumuz değil.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * WebSocket adresini üretir.
 *
 * `API_URL` göreli olduğunda `http→ws` çevirisi işe yaramaz (ortada şema
 * yoktur); adres tarayıcının bulunduğu konumdan kurulur. Sayfa HTTPS ile
 * açıldıysa `wss` kullanılır — tarayıcılar güvenli sayfadan şifresiz soket
 * açılmasına izin vermez.
 */
export function websocketUrl(path: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";

  if (/^https?:\/\//.test(API_URL)) {
    return `${API_URL.replace(/^http/, "ws")}${path}${suffix}`;
  }

  const scheme = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const host = typeof window === "undefined" ? "localhost:3000" : window.location.host;
  const base = API_URL.replace(/\/$/, "");
  return `${scheme}://${host}${base}${path}${suffix}`;
}

const ACCESS_KEY = "sarnic.access";
const REFRESH_KEY = "sarnic.refresh";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokens = {
  access: (): string | null =>
    typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY),
  refresh: (): string | null =>
    typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY),
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function refreshTokens(): Promise<boolean> {
  const refresh = tokens.refresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    tokens.set(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ");
    }
  } catch {
    /* gövde JSON değil */
  }
  return `Sunucu ${res.status} döndü.`;
}

export async function request<T>(
  path: string,
  init: RequestInit & { retry?: boolean } = {},
): Promise<T> {
  const { retry = true, ...options } = init;
  const access = tokens.access();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401 && retry && (await refreshTokens())) {
    return request<T>(path, { ...init, retry: false });
  }

  if (res.status === 401) {
    tokens.clear();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/giris")) {
      window.location.href = "/giris";
    }
    throw new ApiError(401, "Oturum süresi doldu. Tekrar giriş yapın.");
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // `null` da süzülür: seçim henüz yüklenmemiş bir filtre (`config_hash` gibi)
  // `null` olur ve süzülmezse `"null"` dizesi olarak gider — sunucu hiçbir
  // kaydın eşleşmediği bir filtreyle boş liste döndürürdü.
  get: <T>(path: string, params?: Record<string, string | number | boolean | null | undefined>) => {
    const query = params
      ? `?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .map(([k, v]) => [k, String(v)]),
        )}`
      : "";
    return request<T>(`${path}${query}`);
  },
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/* ---------------------------------------------------------------- */
/*  Tipler — FastAPI şemalarının aynası                              */
/* ---------------------------------------------------------------- */
export type Role = "ADMIN" | "TRADER" | "VIEWER";

export interface User {
  id: number;
  email: string;
  role: Role;
  display_name: string;
  totp_enabled: boolean;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

/** `/system/load` — makinenin yük durumu. */
export interface SystemLoad {
  cores: number;
  /** Eksik veri `null` döner; sıfır göstermek "yük yok" diye okunurdu. */
  load_1: number | null;
  load_5: number | null;
  load_15: number | null;
  /** `load_1 / cores`. 1.0 = her çekirdek dolu. */
  pressure: number | null;
  message: string;
}

export interface SystemStatus {
  universe_size: number;
  universe_taken_at: string | null;
  running_bots: number;
  total_bots: number;
  alarms: number;
  market_data_stale: boolean;
  mode: string;
  message: string;
}

export interface UniverseSymbol {
  symbol: string;
  rank: number;
  quote_volume: number;
  price: number | null;
  spread_pct: number | null;
  age_days: number | null;
  volatility_ann_pct: number | null;
  range_3d_pct: number | null;
  protected: boolean;
  /** Bu turda ölçüm alınamadı; üye bir tur tamponla korunuyor (motor bayrağı). */
  placeholder?: boolean;
}

export interface FunnelStep {
  index: number;
  name: string;
  kept: number;
  dropped: number;
  examples: string[];
}

export interface SnapshotSummary {
  id: number;
  taken_at: string;
  reason: string;
  size: number;
  added: string[];
  removed: string[];
}

export interface SnapshotDetail {
  id: number;
  taken_at: string;
  reason: string;
  config_hash: string;
  size: number;
  added: string[];
  removed: string[];
  symbols: UniverseSymbol[];
  funnel: FunnelStep[];
}

export interface Score {
  symbol: string;
  bar_time: string;
  score: number;
  families: Record<string, number>;
  modifiers: Record<string, number>;
  config_hash: string;
}

/**
 * Bir puanlama konfigürasyonu (`/scores/configs`).
 *
 * Aynı anda birden çok bot farklı ağırlıklarla puanlar. Hepsini tek listede
 * göstermek sıralamayı anlamsız kılar — aynı sembol iki farklı puanla iki kez
 * görünür. Panel her seferinde **tek** bir konfigürasyonu gösterir; kullanıcı
 * seçiciyle değiştirir.
 */
export interface ScoreConfig {
  config_hash: string;
  /**
   * Sıralamanın karar zaman dilimi.
   *
   * Kimlik `config_hash` **değil**, `config_hash + timeframe`: aynı ağırlıklar
   * 1 saatlik ve 15 dakikalık botlarda aynı hash'i üretir ama bunlar farklı
   * sıralamalardır. Yalnızca hash'e bakmak hem seçimi belirsiz bırakır hem de
   * React'te aynı anahtarı üç kez üretir.
   */
  timeframe: string;
  /** Bu konfigürasyonu üreten botların adı, ` · ` ile birleşik. */
  label: string;
  symbols: number;
  top_score: number;
  bar_time: string;
}

export interface Rationale {
  symbol: string;
  score: number;
  bar_time: string | null;
  families: Record<string, number>;
  modifiers: Record<string, number>;
  top_drivers: string[];
  percentiles: Record<string, number>;
  sr: {
    support: number | null;
    support_strength: number | null;
    resistance: number | null;
    resistance_strength: number | null;
    rr_geometry: number | null;
    poc: number | null;
    atr: number | null;
  };
  config_hash: string;
}

export interface ScoreDetail extends Score {
  rationale: Rationale;
}

export interface Bot {
  id: number;
  name: string;
  owner_id: number | null;
  strategy_version_id: number;
  mode: string;
  state: string;
  timeframe: string;
  capital: number;
  cash: number;
  equity: number | null;
  open_positions: number;
  last_heartbeat_at: string | null;
  halt_reason: string | null;
  created_at: string;
}

export interface Position {
  id: number;
  bot_id: number;
  symbol: string;
  qty: number;
  entry_price: number;
  entry_time: string;
  stop: number;
  initial_stop: number;
  score_at_entry: number;
  breakeven_locked: boolean;
  /** 1 = spot; >1 kaldıraçlı giriş (paper marj simülasyonu). */
  leverage: number;
  status: string;
  last_price: number | null;
  unrealized_pnl: number | null;
  unrealized_pct: number | null;
  rationale_id: number | null;
}

export interface Trade {
  id: number;
  bot_id: number;
  symbol: string;
  exit_price: number;
  exit_time: string;
  exit_reason: string;
  pnl: number;
  pnl_r: number;
  fees: number;
  leverage: number;
  slippage_bps: number;
  mfe: number;
  mae: number;
  hold_hours: number;
}

export interface Order {
  id: number;
  bot_id: number;
  symbol: string;
  type: string;
  side: string;
  qty: number;
  filled_qty: number;
  avg_fill_price: number | null;
  status: string;
  reject_reason: string | null;
  fees: number;
  slippage_bps: number;
  created_at: string;
  filled_at: string | null;
}

export interface BotMetrics {
  bot_id: number;
  name: string;
  state: string;
  equity: number;
  cash: number;
  exposure: number;
  exposure_pct: number;
  drawdown: number;
  total_return: number;
  open_positions: number;
  trades: number;
  win_rate: number | null;
  profit_factor: number | null;
  expectancy_r: number | null;
  avg_r: number | null;
  total_pnl: number;
  total_fees: number;
  exit_reasons: Record<string, number>;
}

export interface PortfolioMetrics {
  total: { equity: number; cash: number; exposure: number; bots: number };
  bots: BotMetrics[];
}

export interface EquityPoint {
  at: string;
  equity: number;
  cash: number;
  exposure: number;
}

/**
 * `/portfolio/equity` yanıtı.
 *
 * **Dizi değil, nesne döner.** Bot başına ayrı eğriler ve bunların
 * birleştirilmiş toplamı. Toplam sunucuda hesaplanır: panelin "aynı zaman
 * damgalarını topla" yaklaşımı, botların noktaları hizalanmadığında portföyü
 * olduğundan düşük gösteriyordu.
 */
export interface PortfolioEquity {
  bots: { bot_id: number; name: string; curve: EquityPoint[] }[];
  total: EquityPoint[];
}

export interface CalibrationDecile {
  decile: number;
  count: number;
  mean_return: number;
  /** Ortalama birkaç aşırı getiriyle sürüklenir; medyan tipik gözlemi gösterir. */
  median_return: number;
  ci_low: number;
  ci_high: number;
  mean_score: number;
}

export interface Calibration {
  horizon: string;
  n: number;
  span_days: number;
  sufficient: boolean;
  deciles: CalibrationDecile[];
  spearman: number | null;
  spearman_p: number | null;
  rolling_spearman: { at: string; value: number | null }[];
  family_ic: Record<string, number | null>;
  ic_series: { at: string; family: string; ic: number | null; n: number }[];
  monotonic: boolean;
  /**
   * Sistemin **fiilen işlem yaptığı** bölge: puanı giriş kapısının üstünde
   * olanların, aynı barlardaki havuza göre farkı. Spearman tüm dağılıma
   * bakar; sistem alt desili hiç almaz, o yüzden ikisi ayrı ölçülür.
   */
  gate: number | null;
  gate_n: number;
  gate_return: number | null;
  pool_return: number | null;
  gate_edge: number | null;
  gate_edge_t: number | null;
  /** Gün-kümelenmiş t — ham t bağımsızlık varsayar ve ~%70 şişkin çıkar. */
  gate_edge_t_daily: number | null;
  gate_days: number;
  top_minus_bottom: number | null;
  top_minus_bottom_p: number | null;
  verdict: string;
}

export interface StrategyVersion {
  id: number;
  strategy_id: number;
  version: number;
  definition: Record<string, unknown>;
  definition_hash: string;
  frozen: boolean;
  created_at: string;
}

export interface Strategy {
  id: number;
  name: string;
  owner_id: number | null;
  created_at: string;
  versions: StrategyVersion[];
}

export interface Backtest {
  id: number;
  strategy_version_id: number;
  status: string;
  error: string | null;
  approximate_universe: boolean;
  params: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface BacktestResult {
  cost_scenario: string;
  metrics: Record<string, number | null | Record<string, number>>;
  equity_curve: [string, number][];
  trades: Record<string, unknown>[];
  benchmarks: {
    name: string;
    equity_curve: [string, number][];
    metrics: Record<string, number | null> | null;
    detail: Record<string, number>;
  }[];
  flags: { kind: string; value: number; message: string }[];
}

export interface BacktestDetail extends Backtest {
  results: BacktestResult[];
}

export interface Notification {
  id: number;
  kind: string;
  level: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface ChatRoom {
  id: number;
  name: string;
  kind: string;
  members: number[];
  unread: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  user_id: number | null;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface BotEvent {
  id: number;
  kind: string;
  level: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  user_id: number | null;
  action: string;
  target: string;
  payload: Record<string, unknown>;
  ip: string;
  created_at: string;
}

export interface DataQualityEntry {
  id: number;
  kind: string;
  symbol: string;
  timeframe: string;
  severity: string;
  resolved: boolean;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SRLevels {
  price: number;
  support: number | null;
  support_strength: number | null;
  resistance: number | null;
  resistance_strength: number | null;
  rr_geometry: number | null;
  poc: number | null;
  value_area_low: number | null;
  value_area_high: number | null;
  atr: number | null;
  levels: { price: number; kind: string; strength: number; touches: number }[];
}

export interface PatternInfo {
  symbol: string;
  timeframe: string;
  matches: {
    kind: string;
    direction: number;
    confidence: number;
    neckline: number | null;
    target: number | null;
    volume_confirmed: boolean;
  }[];
  candle_signals: string[];
  pattern_modifier: number;
  candle_modifier: number;
  note: string;
}

export interface DiscordConfig {
  enabled: boolean;
  webhooks: Record<string, string>;
  channels: string[];
}

/**
 * Kıyas ölçütü (`/portfolio/benchmark`) — Faz 0a'nın 3. testinin canlı hâli.
 *
 * Bir getiri, alternatifi olmadan hiçbir şey ifade etmez. Alternatif burada
 * "hiç seçme, havuzdaki her şeyi eşit al ve tut"tur.
 */
export interface Benchmark {
  start: string | null;
  end: string | null;
  span_days?: number;
  trades?: number;
  /** Örneklem karar vermeye yetiyor mu? Yetmiyorsa fark gürültü olabilir. */
  sufficient?: boolean;
  verdict?: string | null;
  universe_size?: number;
  benchmark: { at: string; value: number; symbols: number }[];
  bots: { bot_id: number; name: string; curve: { at: string; value: number }[] }[];
  note?: string;
}

/** İşlem maliyetinin brüt kâra oranı (`/portfolio/costs`). */
export interface CostSummary {
  trades: number;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  /** Brüt kârın kaçta kaçı maliyete gitti. Brüt zarardaysa `null`. */
  cost_ratio: number | null;
  avg_slippage_bps: number | null;
  max_slippage_bps: number | null;
  /**
   * Gerçek emir defterinden ölçülen spread. Kayma (`avg_slippage_bps`) kağıt
   * motorun modelinden gelir ve varsayım içerir; bu ise ölçümdür.
   */
  measured_spread?: {
    samples: number;
    symbols?: number;
    hours?: number;
    avg_bps?: number;
    median_bps?: number;
    p90_bps?: number;
    half_spread_bps?: number;
    /** Komisyon + yarı spread. */
    one_way_bps?: number;
    /** Faz 0a'nın kullandığı varsayım — karşılaştırma için taşınır. */
    assumed_one_way_bps?: number;
  };
  note?: string;
}

/** Canlı kâr/zarar (`/portfolio/live`) — üst şeridin sürekli çağırdığı hafif uç. */
export interface LivePnl {
  at: string;
  equity: number;
  cash: number;
  exposure: number;
  /** Açık pozisyonların anlık k/z'si — henüz cebe girmedi. */
  unrealized_pnl: number;
  /** Bugün kapanan işlemlerin toplamı. */
  realized_today: number;
  open_positions: number;
  total_return: number;
  capital: number;
  bots: {
    bot_id: number;
    name: string;
    state: string;
    equity: number;
    unrealized_pnl: number;
    open_positions: number;
    total_return: number;
  }[];
  /** Fiyatı bilinmeyen semboller — varsa gerçekleşmemiş k/z eksiktir. */
  stale_symbols: string[];
}
