"use client";

/**
 * Bileşen kitaplığı.
 *
 * Renk kararları burada **token** üzerinden verilir; hiçbir bileşen ham
 * hex yazmaz. Yön renkleri (yeşil/kırmızı) yalnızca `numeric.tsx` ve
 * buradaki `Tag tone="up|down"` üzerinden çıkar — başka yerde yeşil bir
 * yüzey görürseniz o bir hatadır.
 */

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cx } from "./cx";

/* ================================================================== */
/*  Yüzey                                                              */
/* ================================================================== */

/**
 * Panelin taşıyıcı yüzeyi.
 *
 * Gölge yok: yapıyı kenarlık taşır. Gölge yalnızca **yüzen** yüzeylerde
 * (menü, açılır pencere, çekmece) derinlik bilgisi olarak kullanılır;
 * sabit bir kartta ise sadece gürültüdür.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  padded = true,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Izgara doğrudan kenara dayansın diye kapatılır. */
  padded?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cx("rounded-[var(--sn-r-md)] overflow-hidden", className)}
      style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
    >
      {(title || actions) && (
        <header
          className="flex items-start justify-between gap-4 px-4 py-3"
          style={{ borderBottom: description ? "none" : "1px solid var(--sn-hairline)" }}
        >
          <div className="min-w-0">
            {title && (
              <h2
                className="truncate font-medium"
                style={{ fontSize: "var(--sn-t-title)", color: "var(--sn-ink)" }}
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                className="mt-1 max-w-[72ch]"
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
              >
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {description && <Divider />}
      <div className={padded ? "p-4" : undefined}>{children}</div>
      {footer && (
        <>
          <Divider />
          <div className="px-4 py-2.5" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
            {footer}
          </div>
        </>
      )}
    </section>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx("h-px w-full", className)} style={{ background: "var(--sn-hairline)" }} />;
}

/* ================================================================== */
/*  Düğme                                                              */
/* ================================================================== */

type Variant = "primary" | "neutral" | "quiet" | "danger";
type Size = "sm" | "md";

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 gap-1.5 text-[length:var(--sn-t-caption)]",
  md: "h-8 px-3 gap-2 text-[length:var(--sn-t-body)]",
};

function faceStyle(variant: Variant): React.CSSProperties {
  switch (variant) {
    /* Birincil amber: yeşil bir "kaydet" düğmesi göz tarafından "kazanç"
       diye okunur, bu yüzden marka rengi eylemi taşır. */
    case "primary":
      return { background: "var(--sn-brand-solid)", color: "var(--sn-on-brand)", border: "1px solid transparent" };
    case "danger":
      return { background: "var(--sn-down)", color: "var(--sn-on-down)", border: "1px solid transparent" };
    case "neutral":
      return { background: "var(--sn-panel)", color: "var(--sn-ink)", border: "1px solid var(--sn-border)" };
    case "quiet":
      return { background: "transparent", color: "var(--sn-ink-2)", border: "1px solid transparent" };
  }
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    icon?: ReactNode;
    /** Sağdaki ikincil işaret (sayaç, kısayol tuşu). */
    trailing?: ReactNode;
  }
>(function Button(
  { variant = "neutral", size = "md", icon, trailing, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        "sn-focus inline-flex shrink-0 items-center justify-center rounded-[var(--sn-r-sm)] font-medium",
        "transition-[filter,background-color,border-color,opacity] duration-[var(--sn-dur-1)]",
        "hover:brightness-[0.97] active:brightness-[0.94] disabled:pointer-events-none disabled:opacity-45",
        variant === "quiet" && "hover:bg-[var(--sn-sunken)] hover:brightness-100",
        SIZES[size],
        className,
      )}
      style={faceStyle(variant)}
      {...rest}
    >
      {icon}
      {children}
      {trailing}
    </button>
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: Size }
>(function IconButton({ label, size = "md", className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cx(
        "sn-focus inline-flex items-center justify-center rounded-[var(--sn-r-sm)]",
        "transition-colors duration-[var(--sn-dur-1)] hover:bg-[var(--sn-sunken)]",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        className,
      )}
      style={{ color: "var(--sn-ink-2)" }}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ================================================================== */
/*  Etiket ve durum                                                    */
/* ================================================================== */

export type Tone = "neutral" | "brand" | "up" | "down" | "warn" | "info";

const TONE: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: "var(--sn-ink-2)", bg: "var(--sn-sunken)" },
  brand: { fg: "var(--sn-brand)", bg: "var(--sn-brand-bg)" },
  up: { fg: "var(--sn-up)", bg: "var(--sn-up-bg)" },
  down: { fg: "var(--sn-down)", bg: "var(--sn-down-bg)" },
  warn: { fg: "var(--sn-warn)", bg: "var(--sn-warn-bg)" },
  info: { fg: "var(--sn-info)", bg: "var(--sn-info-bg)" },
};

export function Tag({
  tone = "neutral",
  children,
  className,
  mono = false,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  const { fg, bg } = TONE[tone];
  return (
    <span
      className={cx(
        "inline-flex h-[19px] items-center rounded-[var(--sn-r-xs)] px-1.5 font-medium whitespace-nowrap",
        mono && "sn-num",
        className,
      )}
      style={{ color: fg, background: bg, fontSize: "var(--sn-t-micro)", letterSpacing: "0.02em" }}
    >
      {children}
    </span>
  );
}

/**
 * Durum noktası.
 *
 * Nokta tek başına anlam taşımaz — her zaman yanında bir sözcükle
 * kullanılır. Renk körlüğünde yalnız nokta okunmaz.
 */
export function Dot({ tone = "neutral", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const color = tone === "neutral" ? "var(--sn-idle)" : TONE[tone].fg;
  return (
    <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
      {pulse && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

/* ================================================================== */
/*  Bölümlenmiş seçici                                                 */
/* ================================================================== */

/**
 * Sekme yerine bölümlenmiş seçici: az sayıda, karşılaştırmalı seçenek
 * için. Seçili olan amber zemin alır — marka rengi "burada duruyorsun"
 * demenin tek yolu.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  size?: Size;
  className?: string;
}) {
  return (
    <div
      className={cx("inline-flex items-center gap-0.5 rounded-[var(--sn-r-sm)] p-0.5", className)}
      style={{ background: "var(--sn-sunken)" }}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "sn-focus inline-flex items-center gap-1.5 rounded-[var(--sn-r-xs)] font-medium whitespace-nowrap",
              "transition-colors duration-[var(--sn-dur-1)]",
              size === "sm" ? "h-6 px-2 text-[length:var(--sn-t-micro)]" : "h-7 px-2.5 text-[length:var(--sn-t-caption)]",
            )}
            style={
              active
                ? { background: "var(--sn-brand-bg)", color: "var(--sn-brand)", boxShadow: "inset 0 0 0 1px var(--sn-brand-line)" }
                : { color: "var(--sn-ink-3)" }
            }
          >
            {option.label}
            {option.count !== undefined && (
              <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)", opacity: 0.75 }}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Süzgeç çipi                                                        */
/* ================================================================== */

/**
 * Açılıp kapanan süzgeç.
 *
 * `Segmented`'dan farkı: çipler **bağımsızdır** ve sayıları çok olabilir
 * (sekiz kategori gibi). Bölümlenmiş seçici tek bir seçim kutusudur ve
 * sekiz seçenekle satırı taşırır.
 */
export function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="sn-focus inline-flex items-center gap-1 rounded-[var(--sn-r-xs)] px-2 py-0.5 whitespace-nowrap transition-colors duration-[var(--sn-dur-1)]"
      style={{
        fontSize: "var(--sn-t-caption)",
        border: `1px solid ${active ? "var(--sn-brand-line)" : "var(--sn-border)"}`,
        background: active ? "var(--sn-brand-bg)" : "transparent",
        color: active ? "var(--sn-brand)" : "var(--sn-ink-2)",
        fontWeight: active ? 550 : 400,
      }}
    >
      {children}
    </button>
  );
}

/* ================================================================== */
/*  Seçim menüsü                                                       */
/* ================================================================== */

/**
 * Uzun etiketli, az sayıda seçenek için açılır seçici.
 *
 * `Segmented`'ın sınırı şudur: seçenekler yan yana dizilir ve etiketler
 * uzayınca satırı taşırır. Puanlama ayarları ("Havuz Momentum · taban ·
 * Havuz Momentum · seçici") tam olarak bu durumdadır — beş seçenek
 * ekranın tamamını yiyordu. Kısaltmak da çözüm değil: ayrımı taşıyan
 * bilgi etiketin kendisinde.
 */
export function Picker<T extends string>({
  value,
  onChange,
  options,
  label,
  width = 260,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: string; meta?: string }[];
  label?: string;
  width?: number;
}) {
  const active = options.find((option) => option.value === value);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="sn-focus flex h-8 items-center gap-2 rounded-[var(--sn-r-sm)] px-2.5"
          style={{
            background: "var(--sn-panel)",
            border: "1px solid var(--sn-border)",
            color: "var(--sn-ink)",
            fontSize: "var(--sn-t-caption)",
            maxWidth: width,
          }}
        >
          {label && (
            <span className="shrink-0 whitespace-nowrap" style={{ color: "var(--sn-ink-3)" }}>
              {label}
            </span>
          )}
          <span className="truncate font-medium">{active?.label ?? "—"}</span>
          {active?.meta && (
            <span className="sn-num shrink-0" style={{ color: "var(--sn-ink-3)", fontSize: "var(--sn-t-micro)" }}>
              {active.meta}
            </span>
          )}
          <ChevronDown />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="sn-fade-up z-[90] max-h-[60vh] overflow-y-auto rounded-[var(--sn-r-md)] p-1.5"
          style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)", minWidth: width }}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <DropdownMenu.Item
                key={option.value}
                onSelect={() => onChange(option.value)}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--sn-r-xs)] px-2 py-1.5 outline-none data-[highlighted]:bg-[var(--sn-sunken)]"
                style={{
                  fontSize: "var(--sn-t-caption)",
                  color: selected ? "var(--sn-brand)" : "var(--sn-ink-2)",
                  background: selected ? "var(--sn-brand-bg)" : undefined,
                }}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.meta && (
                  <span className="sn-num shrink-0" style={{ fontSize: "var(--sn-t-micro)", opacity: 0.75 }}>
                    {option.meta}
                  </span>
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChevronDown() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="ml-auto shrink-0"
      style={{ color: "var(--sn-ink-4)" }}
      aria-hidden
    >
      <path d="m5 9 7 7 7-7" />
    </svg>
  );
}

