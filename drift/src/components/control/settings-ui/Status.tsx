import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../../utils/classNames";

export type StatusTone =
  | "neutral"
  | "signal"
  | "success"
  | "warning"
  | "danger";

const DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-[var(--drift-ui-disabled)]",
  signal: "bg-[var(--drift-ui-signal)]",
  success: "bg-[var(--drift-ui-success)]",
  warning: "bg-[var(--drift-ui-warning)]",
  danger: "bg-[var(--drift-ui-danger)]",
};

const BANNER_CLASSES: Record<StatusTone, string> = {
  neutral: "border-[var(--drift-ui-border)] bg-[var(--drift-ui-raised)] text-[var(--drift-ui-ink-soft)]",
  signal: "border-[var(--drift-ui-signal)] bg-[var(--drift-ui-selected)] text-[var(--drift-ui-signal-text)]",
  success: "border-[var(--drift-ui-success-border)] bg-[var(--drift-ui-success-soft)] text-[var(--drift-ui-success)]",
  warning: "border-[var(--drift-ui-warning-border)] bg-[var(--drift-ui-warning-soft)] text-[var(--drift-ui-warning)]",
  danger: "border-[var(--drift-ui-danger-border)] bg-[var(--drift-ui-danger-soft)] text-[var(--drift-ui-danger)]",
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
        "drift-theme-transition inline-flex min-w-0 items-center gap-2 text-[10px] text-[var(--drift-ui-ink-soft)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={classNames(
          "drift-theme-transition size-2 shrink-0 rounded-full",
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
        "drift-status-banner grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 max-[519px]:grid-cols-1",
        BANNER_CLASSES[tone],
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      <div className="grid min-w-0 gap-0.5">
        <strong className="drift-theme-transition truncate text-[10px]">
          {title}
        </strong>
        {description ? (
          <span className="drift-theme-transition text-[9px] leading-4">
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
