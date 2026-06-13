import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../utils/classNames";

type SectionHeaderProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
};

export function SectionHeader({
  actions,
  className,
  description,
  title,
  ...props
}: SectionHeaderProps) {
  return (
    <header
      className={classNames(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3",
        className,
      )}
      {...props}
    >
      <div className="grid gap-1">
        <h2 className="m-0 text-xs font-bold text-drift-text">{title}</h2>
        {description ? (
          <p className="m-0 text-[11px] leading-5 text-drift-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
