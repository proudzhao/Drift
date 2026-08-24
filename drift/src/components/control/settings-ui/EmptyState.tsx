import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../../utils/classNames";

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  action?: ReactNode;
  description: ReactNode;
  title: ReactNode;
};

export function EmptyState({
  action,
  className,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={classNames(
        "drift-theme-transition grid min-h-28 place-items-center content-center gap-1.5 rounded-lg border border-dashed border-[var(--drift-ui-border)] bg-[var(--drift-ui-surface)] px-4 text-center",
        className,
      )}
      {...props}
    >
      <strong className="drift-theme-transition text-[11px] text-[var(--drift-ui-ink-soft)]">{title}</strong>
      <span className="drift-theme-transition text-[9px] leading-4 text-[var(--drift-ui-subtle)]">{description}</span>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
