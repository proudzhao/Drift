import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../../utils/classNames";

export function SettingsPage({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={classNames(
        "settings-scroll-list box-border grid h-full min-h-0 content-start gap-3 overflow-y-auto px-5 py-4 text-drift-ink max-[619px]:px-4",
        className,
      )}
      {...props}
    />
  );
}

type SettingsSectionProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
};

export function SettingsSection({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: SettingsSectionProps) {
  const ariaLabel = typeof title === "string" ? title : undefined;
  return (
    <section
      aria-label={ariaLabel}
      className={classNames("grid gap-1.5", className)}
      {...props}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-1">
        <div className="grid gap-0.5">
          <h2 className="m-0 text-[9px] font-bold uppercase tracking-[0.1em] text-[#789097]">
            {title}
          </h2>
          {description ? (
            <p className="m-0 text-[9px] leading-4 text-[#60777e]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </header>
      <div className="overflow-hidden rounded-lg border border-drift-line bg-[#101c21]">
        {children}
      </div>
    </section>
  );
}

type SettingsRowProps = HTMLAttributes<HTMLDivElement> & {
  control: ReactNode;
  description?: ReactNode;
  descriptionLayout?: "separate" | "inline";
  htmlFor?: string;
  label: ReactNode;
};

export function SettingsRow({
  className,
  control,
  description,
  descriptionLayout = "separate",
  htmlFor,
  label,
  ...props
}: SettingsRowProps) {
  const labelNode = (
    <span className="text-[11px] font-semibold text-drift-ink">{label}</span>
  );
  const labelElement = htmlFor ? (
    <label htmlFor={htmlFor}>{labelNode}</label>
  ) : (
    labelNode
  );
  const descriptionNode = (
    <span className="min-w-0 text-[9px] leading-4 text-[#6f878e] max-[519px]:col-span-2 max-[519px]:row-start-2">
      {description}
    </span>
  );

  return (
    <div
      className={classNames(
        "grid min-h-10 items-center gap-3 border-t border-drift-line px-3 first:border-t-0 max-[519px]:grid-cols-[minmax(0,1fr)_max-content] max-[519px]:gap-x-2 max-[519px]:py-2",
        descriptionLayout === "inline"
          ? "grid-cols-[minmax(0,1fr)_max-content]"
          : "grid-cols-[88px_minmax(0,1fr)_max-content]",
        className,
      )}
      data-description-layout={descriptionLayout}
      {...props}
    >
      {descriptionLayout === "inline" ? (
        <div className="settings-row-metadata grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-2 max-[519px]:contents">
          {labelElement}
          {descriptionNode}
        </div>
      ) : (
        <>
          {labelElement}
          {descriptionNode}
        </>
      )}
      <div className="min-w-0 max-[519px]:col-start-2 max-[519px]:row-start-1">
        {control}
      </div>
    </div>
  );
}

export function Toolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={classNames(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2",
        className,
      )}
      role="toolbar"
      {...props}
    />
  );
}

export function DataValue({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={classNames(
        "drift-data-text min-w-0 truncate text-[10px] text-[#9db4ba]",
        className,
      )}
      {...props}
    />
  );
}
