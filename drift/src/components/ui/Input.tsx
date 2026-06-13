import type { InputHTMLAttributes } from "react";
import { classNames } from "../../utils/classNames";

type InputSize = "sm" | "md";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  inputSize?: InputSize;
};

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: "min-h-7 px-2 text-[11px]",
  md: "min-h-8 px-2.5 text-xs",
};

export function Input({
  className,
  invalid = false,
  inputSize = "md",
  ...props
}: InputProps) {
  return (
    <input
      className={classNames(
        "box-border w-full rounded-drift border bg-white text-drift-text shadow-inner outline-none transition-colors",
        "placeholder:text-slate-400",
        "focus:border-drift-primary focus:ring-2 focus:ring-drift-primary/15",
        "disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-400",
        SIZE_CLASSES[inputSize],
        invalid ? "border-drift-danger" : "border-drift-border",
        className,
      )}
      {...props}
    />
  );
}
