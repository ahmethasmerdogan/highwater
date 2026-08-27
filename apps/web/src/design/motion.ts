"use client";

/**
 * Hareket çekirdeği.
 *
 * Panelin tek gerçek animasyonu burada: **değişen sayı hedefine sayarak
 * gider.** Gerekçe ölçüm alışkanlığıyla ilgili — özsermaye 32.140,69'dan
 * 32.198,04'e bir karede atladığında göz değişimi göremez, yalnızca "sayı
 * başka" bilgisini alır. Sayarak giden bir sayı ise yönü ve büyüklüğü
 * çevresel görüşle bile okutur.
 *
 * Üç kural:
 *
 * 1. **Biçimleme burada yapılmaz.** Ara değer ham sayı olarak üretilir,
 *    `lib/format.ts` biçimler. İki yerde biçimleyen bir panel er geç iki
 *    farklı ondalık gösterir.
 * 2. **İlk boyamada varsayılan olarak animasyon yok.** Tablo açılışında 400
 *    hücrenin sıfırdan sayması bilgi değil gösteridir; yalnızca büyük metrik
 *    kutuları `animateOnMount` ile açıkça ister.
 * 3. **`prefers-reduced-motion` hem CSS'te hem burada okunur.** Sadece CSS'te
 *    okumak yetmez: sayma döngüsü JS'te dönüyor, CSS onu durduramaz.
 */

import { useSyncExternalStore, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Hareketi azalt                                                     */
/* ------------------------------------------------------------------ */

/**
 * İşletim sistemi "hareketi azalt" diyorsa `true`.
 *
 * Sunucuda ve ilk boyamada `false` döner ve efekt sonrası düzeltir; tersi
 * (varsayılan `true`) her yüklemede bir kare donuk sayı gösterirdi.
 */
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
let reducedMql: MediaQueryList | null = null;

function subscribeReduced(callback: () => void): () => void {
  if (reducedMql === null) reducedMql = window.matchMedia(REDUCED_QUERY);
  reducedMql.addEventListener("change", callback);
  return () => reducedMql?.removeEventListener("change", callback);
}

export function useReducedMotion(): boolean {
  /* Tek MediaQueryList, tüm çağıranlar ona abone — önceden her hook kendi
     dinleyicisini kuruyordu (panelde ~700 dinleyici). Sunucu anlık görüntüsü
     `false`: tersi her yüklemede bir kare donuk sayı gösterirdi. */
  return useSyncExternalStore(
    subscribeReduced,
    () => (reducedMql ??= window.matchMedia(REDUCED_QUERY)).matches,
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/*  Sayan sayı                                                         */
/* ------------------------------------------------------------------ */

/** Sondaki yavaşlama — hedefe yaklaşırken durur, sıçramaz. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export interface AnimatedNumber {
  /** O anki ara değer. Biçimlemek çağıranın işi. */
  value: number;
  /** Son değişimin yönü; bitince `0`'a döner. Renk ipucu için. */
  direction: -1 | 0 | 1;
  /** Sayma sürüyor mu? */
  running: boolean;
}

/**
 * `target` her değiştiğinde eski değerden yenisine sayar.
 *
 * `null`/`undefined`/`NaN` hedefler animasyona girmez: veri yokluğu bir
 * değer değildir, sıfıra doğru saymak onu sıfırmış gibi gösterirdi.
 */
export function useAnimatedNumber(
  target: number | null | undefined,
  {
    duration = 480,
    animateOnMount = false,
    /** Bu eşiğin altındaki değişimler anında uygulanır — titreme olmasın. */
    epsilon = 1e-9,
  }: { duration?: number; animateOnMount?: boolean; epsilon?: number } = {},
): AnimatedNumber {
  const reduced = useReducedMotion();
  const finite = typeof target === "number" && Number.isFinite(target) ? target : null;

  const [value, setValue] = useState<number>(() =>
    finite === null ? 0 : animateOnMount ? 0 : finite,
  );
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [running, setRunning] = useState(false);

  /* Sayma döngüsünün okuduğu "nereden" değeri. State değil ref: döngü
     içinde güncel kalmalı ve her karede yeniden render tetiklememeli. */
  const fromRef = useRef<number>(finite ?? 0);
  const frameRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const first = !mountedRef.current;
    mountedRef.current = true;

    if (finite === null) {
      setRunning(false);
      setDirection(0);
      return;
    }

    const from = first && animateOnMount ? 0 : fromRef.current;
    const delta = finite - from;

    /* Anında oturması gereken haller: hareket kapalı, ilk boyama
       (animasyon istenmediyse) veya fark gürültü seviyesinde. */
    if (reduced || (first && !animateOnMount) || Math.abs(delta) <= epsilon) {
      fromRef.current = finite;
      setValue(finite);
      setRunning(false);
      setDirection(0);
      return;
    }

    setDirection(delta > 0 ? 1 : -1);
    setRunning(true);

    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const next = from + delta * easeOut(t);
      setValue(t === 1 ? finite : next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      fromRef.current = finite;
      frameRef.current = null;
      setRunning(false);
      /* Yön bir süre daha durur ki renk ipucu sayıyla birlikte sönsün. */
      window.setTimeout(() => setDirection(0), 240);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      /* Yarıda kesilirse bir sonraki sayma en son GÖSTERİLEN yerden
         başlamalı; hedeften başlarsa animasyon geri sıçrar. */
      fromRef.current = finite;
    };
    // `value` bilerek bağımlılık değil: her karede efekti yeniden kurardı.
  }, [finite, duration, animateOnMount, epsilon, reduced]);

  return { value, direction, running };
}

/* ------------------------------------------------------------------ */
/*  Değişim işareti                                                    */
/* ------------------------------------------------------------------ */

/**
 * Değer değiştiğinde bir kerelik zemin rengi verir (yeşil yukarı, kırmızı
 * aşağı) ve söner. Tablo hücreleri için: orada sayma yapılmaz — 400 hücre
 * aynı anda sayarsa ızgara okunmaz hâle gelir — ama değişimin görülmesi
 * yine de gerekir.
 */
export function useChangeTint(target: number | null | undefined): "up" | "down" | null {
  const reduced = useReducedMotion();
  const previous = useRef<number | null>(null);
  const [tint, setTint] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const finite = typeof target === "number" && Number.isFinite(target) ? target : null;
    const before = previous.current;
    previous.current = finite;

    if (reduced || before === null || finite === null || finite === before) {
      /* Erken dönüş TEMİZLEMEDEN dönerse hücre takılı kalır: 100→101 tint
         kurar, süre dolmadan değer null olursa (WS kopması) eski efektin
         temizliği zamanlayıcıyı iptal eder ve zemin bir sonraki gerçek
         değişime kadar yeşil/kırmızı kalır. Yanlış renkli hücre, renksiz
         hücreden tehlikelidir: "az önce arttı" der ama artmamıştır. */
      setTint(null);
      return;
    }

    setTint(finite > before ? "up" : "down");
    const timer = window.setTimeout(() => setTint(null), 640);
    return () => window.clearTimeout(timer);
  }, [target, reduced]);

  return tint;
}
