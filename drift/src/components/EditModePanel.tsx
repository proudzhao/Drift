type EditModePanelProps = {
  shortcut: string;
  onExitEditMode: () => void;
  onToggleHistory?: () => void;
};

export function EditModePanel({
  shortcut,
  onExitEditMode,
  onToggleHistory,
}: EditModePanelProps) {
  return (
    <aside className="edit-panel">
      <div>
        <strong>编辑模式</strong>
        <span>{shortcut} 切换显示模式</span>
      </div>
      {onToggleHistory ? (
        <button onClick={onToggleHistory} type="button">
          弹幕历史
        </button>
      ) : null}
      <button onClick={onExitEditMode} type="button">
        完成
      </button>
    </aside>
  );
}
