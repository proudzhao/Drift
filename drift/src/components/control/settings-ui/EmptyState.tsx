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
        "grid min-h-28 place-items-center content-center gap-1.5 rounded-lg border border-dashed border-[#29414a] bg-[#0d191e] px-4 text-center",
        className,
      )}
      {...props}
    >
      <strong className="text-[11px] text-[#b9cdd1]">{title}</strong>
      <span className="text-[9px] leading-4 text-[#657d84]">{description}</span>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
