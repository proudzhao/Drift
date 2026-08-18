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
        "overlay-mock-panel pointer-events-auto absolute bottom-14 left-3 z-[2] box-border grid min-w-[220px] select-none gap-2 rounded-drift border border-[#29414a] bg-[rgba(7,16,20,.92)] px-3 py-2.5 text-[#eaf6f7] shadow-[0_12px_32px_rgba(0,0,0,.32)] backdrop-blur-[20px]",
        className,
      )}
    >
      <header>
        <strong className="text-[11px] font-semibold text-[#62d7e4]">
          Mock 弹幕
        </strong>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          aria-label={active ? "停止 Mock" : "启动 Mock"}
          className="!border-[#29414a] !bg-[#132027] !text-[#c7dadd] !shadow-none hover:!border-[#3a5964] hover:!bg-[#182a31] hover:!text-[#eaf6f7] focus-visible:!ring-[#32c7d9]/25"
          onClick={active ? onStop : onStart}
          size="sm"
          variant="secondary"
        >
          {active ? "停止" : "启动"}
        </Button>
        <Button
          aria-label="模拟弹幕爆发"
          className="!border-[#29414a] !bg-[#132027] !text-[#c7dadd] !shadow-none hover:!border-[#3a5964] hover:!bg-[#182a31] hover:!text-[#eaf6f7] focus-visible:!ring-[#32c7d9]/25"
          onClick={onBurst}
          size="sm"
          variant="secondary"
        >
          模拟爆发
        </Button>
      </div>

      <label className="grid grid-cols-[36px_minmax(0,1fr)_48px] items-center gap-1.5">
        <span className="text-[11px] text-[#9db3b8]">
          速率
        </span>
        <input
          aria-label="Mock 弹幕速率"
          className="overlay-mock-slider w-full accent-[#32c7d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#32c7d9]/25"
          max="200"
          min="5"
          onChange={(event) =>
            onRateChange(Number(event.currentTarget.value))
          }
          step="5"
          type="range"
          value={rate}
        />
        <strong className="drift-data-text text-right text-[10px] font-medium text-[#9db3b8]">
          {rate} 条/秒
        </strong>
      </label>

      <footer className="flex items-center gap-1.5">
        <span
          className={classNames(
            "size-1.5 shrink-0 rounded-full",
            active ? "bg-[#42c983]" : "bg-[#506970]",
          )}
        />
        <span className="text-[11px] text-[#9db3b8]">
          {active ? "运行中" : "已停止"}
        </span>
        <span className="drift-data-text ml-auto text-[10px] text-[#789097]">
          已生成 {totalGenerated.toLocaleString()} 条
        </span>
      </footer>
    </section>
  );
}
