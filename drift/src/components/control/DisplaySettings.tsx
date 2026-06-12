import { invoke } from "@tauri-apps/api/core";
import type { AppearanceConfig, MessageDisplayConfig } from "../../types/config";
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

export function DisplaySettings({
  appearance,
  messageDisplay,
  onResetAppearance,
  onUpdateAppearance,
  onUpdateMessageDisplay,
}: DisplaySettingsProps) {
  return (
    <div className="settings-page display-settings">
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
      <div className="settings-row control-row">
        <span>显示密度</span>
        <div className="segmented-control">
          {(["low", "medium", "high"] as const).map((density) => (
            <button
              className={appearance.density === density ? "is-active" : ""}
              key={density}
              onClick={() => onUpdateAppearance({ density })}
              type="button"
            >
              {DENSITY_LABELS[density]}
            </button>
          ))}
        </div>
      </div>
      <label className="settings-row toggle-row">
        <span>显示用户名</span>
        <input
          checked={appearance.showUsername}
          onChange={(event) =>
            onUpdateAppearance({ showUsername: event.currentTarget.checked })
          }
          type="checkbox"
        />
      </label>
      <div className="settings-row control-row">
        <span>弹幕颜色</span>
        <span className="readonly-value">统一白色</span>
      </div>
      <fieldset className="settings-group">
        <legend>消息类型</legend>
        <label className="settings-row toggle-row">
          <span>普通弹幕</span>
          <input
            checked={messageDisplay.showDanmaku}
            onChange={(event) =>
              onUpdateMessageDisplay({ showDanmaku: event.currentTarget.checked })
            }
            type="checkbox"
          />
        </label>
        <label className="settings-row toggle-row">
          <span>礼物消息</span>
          <input
            checked={messageDisplay.showGift}
            onChange={(event) =>
              onUpdateMessageDisplay({ showGift: event.currentTarget.checked })
            }
            type="checkbox"
          />
        </label>
        <label className="settings-row toggle-row">
          <span>上舰消息</span>
          <input
            checked={messageDisplay.showGuard}
            onChange={(event) =>
              onUpdateMessageDisplay({ showGuard: event.currentTarget.checked })
            }
            type="checkbox"
          />
        </label>
        <label className="settings-row toggle-row">
          <span>醒目留言</span>
          <input
            checked={messageDisplay.showSuperChat}
            onChange={(event) =>
              onUpdateMessageDisplay({
                showSuperChat: event.currentTarget.checked,
              })
            }
            type="checkbox"
          />
        </label>
      </fieldset>
      <fieldset className="settings-group">
        <legend>弹幕窗口</legend>
        <div className="settings-actions">
          <button onClick={() => invoke("show_window", { label: "main" })} type="button">
            显示弹幕窗口
          </button>
          <button onClick={() => invoke("hide_window", { label: "main" })} type="button">
            隐藏弹幕窗口
          </button>
        </div>
      </fieldset>
      <div className="settings-actions single-action">
        <button onClick={onResetAppearance} type="button">
          恢复默认显示设置
        </button>
      </div>
    </div>
  );
}
