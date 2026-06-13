import { classNames } from "../utils/classNames";

type EditModePanelProps = {
  shortcut: string;
  onExitEditMode: () => void;
  onToggleStats?: () => void;
  onToggleHistory?: () => void;
  showHistory?: boolean;
  showStats?: boolean;
};

export function EditModePanel({
  shortcut,
  onExitEditMode,
  onToggleStats,
  onToggleHistory,
  showHistory = false,
  showStats = false,
}: EditModePanelProps) {
  const buttonClass =
    "min-h-7 flex-1 cursor-pointer whitespace-nowrap rounded-md border border-[rgba(126,168,196,0.58)] bg-[rgba(126,168,196,0.2)] px-2 text-[11px] text-white transition-colors hover:bg-[rgba(126,168,196,0.32)]";
  const activeButtonClass =
    "border-[rgba(101,214,173,0.72)] bg-[rgba(101,214,173,0.24)] text-[#e9fff7]";

  return (
    <aside className="pointer-events-auto absolute bottom-3 right-3 flex min-w-[260px] select-none items-center gap-2.5 rounded-drift border border-[rgba(126,168,196,0.45)] bg-[rgba(15,17,21,0.78)] px-2.5 py-2 text-[rgba(255,255,255,0.92)] shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-md [backdrop-filter:blur(12px)]">
      <div className="grid gap-px">
        <strong className="text-[11px] leading-tight">编辑模式</strong>
        <span className="text-[10px] leading-tight text-[rgba(255,255,255,0.64)]">
          {shortcut} 切换显示模式
        </span>
      </div>
      {onToggleHistory ? (
        <button
          className={classNames(buttonClass, showHistory && activeButtonClass)}
          onClick={onToggleHistory}
          type="button"
        >
          弹幕历史
        </button>
      ) : null}
      {onToggleStats ? (
        <button
          className={classNames(buttonClass, showStats && activeButtonClass)}
          onClick={onToggleStats}
          type="button"
        >
          统计
        </button>
      ) : null}
      <button className={buttonClass} onClick={onExitEditMode} type="button">
        完成
      </button>
    </aside>
  );
}
