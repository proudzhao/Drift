import type { ButtonHTMLAttributes } from "react";
import { classNames } from "../../utils/classNames";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  fullWidth?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border-drift-primary bg-drift-primary text-white shadow-drift-control hover:bg-drift-primary-hover",
  secondary:
    "border-drift-border bg-white text-drift-text shadow-drift-control hover:bg-slate-50",
  danger:
    "border-red-200 bg-drift-danger-bg text-drift-danger shadow-drift-control hover:bg-red-100",
  ghost:
    "border-transparent bg-transparent text-drift-muted hover:bg-slate-200/70",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-7 px-2 text-[10px]",
  md: "min-h-8 px-3 text-[11px]",
};

export function Button({
  active = false,
  className,
  fullWidth = false,
  size = "md",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(
        "inline-flex cursor-pointer appearance-none items-center justify-center gap-1.5 rounded-drift border font-semibold leading-none transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-primary/25",
        "disabled:cursor-default disabled:opacity-45",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        active &&
          variant !== "primary" &&
          "border-drift-primary bg-blue-50 text-drift-primary",
        fullWidth && "w-full",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
