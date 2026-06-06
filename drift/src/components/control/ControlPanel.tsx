import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuthPanel } from "../../hooks/control/useAuthPanel";
import { useControlConfig } from "../../hooks/control/useControlConfig";
import { useDiagnosticsPanel } from "../../hooks/control/useDiagnosticsPanel";
import { useSavedRooms } from "../../hooks/control/useSavedRooms";
import { useShortcutSettings } from "../../hooks/control/useShortcutSettings";
import { useUpdateNotice } from "../../hooks/control/useUpdateNotice";
import type { AppConfig } from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";
import { AccountSettings } from "./AccountSettings";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { AboutSettings } from "./AboutSettings";
import { DisplaySettings } from "./DisplaySettings";
import { FilterSettings } from "./FilterSettings";
import { RoomSettings } from "./RoomSettings";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { ShortcutSettings } from "./ShortcutSettings";

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
  const [activeTab, setActiveTab] = useState<SettingsTab>("room");

  const {
    resetAppearance,
    saveConfig,
    saveFilterRules,
    updateAppearance,
    updateMessageDisplay,
    updateUpdateConfig,
  } = useControlConfig({ config, onConfigChange });
  const {
    authError,
    authStatus,
    isAuthBusy,
    isQrPolling,
    logoutAuth,
    qrPollResult,
    qrSession,
    startQrLogin,
    validateAuthSession,
  } = useAuthPanel();
  const {
    cachedUpdate,
    setDismissedUpdateVersion,
    shouldShowUpdateNotice,
    updateNotice,
  } = useUpdateNotice();
  const {
    createSavedRoomGroup,
    deleteSavedRoom,
    deleteSavedRoomGroup,
    editingSavedRoom,
    filteredSavedRooms,
    renameSavedRoomGroup,
    savedRoomError,
    savedRoomSearchQuery,
    saveCurrentRoom,
    saveEditedRoom,
    selectSavedRoom,
    selectedSavedRoomGroupId,
    setEditingSavedRoom,
    setSavedRoomSearchQuery,
    setSelectedSavedRoomGroupId,
    startEditSavedRoom,
  } = useSavedRooms({
    config,
    draftRoomId,
    saveConfig,
    setDraftRoomId,
    status,
  });
  const {
    draftOverlayShortcut,
    draftSendShortcut,
    draftShortcut,
    resetOverlayShortcut,
    resetSendShortcut,
    resetShortcut,
    saveOverlayShortcut,
    saveSendShortcut,
    saveShortcut,
    setDraftOverlayShortcut,
    setDraftSendShortcut,
    setDraftShortcut,
    shortcutError,
  } = useShortcutSettings({ config, saveConfig });
  const {
    apiTestError,
    apiTestSteps,
    expandedApiStepKey,
    isApiTesting,
    setExpandedApiStepKey,
    testApi,
  } = useDiagnosticsPanel(draftRoomId);

  useEffect(() => {
    setDraftRoomId(config.roomId);
  }, [config.roomId]);


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

  return (
    <main className="control-window">
      <header className="control-header">
        <strong>Drift 设置</strong>
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
            filteredSavedRooms={filteredSavedRooms}
            draftRoomId={draftRoomId}
            editingSavedRoom={editingSavedRoom}
            isConnected={isConnected}
            onCreateGroup={createSavedRoomGroup}
            onConnect={() => connectRoom(draftRoomId)}
            onDeleteRoom={deleteSavedRoom}
            onDeleteGroup={deleteSavedRoomGroup}
            onDisconnect={disconnectRoom}
            onEditRoomChange={setEditingSavedRoom}
            onGroupChange={setSelectedSavedRoomGroupId}
            onRenameGroup={renameSavedRoomGroup}
            onRoomIdChange={setDraftRoomId}
            onSaveCurrentRoom={saveCurrentRoom}
            onSaveEditedRoom={saveEditedRoom}
            onSearchQueryChange={setSavedRoomSearchQuery}
            onSelectRoom={selectSavedRoom}
            onStartEditRoom={startEditSavedRoom}
            onStopEditRoom={() => setEditingSavedRoom(null)}
            savedRoomError={savedRoomError}
            savedRoomSearchQuery={savedRoomSearchQuery}
            selectedGroupId={selectedSavedRoomGroupId}
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
            draftSendShortcut={draftSendShortcut}
            onOverlayShortcutChange={setDraftOverlayShortcut}
            onResetShortcut={resetShortcut}
            onResetOverlayShortcut={resetOverlayShortcut}
            onResetSendShortcut={resetSendShortcut}
            onSaveShortcut={saveShortcut}
            onSaveOverlayShortcut={saveOverlayShortcut}
            onSaveSendShortcut={saveSendShortcut}
            onSendShortcutChange={setDraftSendShortcut}
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
          {config.shortcuts.toggleOverlayWindow} 显示/隐藏弹幕窗口 ·{" "}
          {config.shortcuts.openSendDanmaku} 发送弹幕
        </span>
      </footer>
    </main>
  );
}
