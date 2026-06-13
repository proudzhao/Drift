import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../utils/classNames";

type FormRowProps = HTMLAttributes<HTMLDivElement> & {
  control: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
};

export function FormRow({
  className,
  control,
  description,
  htmlFor,
  label,
  ...props
}: FormRowProps) {
  const labelContent = (
    <span className="text-xs font-semibold text-drift-text">{label}</span>
  );

  return (
    <div
      className={classNames(
        "grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3",
        className,
      )}
      {...props}
    >
      <div className="grid gap-0.5">
        {htmlFor ? (
          <label className="contents" htmlFor={htmlFor}>
            {labelContent}
          </label>
        ) : (
          labelContent
        )}
        {description ? (
          <span className="text-[11px] leading-4 text-drift-muted">
            {description}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">{control}</div>
    </div>
  );
}
