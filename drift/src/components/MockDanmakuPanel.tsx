import { classNames } from "../utils/classNames";
import { Button } from "./ui";

type MockDanmakuPanelProps = {
  active: boolean;
  className?: string;
  rate: number;
  totalGenerated: number;
  onStart: () => void;
  onStop: () => void;
  onRateChange: (rate: number) => void;
  onBurst: () => void;
};

export function MockDanmakuPanel({
  active,
  className,
  rate,
  totalGenerated,
  onStart,
  onStop,
  onRateChange,
  onBurst,
}: MockDanmakuPanelProps) {
  return (
    <section
      aria-label="Mock 弹幕控制"
      className={classNames(
        "drift-theme-transition overlay-mock-panel pointer-events-auto absolute bottom-14 left-3 z-[2] box-border grid min-w-[220px] select-none gap-2 rounded-drift border border-[var(--drift-ui-border)] bg-[var(--drift-ui-overlay-glass)] px-3 py-2.5 text-[var(--drift-ui-ink)] shadow-[0_12px_32px_var(--drift-ui-overlay-shadow)] backdrop-blur-[20px]",
        className,
      )}
    >
      <header>
        <strong className="drift-theme-transition text-[11px] font-semibold text-[var(--drift-ui-signal-text)]">
          Mock 弹幕
        </strong>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          aria-label={active ? "停止 Mock" : "启动 Mock"}
          className="!border-[var(--drift-ui-border)] !bg-[var(--drift-ui-raised)] !text-[var(--drift-ui-ink-soft)] !shadow-none hover:!border-[var(--drift-ui-border-strong)] hover:!bg-[var(--drift-ui-overlay-button-hover)] hover:!text-[var(--drift-ui-ink)] focus-visible:!ring-[color-mix(in_srgb,var(--drift-ui-signal)_25%,transparent)]"
          onClick={active ? onStop : onStart}
          size="sm"
          variant="secondary"
        >
          {active ? "停止" : "启动"}
        </Button>
        <Button
          aria-label="模拟弹幕爆发"
          className="!border-[var(--drift-ui-border)] !bg-[var(--drift-ui-raised)] !text-[var(--drift-ui-ink-soft)] !shadow-none hover:!border-[var(--drift-ui-border-strong)] hover:!bg-[var(--drift-ui-overlay-button-hover)] hover:!text-[var(--drift-ui-ink)] focus-visible:!ring-[color-mix(in_srgb,var(--drift-ui-signal)_25%,transparent)]"
          onClick={onBurst}
          size="sm"
          variant="secondary"
        >
          模拟爆发
        </Button>
      </div>

      <label className="grid grid-cols-[36px_minmax(0,1fr)_48px] items-center gap-1.5">
        <span className="drift-theme-transition text-[11px] text-[var(--drift-ui-overlay-auxiliary)]">
          速率
        </span>
        <input
          aria-label="Mock 弹幕速率"
          className="overlay-mock-slider w-full accent-[var(--drift-ui-signal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--drift-ui-signal)_25%,transparent)]"
          max="200"
          min="5"
          onChange={(event) =>
            onRateChange(Number(event.currentTarget.value))
          }
          step="5"
          type="range"
          value={rate}
        />
        <strong className="drift-data-text drift-theme-transition text-right text-[10px] font-medium text-[var(--drift-ui-overlay-auxiliary)]">
          {rate} 条/秒
        </strong>
      </label>

      <footer className="flex items-center gap-1.5">
        <span
          className={classNames(
            "drift-theme-transition size-1.5 shrink-0 rounded-full",
            active
              ? "bg-[var(--drift-ui-success)]"
              : "bg-[var(--drift-ui-disabled)]",
          )}
        />
        <span className="drift-theme-transition text-[11px] text-[var(--drift-ui-overlay-auxiliary)]">
          {active ? "运行中" : "已停止"}
        </span>
        <span className="drift-data-text drift-theme-transition ml-auto text-[10px] text-[var(--drift-ui-muted)]">
          已生成 {totalGenerated.toLocaleString()} 条
        </span>
      </footer>
    </section>
  );
}
