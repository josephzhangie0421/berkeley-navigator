import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-strong disabled:bg-line-strong disabled:text-white",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-ink-soft disabled:text-muted",
  ghost: "text-ink hover:bg-ink-soft disabled:text-muted",
  danger: "bg-surface text-danger border border-danger/40 hover:bg-danger-soft",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
