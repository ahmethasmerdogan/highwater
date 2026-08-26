"use client";

/**
 * Form denetimleri.
 *
 * İki kural:
 *
 * 1. **Her alanın etiketi vardır ve etiket denetime bağlıdır.** Yer tutucu
 *    metin bir etiket değildir — kullanıcı yazmaya başlayınca kaybolur ve
 *    alanın ne olduğu ekranda kalmaz.
 * 2. **Sayısal alanlar `sn-num`dur.** Girilen sayı da hizalanır; bozulmaz
 *    kural 6 yalnızca gösterim için değil.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cx } from "./cx";
import { InfoDot } from "./explain";

/* ------------------------------------------------------------------ */

/** Etiket + denetim + açıklama + hata sarmalayıcısı. */
export function FormField({
  label,
  term,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  term?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1"
        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
      >
        {label}
        {(term || hint) && <InfoDot id={term} text={hint} />}
      </label>
      {children}
      {error && (
        <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-down)" }}>{error}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const CONTROL: React.CSSProperties = {
  background: "var(--sn-sunken)",
  color: "var(--sn-ink)",
  border: "1px solid transparent",
  fontSize: "var(--sn-t-body)",
};

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean }>(
  function TextInput({ numeric, className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          "sn-focus h-8 w-full rounded-[var(--sn-r-sm)] px-2.5 outline-none placeholder:text-[var(--sn-ink-4)]",
          numeric && "sn-num text-right",
          "disabled:opacity-50",
          className,
        )}
        style={CONTROL}
        {...rest}
      />
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cx(
          "sn-focus w-full rounded-[var(--sn-r-sm)] px-2.5 py-2 outline-none placeholder:text-[var(--sn-ink-4)]",
          className,
        )}
        style={{ ...CONTROL, lineHeight: 1.5, resize: "vertical" }}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cx(
          "sn-focus h-8 w-full appearance-none rounded-[var(--sn-r-sm)] pr-7 pl-2.5 outline-none",
          className,
        )}
        style={{
          ...CONTROL,
          /* Ok işareti arka plan görseli: `appearance: none` tarayıcının
             kendi okunu da siler ve alan düz bir kutuya dönerdi. */
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23838d9b' stroke-width='1.8' stroke-linecap='round'><path d='m5 9 7 7 7-7'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 6px center",
        }}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

/* ------------------------------------------------------------------ */

/**
 * Açma/kapama anahtarı.
 *
 * Etiket **anahtarın kendisine** bağlıdır: yalnızca anahtara tıklanabilen
 * bir denetim, dokunmatik ekranda 20 piksellik bir hedef demektir.
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <label
        htmlFor={id}
        className="min-w-0 cursor-pointer"
        style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
      >
        {label}
        {hint && (
          <span
            className="mt-0.5 block"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.45 }}
          >
            {hint}
          </span>
        )}
      </label>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="sn-focus relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors duration-[var(--sn-dur-1)] disabled:opacity-45"
        style={{ background: checked ? "var(--sn-brand-solid)" : "var(--sn-border-strong)" }}
      >
        <SwitchPrimitive.Thumb
          className="block h-[16px] w-[16px] rounded-full transition-transform duration-[var(--sn-dur-1)]"
          style={{
            background: "#ffffff",
            transform: checked ? "translateX(16px)" : "translateX(2px)",
          }}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}
