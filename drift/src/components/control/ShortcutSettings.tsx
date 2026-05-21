import {
  defaultOverlayShortcutLabel,
  defaultShortcutLabel,
} from "../../types/config";

type ShortcutSettingsProps = {
  draftOverlayShortcut: string;
  draftShortcut: string;
  onOverlayShortcutChange: (shortcut: string) => void;
  onResetOverlayShortcut: () => void;
  onResetShortcut: () => void;
  onSaveOverlayShortcut: () => void;
  onSaveShortcut: () => void;
  onShortcutChange: (shortcut: string) => void;
  shortcutError: string;
};

export function ShortcutSettings({
  draftOverlayShortcut,
  draftShortcut,
  onOverlayShortcutChange,
  onResetOverlayShortcut,
  onResetShortcut,
  onSaveOverlayShortcut,
  onSaveShortcut,
  onShortcutChange,
  shortcutError,
}: ShortcutSettingsProps) {
  return (
    <div className="settings-page shortcut-settings">
      <div className="settings-row shortcut-form">
        <label htmlFor="edit-shortcut-input">编辑模式</label>
        <input
          id="edit-shortcut-input"
          onChange={(event) => onShortcutChange(event.currentTarget.value)}
          placeholder={defaultShortcutLabel()}
          value={draftShortcut}
        />
        <button onClick={onSaveShortcut} type="button">
          保存
        </button>
      </div>
      <div className="settings-row shortcut-form">
        <label htmlFor="overlay-shortcut-input">弹幕窗口</label>
        <input
          id="overlay-shortcut-input"
          onChange={(event) =>
            onOverlayShortcutChange(event.currentTarget.value)
          }
          placeholder={defaultOverlayShortcutLabel()}
          value={draftOverlayShortcut}
        />
        <button onClick={onSaveOverlayShortcut} type="button">
          保存
        </button>
      </div>
      {shortcutError ? <p className="control-error">{shortcutError}</p> : null}
      <div className="settings-actions">
        <button onClick={onResetShortcut} type="button">
          恢复编辑模式快捷键
        </button>
        <button onClick={onResetOverlayShortcut} type="button">
          恢复弹幕窗口快捷键
        </button>
      </div>
    </div>
  );
}
