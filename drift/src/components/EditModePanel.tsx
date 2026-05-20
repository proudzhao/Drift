type EditModePanelProps = {
  shortcut: string;
  onExitEditMode: () => void;
};

export function EditModePanel({ shortcut, onExitEditMode }: EditModePanelProps) {
  return (
    <aside className="edit-panel">
      <div>
        <strong>编辑模式</strong>
        <span>{shortcut} 切换显示模式</span>
      </div>
      <button onClick={onExitEditMode} type="button">
        完成
      </button>
    </aside>
  );
}