/* ================================================================== */
/*  Giriş                                                              */
/* ================================================================== */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  function Input({ icon, className, ...rest }, ref) {
    return (
      <div className={cx("relative flex items-center", className)}>
        {icon && (
          <span className="pointer-events-none absolute left-2.5 flex" style={{ color: "var(--sn-ink-4)" }}>
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={cx(
            "sn-focus h-8 w-full rounded-[var(--sn-r-sm)] outline-none",
            "placeholder:text-[var(--sn-ink-4)]",
            icon ? "pl-8 pr-2.5" : "px-2.5",
          )}
          style={{
            background: "var(--sn-sunken)",
            color: "var(--sn-ink)",
            border: "1px solid transparent",
            fontSize: "var(--sn-t-body)",
          }}
          {...rest}
        />
      </div>
    );
  },
);

/* ================================================================== */
/*  İpucu                                                              */
/* ================================================================== */

export function TooltipHost({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={220} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          sideOffset={6}
          collisionPadding={10}
          className="sn-fade-up z-[90] max-w-[36ch] rounded-[var(--sn-r-sm)] px-2.5 py-1.5"
          style={{
            background: "var(--sn-overlay)",
            color: "var(--sn-ink-2)",
            boxShadow: "var(--sn-shadow-pop)",
            fontSize: "var(--sn-t-caption)",
            lineHeight: 1.45,
          }}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ================================================================== */
/*  Boş ve yükleniyor                                                  */
/* ================================================================== */

/**
 * Yükleme iskeleti.
 *
 * Dönen bir çark değil, gelecek içeriğin ölçüsünde bir gölge: yerleşim
 * veri gelince sıçramaz.
 */
export function Skeleton({ w = "100%", h = 12, className }: { w?: string | number; h?: number; className?: string }) {
  return <span className={cx("sn-skeleton block", className)} style={{ width: w, height: h }} />;
}

/**
 * Boş durum.
 *
 * "Kayıt yok" ile "hiç bakılmadı" aynı şey değildir; `hint` ikisini
 * ayırmak için vardır ve boş bırakılmamalıdır.
 */
export function Empty({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center">
      <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)" }}>{title}</p>
      {hint && (
        <p className="max-w-[46ch]" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
          {hint}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
