import { invoke } from "@tauri-apps/api/core";
import type { AppearanceConfig, MessageDisplayConfig } from "../../types/config";
import { Button, SegmentedControl, Toggle } from "../ui";
import { ControlSlider } from "./ControlSlider";
import {
  DataValue,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./settings-ui";

type DisplaySettingsProps = {
  appearance: AppearanceConfig;
  messageDisplay: MessageDisplayConfig;
  onResetAppearance: () => void;
  onUpdateAppearance: (appearance: Partial<AppearanceConfig>) => void;
  onUpdateMessageDisplay: (messageDisplay: Partial<MessageDisplayConfig>) => void;
};

const DENSITY_LABELS: Record<AppearanceConfig["density"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const DENSITY_OPTIONS: Array<{
  label: string;
  value: AppearanceConfig["density"];
}> = [
  { label: DENSITY_LABELS.low, value: "low" },
  { label: DENSITY_LABELS.medium, value: "medium" },
  { label: DENSITY_LABELS.high, value: "high" },
];

export function DisplaySettings({
  appearance,
  messageDisplay,
  onResetAppearance,
  onUpdateAppearance,
  onUpdateMessageDisplay,
}: DisplaySettingsProps) {
  const messageTypeOptions: Array<{
    checked: boolean;
    label: string;
    onChange: (checked: boolean) => void;
  }> = [
    {
      checked: messageDisplay.showDanmaku,
      label: "普通弹幕",
      onChange: (checked) => onUpdateMessageDisplay({ showDanmaku: checked }),
    },
    {
      checked: messageDisplay.showGift,
      label: "礼物消息",
      onChange: (checked) => onUpdateMessageDisplay({ showGift: checked }),
    },
    {
      checked: messageDisplay.showGuard,
      label: "上舰消息",
      onChange: (checked) => onUpdateMessageDisplay({ showGuard: checked }),
    },
    {
      checked: messageDisplay.showSuperChat,
      label: "醒目留言",
      onChange: (checked) =>
        onUpdateMessageDisplay({ showSuperChat: checked }),
    },
  ];

  return (
    <SettingsPage>
      <SettingsSection title="外观">
        <ControlSlider
          label="字号"
          max={32}
          min={14}
          onChange={(value) => onUpdateAppearance({ fontSize: value })}
          suffix="px"
          value={appearance.fontSize}
        />
        <ControlSlider
          label="透明度"
          max={100}
          min={30}
          onChange={(value) => onUpdateAppearance({ opacity: value / 100 })}
          suffix="%"
          value={Math.round(appearance.opacity * 100)}
        />
        <ControlSlider
          label="滚动速度"
          max={24}
          min={6}
          onChange={(value) => onUpdateAppearance({ scrollDuration: value })}
          suffix="秒"
          value={appearance.scrollDuration}
        />
        <SettingsRow
          control={
            <SegmentedControl
              ariaLabel="显示密度"
              className="w-full grid-cols-3"
              onChange={(density) => onUpdateAppearance({ density })}
              options={DENSITY_OPTIONS}
              value={appearance.density}
            />
          }
          label="显示密度"
        />
        <SettingsRow
          control={
            <Toggle
              aria-label="显示用户名"
              checked={appearance.showUsername}
              onCheckedChange={(checked) =>
                onUpdateAppearance({ showUsername: checked })
              }
            />
          }
          label="显示用户名"
        />
        <SettingsRow
          control={<DataValue>统一白色</DataValue>}
          label="弹幕颜色"
        />
      </SettingsSection>

      <SettingsSection title="内容">
        {messageTypeOptions.map((option) => (
          <SettingsRow
            control={
              <Toggle
                aria-label={option.label}
                checked={option.checked}
                onCheckedChange={option.onChange}
              />
            }
            key={option.label}
            label={option.label}
          />
        ))}
      </SettingsSection>

      <SettingsSection title="弹幕窗口">
        <div className="grid grid-cols-2 gap-2 p-3 max-[519px]:grid-cols-1">
          <Button onClick={() => invoke("show_window", { label: "main" })}>
            显示弹幕窗口
          </Button>
          <Button onClick={() => invoke("hide_window", { label: "main" })}>
            隐藏弹幕窗口
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="重置">
        <div className="p-3">
          <Button onClick={onResetAppearance}>恢复默认显示设置</Button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
