import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  defaultOverlayShortcutLabel,
  defaultShortcutLabel,
  type AppConfig,
  type AppearanceConfig,
  type FilterConfig,
  type MessageDisplayConfig,
  type SavedRoom,
} from "../../types/config";
import type {
  AuthStatus,
  QrLoginPollResult,
  QrLoginSession,
} from "../../types/auth";
import type { DanmakuStatus } from "../../types/danmaku";
import { AccountSettings } from "./AccountSettings";
import { DiagnosticsSettings, type ApiTestStep } from "./DiagnosticsSettings";
import {
  AboutSettings,
  type CachedUpdateResult,
  type CheckUpdateResult,
} from "./AboutSettings";
import { DisplaySettings } from "./DisplaySettings";
import { FilterSettings } from "./FilterSettings";
import { RoomSettings } from "./RoomSettings";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { ShortcutSettings } from "./ShortcutSettings";
import type { EditingSavedRoom } from "./SavedRoomList";

type ControlPanelProps = {
  config: AppConfig;
  isConnected: boolean;
  onConfigChange: (config: AppConfig) => void;
  onStatusChange: (status: DanmakuStatus) => void;
  status: DanmakuStatus;
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
  const [draftOverlayShortcut, setDraftOverlayShortcut] = useState(
    config.shortcuts.toggleOverlayWindow,
  );
  const [shortcutError, setShortcutError] = useState("");
  const [apiTestSteps, setApiTestSteps] = useState<ApiTestStep[]>([]);
  const [apiTestError, setApiTestError] = useState("");
  const [isApiTesting, setIsApiTesting] = useState(false);
  const [expandedApiStepKey, setExpandedApiStepKey] = useState<string | null>(
    null,
  );
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authError, setAuthError] = useState("");
  const [qrSession, setQrSession] = useState<QrLoginSession | null>(null);
  const [qrPollResult, setQrPollResult] = useState<QrLoginPollResult | null>(
    null,
  );
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isQrPolling, setIsQrPolling] = useState(false);
  const [editingSavedRoom, setEditingSavedRoom] =
    useState<EditingSavedRoom | null>(null);
  const [savedRoomError, setSavedRoomError] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("room");
  const [cachedUpdate, setCachedUpdate] =
    useState<CachedUpdateResult | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<
    string | null
  >(null);
  const updateNotice = cachedUpdate?.result?.hasUpdate
    ? cachedUpdate.result
    : null;
  const shouldShowUpdateNotice =
    updateNotice !== null &&
    updateNotice.latestVersion !== dismissedUpdateVersion;

  useEffect(() => {
    setDraftRoomId(config.roomId);
  }, [config.roomId]);

  useEffect(() => {
    setDraftShortcut(config.shortcuts.toggleEditMode);
  }, [config.shortcuts.toggleEditMode]);

  useEffect(() => {
    setDraftOverlayShortcut(config.shortcuts.toggleOverlayWindow);
  }, [config.shortcuts.toggleOverlayWindow]);

  useEffect(() => {
    void refreshAuthStatus();
  }, []);

  useEffect(() => {
    invoke<CachedUpdateResult>("get_cached_update_result")
      .then(setCachedUpdate)
      .catch(() => setCachedUpdate(null));

    const unlistenUpdate = listen<CheckUpdateResult>(
      "update-available",
      (event) => {
        setCachedUpdate({
          result: event.payload,
          checkedAt: Math.floor(Date.now() / 1000),
          isChecking: false,
        });
      },
    );

    return () => {
      void unlistenUpdate.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!qrSession || authStatus?.isLoggedIn) {
      return;
    }

    let cancelled = false;
    let interval: number | undefined;
    const stopPolling = () => {
      setIsQrPolling(false);
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
    const poll = async () => {
      setIsQrPolling(true);
      try {
        const result = await invoke<QrLoginPollResult>("auth_poll_qr_login", {
          qrcodeKey: qrSession.qrcodeKey,
        });
        if (cancelled) return;
        setQrPollResult(result);
        if (result.authStatus) {
          setAuthStatus(result.authStatus);
          setQrSession(null);
          stopPolling();
        }
        if (result.status === "expired" || result.status === "error") {
          stopPolling();
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(String(error));
          stopPolling();
        }
      }
    };

    void poll();
    interval = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [authStatus?.isLoggedIn, qrSession]);

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

  async function updateMessageDisplay(
    nextMessageDisplay: Partial<MessageDisplayConfig>,
  ) {
    await saveConfig({
      ...config,
      messageDisplay: {
        ...config.messageDisplay,
        ...nextMessageDisplay,
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

  async function updateUpdateConfig(nextUpdate: Partial<AppConfig["update"]>) {
    await saveConfig({
      ...config,
      update: {
        ...config.update,
        ...nextUpdate,
      },
    });
  }

  async function saveFilterRules(rules: FilterConfig["rules"]) {
    await updateFilter({ rules });
  }

  async function saveRooms(savedRooms: SavedRoom[]) {
    await saveConfig({
      ...config,
      savedRooms,
    });
  }

  async function saveCurrentRoom() {
    const roomId = draftRoomId.trim();
    if (!isValidRoomId(roomId)) {
      setSavedRoomError("请输入有效的直播间房间号");
      return;
    }

    setSavedRoomError("");
    const now = new Date().toISOString();
    const roomName = status.anchorName?.trim();
    const displayName =
      roomName && roomName !== "未知" ? roomName : `房间 ${roomId}`;
    const existingRoom = config.savedRooms.find((room) => room.roomId === roomId);
    const savedRooms = existingRoom
      ? config.savedRooms.map((room) =>
          room.id === existingRoom.id
            ? {
                ...room,
                anchorName: roomName || room.anchorName,
                displayName: room.displayName || displayName,
                updatedAt: now,
              }
            : room,
        )
      : [
          {
            id: createSavedRoomId(),
            roomId,
            displayName,
            anchorName: roomName,
            updatedAt: now,
          },
          ...config.savedRooms,
        ];

    await saveRooms(savedRooms);
  }

  function selectSavedRoom(room: SavedRoom) {
    setDraftRoomId(room.roomId);
    setSavedRoomError("");
  }

  async function deleteSavedRoom(savedRoomId: string) {
    if (editingSavedRoom?.id === savedRoomId) {
      setEditingSavedRoom(null);
    }
    setSavedRoomError("");
    await saveRooms(config.savedRooms.filter((room) => room.id !== savedRoomId));
  }

  function startEditSavedRoom(room: SavedRoom) {
    setSavedRoomError("");
    setEditingSavedRoom({
      id: room.id,
      roomId: room.roomId,
      displayName: room.displayName,
    });
  }

  async function saveEditedRoom() {
    if (!editingSavedRoom) {
      return;
    }

    const roomId = editingSavedRoom.roomId.trim();
    const displayName = editingSavedRoom.displayName.trim();
    if (!displayName) {
      setSavedRoomError("名称不能为空");
      return;
    }
    if (!isValidRoomId(roomId)) {
      setSavedRoomError("请输入有效的直播间房间号");
      return;
    }
    if (
      config.savedRooms.some(
        (room) => room.id !== editingSavedRoom.id && room.roomId === roomId,
      )
    ) {
      setSavedRoomError("该房间号已在常用直播间中");
      return;
    }

    setSavedRoomError("");
    await saveRooms(
      config.savedRooms.map((room) =>
        room.id === editingSavedRoom.id
          ? {
              ...room,
              roomId,
              displayName,
              updatedAt: new Date().toISOString(),
            }
          : room,
      ),
    );
    setEditingSavedRoom(null);
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

  async function refreshAuthStatus() {
    setAuthError("");
    try {
      const status = await invoke<AuthStatus>("auth_get_status");
      setAuthStatus(status);
    } catch (error) {
      setAuthError(String(error));
    }
  }

  async function startQrLogin() {
    setAuthError("");
    setQrPollResult(null);
    setIsAuthBusy(true);
    try {
      const session = await invoke<QrLoginSession>("auth_start_qr_login");
      setQrSession(session);
      setAuthStatus((current) =>
        current?.isLoggedIn ? { ...current, isLoggedIn: false } : current,
      );
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function validateAuthSession() {
    setAuthError("");
    setIsAuthBusy(true);
    try {
      const status = await invoke<AuthStatus>("auth_validate_session");
      setAuthStatus(status);
      if (status.isLoggedIn) {
        setQrSession(null);
        setQrPollResult(null);
      }
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function logoutAuth() {
    setAuthError("");
    setIsAuthBusy(true);
    try {
      const status = await invoke<AuthStatus>("auth_logout");
      setAuthStatus(status);
      setQrSession(null);
      setQrPollResult(null);
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setIsAuthBusy(false);
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

  async function saveOverlayShortcut() {
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>(
        "set_overlay_window_shortcut",
        {
          shortcut: draftOverlayShortcut,
        },
      );
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleOverlayWindow: result.shortcut,
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

  async function resetOverlayShortcut() {
    setDraftOverlayShortcut(defaultOverlayShortcutLabel());
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>(
        "set_overlay_window_shortcut",
        {
          shortcut: defaultOverlayShortcutLabel(),
        },
      );
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleOverlayWindow: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

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

      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <section
        className={
          shouldShowUpdateNotice
            ? "settings-panel has-update-notice"
            : "settings-panel"
        }
      >
        {shouldShowUpdateNotice && updateNotice ? (
          <div className="update-notice" role="status">
            <div>
              <strong>发现新版本 {updateNotice.latestVersion}</strong>
              <span>
                当前版本 {updateNotice.currentVersion}，可前往 GitHub Releases
                下载。
              </span>
            </div>
            <div className="update-notice-actions">
              <button
                onClick={() => openUrl(updateNotice.releaseUrl)}
                type="button"
              >
                前往下载
              </button>
              <button
                onClick={() => {
                  setActiveTab("about");
                  setDismissedUpdateVersion(updateNotice.latestVersion);
                }}
                type="button"
              >
                查看详情
              </button>
              <button
                aria-label="稍后提醒"
                onClick={() =>
                  setDismissedUpdateVersion(updateNotice.latestVersion)
                }
                type="button"
              >
                稍后
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "room" ? (
          <RoomSettings
            config={config}
            draftRoomId={draftRoomId}
            editingSavedRoom={editingSavedRoom}
            isConnected={isConnected}
            onConnect={() => connectRoom(draftRoomId)}
            onDeleteRoom={deleteSavedRoom}
            onDisconnect={disconnectRoom}
            onEditRoomChange={setEditingSavedRoom}
            onRoomIdChange={setDraftRoomId}
            onSaveCurrentRoom={saveCurrentRoom}
            onSaveEditedRoom={saveEditedRoom}
            onSelectRoom={selectSavedRoom}
            onStartEditRoom={startEditSavedRoom}
            onStopEditRoom={() => setEditingSavedRoom(null)}
            savedRoomError={savedRoomError}
            status={status}
          />
        ) : null}

        {activeTab === "display" ? (
          <DisplaySettings
            appearance={config.appearance}
            messageDisplay={config.messageDisplay}
            onResetAppearance={resetAppearance}
            onUpdateAppearance={updateAppearance}
            onUpdateMessageDisplay={updateMessageDisplay}
          />
        ) : null}

        {activeTab === "account" ? (
          <AccountSettings
            authError={authError}
            authStatus={authStatus}
            isAuthBusy={isAuthBusy}
            isPolling={isQrPolling}
            onLogout={logoutAuth}
            onStartLogin={startQrLogin}
            onValidateSession={validateAuthSession}
            pollResult={qrPollResult}
            qrSession={qrSession}
          />
        ) : null}

        {activeTab === "filter" ? (
          <FilterSettings
            onRulesChange={saveFilterRules}
            rules={config.filter.rules}
          />
        ) : null}

        {activeTab === "shortcuts" ? (
          <ShortcutSettings
            draftShortcut={draftShortcut}
            draftOverlayShortcut={draftOverlayShortcut}
            onOverlayShortcutChange={setDraftOverlayShortcut}
            onResetShortcut={resetShortcut}
            onResetOverlayShortcut={resetOverlayShortcut}
            onSaveShortcut={saveShortcut}
            onSaveOverlayShortcut={saveOverlayShortcut}
            onShortcutChange={setDraftShortcut}
            shortcutError={shortcutError}
          />
        ) : null}

        {activeTab === "diagnostics" ? (
          <DiagnosticsSettings
            apiTestError={apiTestError}
            apiTestSteps={apiTestSteps}
            draftRoomId={draftRoomId}
            expandedApiStepKey={expandedApiStepKey}
            isApiTesting={isApiTesting}
            mockPanelEnabled={config.mockPanelEnabled}
            onExpandedApiStepChange={setExpandedApiStepKey}
            onMockPanelToggle={(enabled) =>
              saveConfig({ ...config, mockPanelEnabled: enabled })
            }
            onTestApi={testApi}
          />
        ) : null}

        {activeTab === "about" ? (
          <AboutSettings
            cachedUpdate={cachedUpdate}
            onUpdateConfigChange={updateUpdateConfig}
            updateConfig={config.update}
          />
        ) : null}
      </section>

      <footer className="control-footer">
        <span>
          {config.shortcuts.toggleEditMode} 切换编辑模式 ·{" "}
          {config.shortcuts.toggleOverlayWindow} 显示/隐藏弹幕窗口
        </span>
      </footer>
    </main>
  );
}

function createSavedRoomId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidRoomId(roomId: string) {
  const numericRoomId = Number(roomId.trim());
  return Number.isSafeInteger(numericRoomId) && numericRoomId > 0;
}
