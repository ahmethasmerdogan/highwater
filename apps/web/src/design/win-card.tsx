"use client";

/**
 * Kazanç vitrini — borsaların "PnL paylaşım kartı" türü.
 *
 * İki parça:
 *  - `WinShowcase`: Günün karnesinin kahraman kartı. Koyu gradyan zemin,
 *    yay fiziğiyle dolan dev yüzde, süzülen ışık taraması, birkaç parıltı.
 *    Gösteriş BURADA yaşar — kazanç anı sahnedir; sayfanın geri kalanı
 *    disiplinli kalır.
 *  - `TradeShareCard`: tek işlemin paylaşılabilir kartı (kip içinde),
 *    PNG olarak indirilebilir — canvas'a elle çizilir, bağımlılık yok.
 *
 * Dürüstlük değişmedi: yalnızca GERÇEKLEŞMİŞ sonuç kartlaşır; zarar da
 * kart olur ama kırmızı ve sakin — zarar gizlenmez, sadece kutlanmaz.
 */

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Modal } from "@/design/modal";
import { Button } from "@/design/primitives";
import { Num } from "@/design/numeric";
import { LogoMark } from "@/design/logo";
import { useReducedMotion } from "@/design/motion";
import { dateOnly, money, num, price } from "@/lib/format";
import type { Trade } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Kahraman kart                                                      */
/* ------------------------------------------------------------------ */

const SPRING = { type: "spring", stiffness: 120, damping: 20 } as const;

