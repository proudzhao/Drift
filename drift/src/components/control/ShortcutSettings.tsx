import { defaultShortcutLabel } from "../../types/config";

type ShortcutSettingsProps = {
  draftShortcut: string;
  onResetShortcut: () => void;
  onSaveShortcut: () => void;
  onShortcutChange: (shortcut: string) => void;
  shortcutError: string;
};

export function ShortcutSettings({
  draftShortcut,
  onResetShortcut,
  onSaveShortcut,
  onShortcutChange,
  shortcutError,
}: ShortcutSettingsProps) {
  return (
    <div className="settings-page shortcut-page">
      <div className="settings-row shortcut-form">
        <label htmlFor="shortcut-input">编辑模式</label>
        <input
          id="shortcut-input"
          onChange={(event) => onShortcutChange(event.currentTarget.value)}
          placeholder={defaultShortcutLabel()}
          value={draftShortcut}
        />
        <button onClick={onSaveShortcut} type="button">
          保存
        </button>
      </div>
      {shortcutError ? <p className="control-error">{shortcutError}</p> : null}
      <div className="settings-actions single-action">
        <button onClick={onResetShortcut} type="button">
          恢复快捷键
        </button>
      </div>
    </div>
  );
}
