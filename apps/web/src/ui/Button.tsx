import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/* ------------------------------------------------------------------ */
/* One button recipe for the whole system.                             */
/* Vertical gradient + 1px ring + inset top highlight — the treatment   */
/* from the "Get started for Free" reference, applied to every hue.     */
/* No drop shadows, no glows. Pill by default (softness 100).           */
/* ------------------------------------------------------------------ */

export type ButtonVariant =
  | "green" // the reference button
  | "primary" // blue
  | "dark"
  | "danger"
  | "amber"
  | "white" // light face, ink text
  | "outline" // hairline only
  | "ghost";

export type ButtonSize = "sm" | "md" | "lg";
export type ButtonShape = "pill" | "rect";

/* face classes live in index.css so dark mode can re-map the hues */
const FACES: Record<string, string> = {
  green: "btn-face btn-green",
  primary: "btn-face btn-primary",
  dark: "btn-face btn-dark",
  danger: "btn-face btn-danger",
  amber: "btn-face btn-amber",
  white: "btn-face btn-white text-ink",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[13px] gap-1.5",
  md: "h-9.5 px-4.5 text-sm gap-2",
  lg: "h-11 px-6 text-[15px] gap-2",
};

const rectRadius: Record<ButtonSize, string> = {
  sm: "rounded-[10px]",
  md: "rounded-[12px]",
  lg: "rounded-[14px]",
};

/* variants without a gradient face */
const LIGHT: Record<string, string> = {
  outline:
    "bg-transparent text-ink ring-1 ring-line-strong ring-inset hover:bg-elev",
  ghost: "bg-transparent text-ink-2 hover:bg-inset hover:text-ink",
};

export function Button({
  variant = "green",
  size = "md",
  shape = "pill",
  iconLeft,
  iconRight,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}) {
  const face = FACES[variant];
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand/45 disabled:pointer-events-none disabled:opacity-45",
        sizes[size],
        shape === "pill" ? "rounded-full" : rectRadius[size],
        face ? cx(face, "font-semibold") : LIGHT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-[1em] rounded-full border-2 border-current border-t-transparent opacity-80"
          style={{ animation: "hashui-spin 0.7s linear infinite" }}
        />
      ) : (
        iconLeft
      )}
      {children}
      {iconRight}
    </button>
  );
}

/* Attached segmented actions — Like | Comment | Share (Ornek2) */
export function ButtonGroup({
  items,
  size = "md",
  className,
}: {
  items: Array<{ label: string; icon?: ReactNode; onClick?: () => void }>;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-stretch overflow-hidden rounded-full border border-line bg-surface",
        className,
      )}
    >
      {items.map((it, i) => (
        <button
          key={it.label}
          type="button"
          onClick={it.onClick}
          className={cx(
            "inline-flex items-center justify-center font-medium text-ink transition-colors hover:bg-elev",
            sizes[size],
            i > 0 && "border-l border-line",
          )}
        >
          <span className="flex items-center gap-2 [&>svg]:text-ink-2">
            {it.icon}
            {it.label}
          </span>
        </button>
      ))}
    </span>
  );
}

/* Squircle icon button — social row in button-design-0001 */
export function IconButton({
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const s =
    size === "xl"
      ? "size-20 rounded-[28px]"
      : size === "lg"
        ? "size-14 rounded-[20px]"
        : size === "md"
          ? "size-9.5 rounded-[13px]"
          : "size-8 rounded-[11px]";
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center bg-surface text-ink ring-1 ring-line-strong transition-colors duration-150 hover:bg-elev active:scale-[0.97]",
        s,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* Split button — "Add customer ▾" (datatable-0002) */
export function SplitButton({
  label,
  onMain,
  className,
}: {
  label: string;
  onMain?: () => void;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-stretch", className)}>
      <button
        type="button"
        onClick={onMain}
        className="btn-face btn-green h-9.5 rounded-l-full px-4.5 text-sm font-semibold"
      >
        {label}
      </button>
      <button
        type="button"
        aria-label="More options"
        className="btn-face btn-green ml-px h-9.5 rounded-r-full px-3"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9.5 6 6 6-6" />
        </svg>
      </button>
    </span>
  );
}
