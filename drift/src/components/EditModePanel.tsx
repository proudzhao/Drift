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
  return (
    <aside className="edit-panel">
      <div>
        <strong>编辑模式</strong>
        <span>{shortcut} 切换显示模式</span>
      </div>
      {onToggleHistory ? (
        <button
          className={showHistory ? "is-active" : ""}
          onClick={onToggleHistory}
          type="button"
        >
          弹幕历史
        </button>
      ) : null}
      {onToggleStats ? (
        <button
          className={showStats ? "is-active" : ""}
          onClick={onToggleStats}
          type="button"
        >
          统计
        </button>
      ) : null}
      <button onClick={onExitEditMode} type="button">
        完成
      </button>
    </aside>
  );
}
