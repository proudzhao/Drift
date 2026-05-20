import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  defaultShortcutLabel,
  type AppConfig,
  type AppearanceConfig,
  type FilterConfig,
} from "../types/config";
import type { DanmakuStatus } from "../types/danmaku";

type ControlPanelProps = {
  config: AppConfig;
  isConnected: boolean;
  onConfigChange: (config: AppConfig) => void;
  onStatusChange: (status: DanmakuStatus) => void;
  status: DanmakuStatus;
};

type ApiTestStep = {
  key: string;
  label: string;
  status: "success" | "warning" | "failed";
  durationMs: number;
  message: string;
  detail: string;
};

const DENSITY_LABELS: Record<AppearanceConfig["density"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function ControlPanel({
  config,
  isConnected,
  onConfigChange,
  onStatusChange,
  status,
}: ControlPanelProps) {
  const [draftRoomId, setDraftRoomId] = useState(config.roomId);
  const [draftShortcut, setDraftShortcut] = useState(
    config.shortcuts.toggleEditMode,
  );
  const [shortcutError, setShortcutError] = useState("");
  const [apiTestSteps, setApiTestSteps] = useState<ApiTestStep[]>([]);
  const [apiTestError, setApiTestError] = useState("");
  const [isApiTesting, setIsApiTesting] = useState(false);

  useEffect(() => {
    setDraftRoomId(config.roomId);
  }, [config.roomId]);

  useEffect(() => {
    setDraftShortcut(config.shortcuts.toggleEditMode);
  }, [config.shortcuts.toggleEditMode]);

  async function saveConfig(nextConfig: AppConfig) {
    const savedConfig = await invoke<AppConfig>("save_app_config", {
      config: nextConfig,
    });
    onConfigChange(savedConfig);
  }

  async function updateAppearance(nextAppearance: Partial<AppearanceConfig>) {
    await saveConfig({
      ...config,
      appearance: {
        ...config.appearance,
        ...nextAppearance,
      },
    });
  }

  async function updateFilter(nextFilter: Partial<FilterConfig>) {
    await saveConfig({
      ...config,
      filter: {
        ...config.filter,
        ...nextFilter,
      },
    });
  }

  async function connectRoom(roomId: string) {
    const numericRoomId = Number(roomId.trim());
    if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
      onStatusChange({ status: "idle", message: "请输入有效的直播间房间号" });
      return;
    }

    onStatusChange({
      status: "connecting",
      message: `正在连接直播间 ${roomId.trim()}`,
    });

    try {
      await saveConfig({ ...config, roomId: roomId.trim() });
      await invoke("start_bilibili_danmaku", { roomId: numericRoomId });
    } catch (error) {
      onStatusChange({ status: "disconnected", message: String(error) });
    }
  }

  async function disconnectRoom() {
    await invoke("stop_bilibili_danmaku");
    onStatusChange({ status: "disconnected", message: "已手动断开" });
  }

  async function handleConnect() {
    await connectRoom(draftRoomId);
  }

  async function testApi() {
    const numericRoomId = Number(draftRoomId.trim());
    if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
      setApiTestError("请输入有效的直播间房间号");
      setApiTestSteps([]);
      return;
    }

    setApiTestError("");
    setApiTestSteps([]);
    setIsApiTesting(true);
    try {
      const steps = await invoke<ApiTestStep[]>("test_bilibili_api", {
        roomId: numericRoomId,
      });
      setApiTestSteps(steps);
    } catch (error) {
      setApiTestError(String(error));
    } finally {
      setIsApiTesting(false);
    }
  }

  async function resetAppearance() {
    await updateAppearance({
      fontSize: 20,
      opacity: 0.94,
      scrollDuration: 12,
      density: "medium",
      showUsername: false,
      color: "white",
    });
  }

  async function saveShortcut() {
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>("set_edit_mode_shortcut", {
        shortcut: draftShortcut,
      });
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleEditMode: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  async function resetShortcut() {
    setDraftShortcut(defaultShortcutLabel());
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>("set_edit_mode_shortcut", {
        shortcut: defaultShortcutLabel(),
      });
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleEditMode: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  const roomStatusLabel = roomStatusText(status);
  const anchorName = status.anchorName || "未知";

  return (
    <main className="control-window">
      <header className="control-header">
        <div>
          <strong>Drift</strong>
          <span>弹幕悬浮设置</span>
        </div>
        <button
          onClick={() => invoke("hide_window", { label: "control" })}
          type="button"
        >
          隐藏
        </button>
      </header>

      <section className="control-section">
        <h2>直播间</h2>
        <div className="room-form">
          <label htmlFor="control-room-id">房间号</label>
          <input
            disabled={isConnected}
            id="control-room-id"
            inputMode="numeric"
            onChange={(event) => setDraftRoomId(event.currentTarget.value)}
            placeholder="输入房间号"
            value={draftRoomId}
          />
          {isConnected ? (
            <button onClick={disconnectRoom} type="button">
              断开
            </button>
          ) : (
            <button disabled={!draftRoomId.trim()} onClick={handleConnect} type="button">
              连接
            </button>
          )}
        </div>
        <div className="room-meta">
          <span className="status-dot" data-status={status.status} />
          <span data-status={status.status}>状态：{roomStatusLabel}</span>
          <span>主播：{anchorName}</span>
        </div>
        <p className="control-status">{status.message}</p>
      </section>

      <section className="control-section">
        <h2>API 测试</h2>
        <div className="control-actions">
          <button
            disabled={isApiTesting || !draftRoomId.trim()}
            onClick={testApi}
            type="button"
          >
            {isApiTesting ? "测试中" : "测试 API"}
          </button>
          <button onClick={() => invoke("open_log_dir")} type="button">
            打开日志目录
          </button>
        </div>
        {apiTestError ? <p className="control-error">{apiTestError}</p> : null}
        {apiTestSteps.length > 0 ? (
          <div className="api-test-list">
            {apiTestSteps.map((step) => (
              <div className="api-test-item" data-status={step.status} key={step.key}>
                <span className="api-test-mark">{apiTestMark(step.status)}</span>
                <div>
                  <div className="api-test-title">
                    <strong>{step.label}</strong>
                    <span>{step.durationMs} ms</span>
                  </div>
                  <p>{step.message}</p>
                  <small>{step.detail}</small>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="control-section">
        <h2>弹幕显示</h2>
        <ControlSlider
          label="字号"
          max={32}
          min={14}
          onChange={(value) => updateAppearance({ fontSize: value })}
          suffix="px"
          value={config.appearance.fontSize}
        />
        <ControlSlider
          label="透明度"
          max={100}
          min={30}
          onChange={(value) => updateAppearance({ opacity: value / 100 })}
          suffix="%"
          value={Math.round(config.appearance.opacity * 100)}
        />
        <ControlSlider
          label="滚动速度"
          max={24}
          min={6}
          onChange={(value) => updateAppearance({ scrollDuration: value })}
          suffix="秒"
          value={config.appearance.scrollDuration}
        />
        <div className="control-row">
          <span>显示密度</span>
          <div className="segmented-control">
            {(["low", "medium", "high"] as const).map((density) => (
              <button
                className={
                  config.appearance.density === density ? "is-active" : ""
                }
                key={density}
                onClick={() => updateAppearance({ density })}
                type="button"
              >
                {DENSITY_LABELS[density]}
              </button>
            ))}
          </div>
        </div>
        <label className="toggle-row">
          <span>显示用户名</span>
          <input
            checked={config.appearance.showUsername}
            onChange={(event) =>
              updateAppearance({ showUsername: event.currentTarget.checked })
            }
            type="checkbox"
          />
        </label>
        <div className="control-row">
          <span>弹幕颜色</span>
          <span className="readonly-value">统一白色</span>
        </div>
      </section>

      <section className="control-section">
        <h2>过滤</h2>
        <label className="textarea-row">
          <span>屏蔽词</span>
          <textarea
            onChange={(event) =>
              updateFilter({
                blockedWords: event.currentTarget.value
                  .split("\n")
                  .map((word) => word.trim())
                  .filter(Boolean),
              })
            }
            placeholder="每行一个词"
            rows={4}
            value={config.filter.blockedWords.join("\n")}
          />
        </label>
        <label className="textarea-row">
          <span>屏蔽用户</span>
          <textarea
            onChange={(event) =>
              updateFilter({
                blockedUsers: event.currentTarget.value
                  .split("\n")
                  .map((user) => user.trim())
                  .filter(Boolean),
              })
            }
            placeholder="每行一个用户名"
            rows={3}
            value={config.filter.blockedUsers.join("\n")}
          />
        </label>
      </section>

      <section className="control-section">
        <h2>窗口</h2>
        <div className="control-actions">
          <button onClick={() => invoke("show_window", { label: "main" })} type="button">
            显示弹幕
          </button>
          <button onClick={() => invoke("hide_window", { label: "main" })} type="button">
            隐藏弹幕
          </button>
        </div>
      </section>

      <section className="control-section">
        <h2>快捷键与日志</h2>
        <div className="shortcut-form">
          <label htmlFor="shortcut-input">编辑模式</label>
          <input
            id="shortcut-input"
            onChange={(event) => setDraftShortcut(event.currentTarget.value)}
            placeholder={defaultShortcutLabel()}
            value={draftShortcut}
          />
          <button onClick={saveShortcut} type="button">
            保存
          </button>
        </div>
        {shortcutError ? <p className="control-error">{shortcutError}</p> : null}
        <div className="control-actions">
          <button onClick={resetShortcut} type="button">
            恢复快捷键
          </button>
          <button onClick={() => invoke("open_log_dir")} type="button">
            打开日志目录
          </button>
        </div>
      </section>

      <footer className="control-footer">
        <span>{config.shortcuts.toggleEditMode} 切换编辑模式</span>
        <button onClick={resetAppearance} type="button">
          恢复默认
        </button>
      </footer>
    </main>
  );
}

function apiTestMark(status: ApiTestStep["status"]) {
  switch (status) {
    case "success":
      return "OK";
    case "warning":
      return "!";
    case "failed":
    default:
      return "X";
  }
}

function roomStatusText(status: DanmakuStatus) {
  switch (status.status) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中";
    case "reconnecting":
      return "重连中";
    case "not_live":
      return "未开播";
    case "invalid_room":
      return "房间号不存在";
    case "disconnected":
      return "未连接";
    case "idle":
    default:
      return "未连接";
  }
}

type ControlSliderProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
};

function ControlSlider({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: ControlSliderProps) {
  return (
    <label className="control-slider">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        type="range"
        value={value}
      />
      <strong>
        {value}
        {suffix}
      </strong>
    </label>
  );
}
