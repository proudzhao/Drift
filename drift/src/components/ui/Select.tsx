import type { SelectHTMLAttributes } from "react";
import { classNames } from "../../utils/classNames";

type SelectSize = "sm" | "md";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  selectSize?: SelectSize;
};

const SIZE_CLASSES: Record<SelectSize, string> = {
  sm: "min-h-7 px-2 text-[11px]",
  md: "min-h-8 px-2.5 text-xs",
};

export function Select({
  className,
  invalid = false,
  selectSize = "md",
  ...props
}: SelectProps) {
  return (
    <select
      className={classNames(
        "box-border w-full cursor-pointer rounded-drift border bg-white text-drift-text shadow-inner outline-none transition-colors",
        "focus:border-drift-primary focus:ring-2 focus:ring-drift-primary/15",
        "disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-400",
        SIZE_CLASSES[selectSize],
        invalid ? "border-drift-danger" : "border-drift-border",
        className,
      )}
      {...props}
    />
  );
}
