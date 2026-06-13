import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../utils/classNames";

type PanelProps = HTMLAttributes<HTMLElement> & {
  description?: ReactNode;
  title?: ReactNode;
};

export function Panel({
  children,
  className,
  description,
  title,
  ...props
}: PanelProps) {
  return (
    <section
      className={classNames(
        "grid gap-3 rounded-drift border border-drift-border bg-drift-panel p-4 text-drift-text",
        className,
      )}
      {...props}
    >
      {title || description ? (
        <header className="grid gap-1">
          {title ? (
            <h2 className="m-0 text-xs font-bold text-drift-text">{title}</h2>
          ) : null}
          {description ? (
            <p className="m-0 text-[11px] leading-5 text-drift-muted">
              {description}
            </p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