export function WinShowcase({
  label,
  amount,
  roi,
  sub,
  onShare,
}: {
  label: string;
  /** Gerçekleşmiş tutar (USDT). */
  amount: number;
  /** Oran (0,042 = %4,2) — varsa büyük gösterilen budur. */
  roi: number | null;
  sub?: string;
  onShare?: () => void;
}) {
  const reduced = useReducedMotion();
  const kar = amount > 0;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      className="relative overflow-hidden rounded-[var(--sn-r-lg)] p-5"
      style={{
        background: kar
          ? "linear-gradient(135deg, #0c0f14 0%, #141a14 55%, #1c2410 100%)"
          : "linear-gradient(135deg, #0c0f14 0%, #1a1214 100%)",
        border: `1px solid ${kar ? "rgba(240,185,11,0.35)" : "rgba(214,48,74,0.35)"}`,
      }}
    >
      {/* Işık taraması — yalnız kârda, tek yönlü süzülür. */}
      {kar && !reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3"
          style={{
            background:
              "linear-gradient(105deg, transparent, rgba(240,185,11,0.10), transparent)",
          }}
          initial={{ x: "-120%" }}
          animate={{ x: "340%" }}
          transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
        />
      )}
      {/* Parıltılar — üç küçük yıldız, gecikmeli süzülür. */}
      {kar &&
        !reduced &&
        [
          { left: "72%", top: "18%", delay: 0.3 },
          { left: "86%", top: "52%", delay: 1.1 },
          { left: "64%", top: "70%", delay: 1.9 },
        ].map((p) => (
          <motion.span
            key={p.left}
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: p.left, top: p.top, color: "rgba(240,185,11,0.8)", fontSize: 10 }}
            initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.5], rotate: 15 }}
            transition={{ duration: 2.2, delay: p.delay, repeat: Infinity, repeatDelay: 3.4 }}
          >
            ✦
          </motion.span>
        ))}

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LogoMark size={16} className={kar ? "text-[#f0b90b]" : "text-[#8a8f98]"} />
            <span
              className="font-semibold"
              style={{ fontSize: 11, letterSpacing: "0.14em", color: "#8a8f98" }}
            >
              HIGHWATER
            </span>
            <span style={{ fontSize: 11, color: "#5c626b" }}>· {label}</span>
          </div>
          <div
            className="mt-2 leading-none font-semibold"
            style={{
              fontSize: 44,
              color: kar ? "#2ee58a" : "#ff5c74",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {roi !== null ? (
              <Num
                value={roi}
                animate
                animateOnMount
                format={(v) =>
                  v === null || v === undefined
                    ? "—"
                    : `${v > 0 ? "+" : v < 0 ? "-" : ""}%${num(Math.abs(v) * 100, 2)}`
                }
                size="hero"
              />
            ) : (
              <Num
                value={amount}
                animate
                animateOnMount
                format={(v) => `${(v ?? 0) > 0 ? "+" : ""}${money(v)}`}
                size="hero"
              />
            )}
          </div>
          <div className="mt-1.5" style={{ fontSize: 13, color: "#aab0b9" }}>
            {roi !== null && (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {amount > 0 ? "+" : ""}
                {money(amount)} USDT{sub ? " · " : ""}
              </span>
            )}
            {sub}
          </div>
        </div>
        {onShare && (
          <motion.button
            type="button"
            onClick={onShare}
            whileHover={reduced ? undefined : { y: -1, scale: 1.02 }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            className="rounded-[var(--sn-r-sm)] px-3 py-1.5 font-medium"
            style={{
              background: kar ? "#f0b90b" : "#232830",
              color: kar ? "#14120a" : "#aab0b9",
              fontSize: 12,
            }}
          >
            Kartı paylaş
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Paylaşılabilir işlem kartı                                         */
/* ------------------------------------------------------------------ */

const KART_W = 900;
const KART_H = 506;

/** Kartı canvas'a çizer — PNG indirme de aynı çizimden. */
function drawCard(ctx: CanvasRenderingContext2D, trade: Trade, roi: number | null) {
  const kar = trade.pnl > 0;
  const W = KART_W;
  const H = KART_H;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0e13");
  bg.addColorStop(0.55, kar ? "#12180f" : "#180f12");
  bg.addColorStop(1, kar ? "#1d260d" : "#26100d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* zemin deseni: sağda dev, silik logo dalgaları */
  ctx.save();
  ctx.strokeStyle = kar ? "rgba(240,185,11,0.07)" : "rgba(214,48,74,0.07)";
  ctx.lineWidth = 10;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const y = 150 + i * 90;
    for (let x = W * 0.5; x <= W + 40; x += 8) {
      const yy = y + Math.sin((x / 46) + i) * 16;
      if (x === W * 0.5) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  /* marka */
  ctx.fillStyle = "#8a8f98";
  ctx.font = "600 22px Geist, Arial";
  ctx.fillText("H I G H W A T E R", 48, 64);
  ctx.fillStyle = "#5c626b";
  ctx.font = "400 18px Geist, Arial";
  ctx.fillText("kağıt üstü işlem · paper", 48, 92);

  /* sembol + yön */
  ctx.fillStyle = "#e8eaee";
  ctx.font = "600 34px 'Geist Mono', monospace";
  ctx.fillText(trade.symbol, 48, 160);
  ctx.fillStyle = kar ? "#2ee58a" : "#ff5c74";
  ctx.font = "600 20px Geist, Arial";
  ctx.fillText("UZUN · KAPANDI", 48, 192);

  /* dev sonuç */
  ctx.fillStyle = kar ? "#2ee58a" : "#ff5c74";
  ctx.font = "700 110px 'Geist Mono', monospace";
  const ana =
    roi !== null
      ? `${roi > 0 ? "+" : roi < 0 ? "-" : ""}%${num(Math.abs(roi) * 100, 2)}`
      : `${trade.pnl > 0 ? "+" : ""}${money(trade.pnl)}`;
  ctx.fillText(ana, 44, 310);

  ctx.fillStyle = "#aab0b9";
  ctx.font = "500 26px 'Geist Mono', monospace";
  ctx.fillText(
    `${trade.pnl > 0 ? "+" : ""}${money(trade.pnl)} USDT · ${trade.pnl_r > 0 ? "+" : ""}${num(trade.pnl_r, 2)}R`,
    48,
    352,
  );

  /* alt bilgiler */
  const alt = [
    ["Çıkış fiyatı", price(trade.exit_price)],
    ["Komisyon", money(trade.fees)],
    ["Tarih", dateOnly(trade.exit_time)],
  ] as const;
  let x = 48;
  for (const [etiket, deger] of alt) {
    ctx.fillStyle = "#5c626b";
    ctx.font = "500 16px Geist, Arial";
    ctx.fillText(etiket.toUpperCase(), x, 428);
    ctx.fillStyle = "#e8eaee";
    ctx.font = "500 22px 'Geist Mono', monospace";
    ctx.fillText(String(deger), x, 458);
    x += 240;
  }

  /* dürüstlük şeridi */
  ctx.fillStyle = "#5c626b";
  ctx.font = "400 14px Geist, Arial";
  ctx.fillText("Canlı para değildir — paper motorundan gerçekleşmiş sonuç.", 48, H - 20);
}

export function TradeShareCard({
  trade,
  onClose,
}: {
  trade: Trade | null;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roi = useMemo(() => {
    /* İşlem kaydında sermaye yok; R zaten karşılaştırılabilir ölçü.
       ROI yalnız gösterim: |pnl| / (çıkış değeri − pnl) yaklaşımı yerine
       dürüst kalıp yüzdelik iddia edilmez — büyük sayı R'dir. */
    return null;
  }, []);

  useEffect(() => {
    if (!trade) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = 2;
    canvas.width = KART_W * scale;
    canvas.height = KART_H * scale;
    ctx.scale(scale, scale);
    drawCard(ctx, trade, roi);
  }, [trade, roi]);

  const indir = () => {
    const canvas = canvasRef.current;
    if (!canvas || !trade) return;
    const a = document.createElement("a");
    a.download = `highwater-${trade.symbol}-${dateOnly(trade.exit_time)}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  return (
    <Modal
      open={trade !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="İşlem kartı"
      width={620}
      description="Gerçekleşmiş sonucun paylaşılabilir görüntüsü. PNG olarak indirin."
      footer={
        <>
          <Button size="sm" variant="quiet" onClick={onClose}>
            Kapat
          </Button>
          <Button size="sm" variant="primary" onClick={indir}>
            PNG indir
          </Button>
        </>
      }
    >
      <AnimatePresence>
        {trade && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, rotateX: 6 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={SPRING}
            style={{ perspective: 900 }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                maxWidth: 560,
                aspectRatio: `${KART_W} / ${KART_H}`,
                borderRadius: "var(--sn-r-md)",
                display: "block",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
