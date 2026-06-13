import {
  defaultOverlayShortcutLabel,
  defaultSendDanmakuShortcutLabel,
  defaultShortcutLabel,
} from "../../types/config";
import { Button, Input } from "../ui";

type ShortcutSettingsProps = {
  draftOverlayShortcut: string;
  draftSendShortcut: string;
  draftShortcut: string;
  onOverlayShortcutChange: (shortcut: string) => void;
  onResetOverlayShortcut: () => void;
  onResetSendShortcut: () => void;
  onResetShortcut: () => void;
  onSaveOverlayShortcut: () => void;
  onSaveSendShortcut: () => void;
  onSaveShortcut: () => void;
  onSendShortcutChange: (shortcut: string) => void;
  onShortcutChange: (shortcut: string) => void;
  shortcutError: string;
};

export function ShortcutSettings({
  draftOverlayShortcut,
  draftSendShortcut,
  draftShortcut,
  onOverlayShortcutChange,
  onResetOverlayShortcut,
  onResetSendShortcut,
  onResetShortcut,
  onSaveOverlayShortcut,
  onSaveSendShortcut,
  onSaveShortcut,
  onSendShortcutChange,
  onShortcutChange,
  shortcutError,
}: ShortcutSettingsProps) {
  const shortcutRows = [
    {
      id: "edit-shortcut-input",
      label: "编辑模式",
      onChange: onShortcutChange,
      onSave: onSaveShortcut,
      placeholder: defaultShortcutLabel(),
      value: draftShortcut,
    },
    {
      id: "overlay-shortcut-input",
      label: "弹幕窗口",
      onChange: onOverlayShortcutChange,
      onSave: onSaveOverlayShortcut,
      placeholder: defaultOverlayShortcutLabel(),
      value: draftOverlayShortcut,
    },
    {
      id: "send-shortcut-input",
      label: "发送弹幕",
      onChange: onSendShortcutChange,
      onSave: onSaveSendShortcut,
      placeholder: defaultSendDanmakuShortcutLabel(),
      value: draftSendShortcut,
    },
  ];

  return (
    <div className="grid min-h-0 content-start gap-3.5 overflow-hidden">
      {shortcutRows.map((row) => (
        <div
          className="grid grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-2"
          key={row.id}
        >
          <label
            className="text-[13px] font-semibold text-[#1f1f1f]"
            htmlFor={row.id}
          >
            {row.label}
          </label>
          <Input
            id={row.id}
            onChange={(event) => row.onChange(event.currentTarget.value)}
            placeholder={row.placeholder}
            value={row.value}
          />
          <Button onClick={row.onSave}>保存</Button>
        </div>
      ))}
      {shortcutError ? (
        <p className="m-0 text-[11px] leading-snug text-[#b45f06]">
          {shortcutError}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={onResetShortcut}>
          恢复编辑模式快捷键
        </Button>
        <Button onClick={onResetOverlayShortcut}>
          恢复弹幕窗口快捷键
        </Button>
        <Button onClick={onResetSendShortcut}>
          恢复发送弹幕快捷键
        </Button>
      </div>
    </div>
  );
}
