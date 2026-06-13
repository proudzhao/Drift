import { classNames } from "../utils/classNames";

type MockDanmakuPanelProps = {
  active: boolean;
  rate: number;
  totalGenerated: number;
  onStart: () => void;
  onStop: () => void;
  onRateChange: (rate: number) => void;
  onBurst: () => void;
};

const PANEL_CLASS =
  "pointer-events-auto absolute bottom-14 left-3 grid min-w-[220px] select-none gap-2 rounded-drift border border-[rgba(126,168,196,0.45)] bg-[rgba(15,17,21,0.78)] px-3 py-2.5 text-[rgba(255,255,255,0.92)] shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-md [backdrop-filter:blur(12px)]";

const ACTION_CLASS =
  "min-h-[26px] cursor-pointer rounded-md border border-[rgba(126,168,196,0.58)] bg-[rgba(126,168,196,0.2)] px-2 text-[11px] font-semibold text-white transition-colors hover:bg-[rgba(126,168,196,0.36)]";

export function MockDanmakuPanel({
  active,
  rate,
  totalGenerated,
  onStart,
  onStop,
  onRateChange,
  onBurst,
}: MockDanmakuPanelProps) {
  return (
    <section className={PANEL_CLASS} aria-label="Mock danmaku controls">
      <header>
        <strong className="text-[11px] font-semibold">Mock 弹幕</strong>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        {active ? (
          <button className={ACTION_CLASS} onClick={onStop} type="button">
            停止
          </button>
        ) : (
          <button className={ACTION_CLASS} onClick={onStart} type="button">
            启动
          </button>
        )}
        <button className={ACTION_CLASS} onClick={onBurst} type="button">
          模拟爆发
        </button>
      </div>

      <label className="grid grid-cols-[36px_minmax(0,1fr)_48px] items-center gap-1.5">
        <span className="text-[11px] text-[rgba(255,255,255,0.72)]">
          速率
        </span>
        <input
          className="w-full accent-[#4a90a4]"
          max="200"
          min="5"
          onChange={(event) => onRateChange(Number(event.target.value))}
          step="5"
          type="range"
          value={rate}
        />
        <strong className="text-right text-[10px] font-medium text-[rgba(255,255,255,0.64)]">
          {rate} 条/秒
        </strong>
      </label>

      <footer className="flex items-center gap-1.5">
        <span
          className={classNames(
            "size-1.5 shrink-0 rounded-full",
            active
              ? "bg-[#34c759] shadow-[0_0_6px_rgba(52,199,89,0.45)]"
              : "bg-[rgba(255,255,255,0.3)]",
          )}
        />
        <span className="text-[11px] text-[rgba(255,255,255,0.64)]">
          {active ? "运行中" : "已停止"}
        </span>
        <span className="ml-auto text-[10px] text-[rgba(255,255,255,0.48)]">
          已生成 {totalGenerated.toLocaleString()} 条
        </span>
      </footer>
    </section>
  );
}
