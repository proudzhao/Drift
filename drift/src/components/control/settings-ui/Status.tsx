import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../../utils/classNames";

export type StatusTone =
  | "neutral"
  | "signal"
  | "success"
  | "warning"
  | "danger";

const DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-[#65777d]",
  signal: "bg-drift-signal shadow-[0_0_8px_rgba(50,199,217,0.5)]",
  success: "bg-[var(--control-success)]",
  warning: "bg-[var(--control-warning)]",
  danger: "bg-[var(--control-danger)]",
};

const BANNER_CLASSES: Record<StatusTone, string> = {
  neutral: "border-[#29414a] bg-[#101c21]",
  signal: "border-[#28505b] bg-[#0b1a1f]",
  success: "border-[rgba(66,201,131,0.4)] bg-[rgba(66,201,131,0.08)]",
  warning: "border-[rgba(230,161,90,0.45)] bg-[rgba(230,161,90,0.08)]",
  danger: "border-[rgba(224,108,117,0.45)] bg-[rgba(224,108,117,0.09)]",
};

type StatusDotProps = HTMLAttributes<HTMLSpanElement> & {
  label: ReactNode;
  tone?: StatusTone;
};

export function StatusDot({
  className,
  label,
  tone = "neutral",
  ...props
}: StatusDotProps) {
  return (
    <span
      className={classNames(
        "inline-flex min-w-0 items-center gap-2 text-[10px] text-[#9db4ba]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={classNames(
          "size-2 shrink-0 rounded-full",
          DOT_CLASSES[tone],
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

type StatusBannerProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
  tone?: StatusTone;
};

export function StatusBanner({
  actions,
  className,
  description,
  title,
  tone = "neutral",
  ...props
}: StatusBannerProps) {
  return (
    <div
      className={classNames(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 max-[519px]:grid-cols-1",
        BANNER_CLASSES[tone],
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      <div className="grid min-w-0 gap-0.5">
        <strong className="truncate text-[10px] text-[#bdeff5]">
          {title}
        </strong>
        {description ? (
          <span className="text-[9px] leading-4 text-[#789097]">
            {description}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  );
}
