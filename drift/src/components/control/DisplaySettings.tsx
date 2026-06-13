import { invoke } from "@tauri-apps/api/core";
import type { AppearanceConfig, MessageDisplayConfig } from "../../types/config";
import { Button, SegmentedControl, Toggle } from "../ui";
import { ControlSlider } from "./ControlSlider";

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
    <div className="grid min-h-0 content-start gap-3.5 overflow-y-auto pr-1">
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
      <div className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-2.5">
        <span className="text-[13px] font-semibold text-[#1f1f1f]">
          显示密度
        </span>
        <SegmentedControl
          ariaLabel="显示密度"
          className="w-full grid-cols-3"
          onChange={(density) => onUpdateAppearance({ density })}
          options={DENSITY_OPTIONS}
          value={appearance.density}
        />
      </div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2.5">
        <span className="text-[13px] font-semibold text-[#1f1f1f]">
          显示用户名
        </span>
        <Toggle
          aria-label="显示用户名"
          checked={appearance.showUsername}
          onCheckedChange={(checked) =>
            onUpdateAppearance({ showUsername: checked })
          }
        />
      </div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-2.5">
        <span className="text-[13px] font-semibold text-[#1f1f1f]">
          弹幕颜色
        </span>
        <span className="text-[11px] font-medium text-[#606873]">统一白色</span>
      </div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2.5">
        <span className="pt-1.5 text-[13px] font-semibold text-[#1f1f1f]">
          消息类型
        </span>
        <div className="grid w-[min(392px,100%)] grid-cols-2 gap-2">
          {messageTypeOptions.map((option) => (
            <div
              className="flex min-h-8 items-center justify-between gap-2 rounded-drift border border-[#d2d2d2] bg-white/70 px-2.5 shadow-drift-control"
              key={option.label}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-[#202124]">
                {option.label}
              </span>
              <Toggle
                aria-label={option.label}
                checked={option.checked}
                className="h-4 w-8 [&>span]:size-3 aria-checked:[&>span]:translate-x-4"
                onCheckedChange={option.onChange}
              />
            </div>
          ))}
        </div>
      </div>
      <fieldset className="m-[6px_0_0] grid gap-2.5 rounded-sm border border-[#d1d1d1] bg-[#e7e7e7] px-[18px] pb-3.5 pt-4">
        <legend className="px-2 text-[11px] font-semibold text-[#333333]">
          弹幕窗口
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => invoke("show_window", { label: "main" })}>
            显示弹幕窗口
          </Button>
          <Button onClick={() => invoke("hide_window", { label: "main" })}>
            隐藏弹幕窗口
          </Button>
        </div>
      </fieldset>
      <div className="grid w-[min(160px,100%)]">
        <Button onClick={onResetAppearance}>恢复默认显示设置</Button>
      </div>
    </div>
  );
}
