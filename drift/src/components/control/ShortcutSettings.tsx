import {
  defaultOverlayShortcutLabel,
  defaultSendDanmakuShortcutLabel,
  defaultShortcutLabel,
} from "../../types/config";
import { Button, Input } from "../ui";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusBanner,
} from "./settings-ui";

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
    <SettingsPage>
      <SettingsSection description="修改后分别保存" title="快捷键">
        {shortcutRows.map((row) => (
          <SettingsRow
            control={
              <div className="grid min-w-[240px] grid-cols-[minmax(0,1fr)_64px] gap-2 max-[519px]:min-w-0">
                <Input
                  id={row.id}
                  onChange={(event) =>
                    row.onChange(event.currentTarget.value)
                  }
                  placeholder={row.placeholder}
                  value={row.value}
                />
                <Button onClick={row.onSave}>保存</Button>
              </div>
            }
            htmlFor={row.id}
            key={row.id}
            label={row.label}
          />
        ))}
      </SettingsSection>

      {shortcutError ? (
        <StatusBanner
          description={shortcutError}
          title="快捷键保存失败"
          tone="danger"
        />
      ) : null}

      <SettingsSection description="恢复 Drift 默认组合" title="重置">
        <SettingsRow
          control={<Button onClick={onResetShortcut}>恢复</Button>}
          description="恢复默认编辑模式快捷键"
          label="编辑模式"
        />
        <SettingsRow
          control={<Button onClick={onResetOverlayShortcut}>恢复</Button>}
          description="恢复默认弹幕窗口快捷键"
          label="弹幕窗口"
        />
        <SettingsRow
          control={<Button onClick={onResetSendShortcut}>恢复</Button>}
          description="恢复默认发送弹幕快捷键"
          label="发送弹幕"
        />
      </SettingsSection>
    </SettingsPage>
  );
}
