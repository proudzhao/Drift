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

type SettingsTab = "room" | "display" | "filter" | "control" | "diagnostics";

const DENSITY_LABELS: Record<AppearanceConfig["density"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "room", label: "直播间" },
  { id: "display", label: "显示" },
  { id: "filter", label: "过滤" },
  { id: "control", label: "控制" },
  { id: "diagnostics", label: "诊断" },
];

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
  const [draftBlockedWords, setDraftBlockedWords] = useState(
    config.filter.blockedWords.join("\n"),
  );
  const [shortcutError, setShortcutError] = useState("");
  const [apiTestSteps, setApiTestSteps] = useState<ApiTestStep[]>([]);
  const [apiTestError, setApiTestError] = useState("");
  const [isApiTesting, setIsApiTesting] = useState(false);
  const [expandedApiStepKey, setExpandedApiStepKey] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>("room");

  useEffect(() => {
    setDraftRoomId(config.roomId);
  }, [config.roomId]);

  useEffect(() => {
    setDraftShortcut(config.shortcuts.toggleEditMode);
  }, [config.shortcuts.toggleEditMode]);

  useEffect(() => {
    setDraftBlockedWords(config.filter.blockedWords.join("\n"));
  }, [config.filter.blockedWords]);

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

  async function saveBlockedWords() {
    await updateFilter({
      blockedWords: draftBlockedWords
        .split("\n")
        .map((word) => word.trim())
        .filter(Boolean),
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
    setExpandedApiStepKey(null);
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
        <strong>Drift 设置</strong>
        <button
          onClick={() => invoke("hide_window", { label: "control" })}
          type="button"
        >
          隐藏
        </button>
      </header>

      <nav className="settings-tabs" aria-label="设置分类">
        {SETTINGS_TABS.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="settings-panel">
        {activeTab === "room" ? (
          <div className="settings-page">
            <div className="settings-row room-form">
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
          </div>
        ) : null}

        {activeTab === "display" ? (
          <div className="settings-page">
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
            <div className="settings-row control-row">
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
            <label className="settings-row toggle-row">
              <span>显示用户名</span>
              <input
                checked={config.appearance.showUsername}
                onChange={(event) =>
                  updateAppearance({ showUsername: event.currentTarget.checked })
                }
                type="checkbox"
              />
            </label>
            <div className="settings-row control-row">
              <span>弹幕颜色</span>
              <span className="readonly-value">统一白色</span>
            </div>
          </div>
        ) : null}

        {activeTab === "filter" ? (
          <div className="settings-page">
            <label className="textarea-row">
              <span>屏蔽词</span>
              <textarea
                onBlur={saveBlockedWords}
                onChange={(event) => setDraftBlockedWords(event.currentTarget.value)}
                placeholder="每行一个词"
                rows={12}
                value={draftBlockedWords}
              />
            </label>
            <div className="settings-actions single-action">
              <button onClick={saveBlockedWords} type="button">
                保存屏蔽词
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "control" ? (
          <div className="settings-page">
            <div className="settings-row shortcut-form">
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
            <div className="settings-actions">
              <button onClick={resetShortcut} type="button">
                恢复快捷键
              </button>
              <button onClick={() => invoke("open_log_dir")} type="button">
                打开日志目录
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "diagnostics" ? (
          <div className="settings-page diagnostics-page">
            <div className="settings-actions">
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
                {apiTestSteps.map((step) => {
                  const isExpanded = expandedApiStepKey === step.key;

                  return (
                    <button
                      className="api-test-item"
                      data-expanded={isExpanded}
                      data-status={step.status}
                      key={step.key}
                      onClick={() =>
                        setExpandedApiStepKey(isExpanded ? null : step.key)
                      }
                      type="button"
                    >
                      <span className="api-test-mark">{apiTestMark(step.status)}</span>
                      <div>
                        <div className="api-test-title">
                          <strong>{step.label}</strong>
                          <span>{step.durationMs} ms</span>
                        </div>
                        <p>{step.message}</p>
                        <small>{step.detail}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
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
