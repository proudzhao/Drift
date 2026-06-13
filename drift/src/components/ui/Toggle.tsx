import type { ButtonHTMLAttributes } from "react";
import { classNames } from "../../utils/classNames";

type ToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Toggle({
  checked,
  className,
  disabled = false,
  onCheckedChange,
  onClick,
  type = "button",
  ...props
}: ToggleProps) {
  return (
    <button
      aria-checked={checked}
      className={classNames(
        "inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer appearance-none items-center rounded-full border p-0.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-primary/25",
        "disabled:cursor-default disabled:opacity-45",
        checked
          ? "border-drift-primary bg-drift-primary"
          : "border-drift-border bg-slate-200",
        className,
      )}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
          onCheckedChange(!checked);
        }
      }}
      role="switch"
      type={type}
      {...props}
    >
      <span
        className={classNames(
          "block size-[17px] rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
