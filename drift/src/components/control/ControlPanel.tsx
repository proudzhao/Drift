import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuthPanel } from "../../hooks/control/useAuthPanel";
import { useControlConfig } from "../../hooks/control/useControlConfig";
import { useDiagnosticsPanel } from "../../hooks/control/useDiagnosticsPanel";
import { useSavedRooms } from "../../hooks/control/useSavedRooms";
import { useShortcutSettings } from "../../hooks/control/useShortcutSettings";
import { useAppUpdate } from "../../hooks/control/useAppUpdate";
import type { AppConfig } from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";
import { AccountSettings } from "./AccountSettings";
import { AboutSettings } from "./AboutSettings";
import { ControlShell } from "./ControlShell";
import { ControlUpdateNotice } from "./ControlUpdateNotice";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { DisplaySettings } from "./DisplaySettings";
import { FilterSettings } from "./FilterSettings";
import { RoomSettings } from "./RoomSettings";
import type { SettingsTab } from "./settingsNavigation";
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<
    string | null
  >(null);

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
    checkForUpdate,
    installUpdate,
    loadCurrentVersion,
    restartApp,
    state: updateState,
  } = useAppUpdate({ checkOnStartup: config.update.checkOnStartup });
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

  const updateProgressPercent =
    updateState.totalBytes && updateState.totalBytes > 0
      ? Math.min(
          100,
          Math.round((updateState.downloadedBytes / updateState.totalBytes) * 100),
        )
      : null;
  const shouldShowUpdateNotice =
    (updateState.status === "available" &&
      updateState.latestVersion !== dismissedUpdateVersion) ||
    updateState.status === "downloading" ||
    updateState.status === "installing" ||
    updateState.status === "installed";

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
    <ControlShell
      activeTab={activeTab}
      collapsed={isSidebarCollapsed}
      footer={
        <span>
          {config.shortcuts.toggleEditMode} 切换编辑模式 ·{" "}
          {config.shortcuts.toggleOverlayWindow} 显示/隐藏弹幕窗口 ·{" "}
          {config.shortcuts.openSendDanmaku} 发送弹幕
        </span>
      }
      onCollapsedChange={setIsSidebarCollapsed}
      onTabChange={setActiveTab}
      status={<span>{status.message}</span>}
      updateNotice={
        shouldShowUpdateNotice ? (
          <ControlUpdateNotice
            onDismiss={() =>
              setDismissedUpdateVersion(updateState.latestVersion)
            }
            onInstall={installUpdate}
            onOpenRelease={() => openUrl(updateState.releaseUrl)}
            onRestart={restartApp}
            onShowDetails={() => setActiveTab("about")}
            progressPercent={updateProgressPercent}
            updateState={updateState}
          />
        ) : undefined
      }
    >
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
            onCheckUpdate={checkForUpdate}
            onInstallUpdate={installUpdate}
            onLoadCurrentVersion={loadCurrentVersion}
            onRestartApp={restartApp}
            onUpdateConfigChange={updateUpdateConfig}
            updateState={updateState}
            updateConfig={config.update}
          />
        ) : null}
    </ControlShell>
  );
}
