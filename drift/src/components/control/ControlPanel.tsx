import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuthPanel } from "../../hooks/control/useAuthPanel";
import { useControlConfig } from "../../hooks/control/useControlConfig";
import { useDiagnosticsPanel } from "../../hooks/control/useDiagnosticsPanel";
import { useDanmakuRecordingStatus } from "../../hooks/control/useDanmakuRecordingStatus";
import { useFilterRuntimeStatus } from "../../hooks/control/useFilterRuntimeStatus";
import { useSavedRooms } from "../../hooks/control/useSavedRooms";
import { useRoomConnections } from "../../hooks/control/useRoomConnections";
import { useShortcutSettings } from "../../hooks/control/useShortcutSettings";
import { useThemePreference } from "../../hooks/control/useThemePreference";
import { useVerticalFlowStatus } from "../../hooks/control/useVerticalFlowStatus";
import { useAppUpdate } from "../../hooks/control/useAppUpdate";
import { useRoomSessions } from "../../hooks/useRoomSessions";
import type { AppConfig } from "../../types/config";
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
  onConfigChange: (config: AppConfig) => void;
};

export function ControlPanel({
  config,
  onConfigChange,
}: ControlPanelProps) {
  const [draftRoomId, setDraftRoomId] = useState(config.roomId);
  const [activeTab, setActiveTab] = useState<SettingsTab>("room");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<
    string | null
  >(null);
  const [displayConfigError, setDisplayConfigError] = useState<string | null>(
    null,
  );
  const filterRuntimeStatus = useFilterRuntimeStatus();
  const danmakuRecording = useDanmakuRecordingStatus();
  const verticalFlowStatus = useVerticalFlowStatus();
  const { sessions, snapshotError } = useRoomSessions({ enabled: true });

  const {
    resetAppearance,
    saveConfig,
    saveFilterRules,
    updateAppearance,
    updateMessageDisplay,
    updateUpdateConfig,
  } = useControlConfig({ config, onConfigChange });
  const themePreference = useThemePreference({
    theme: config.appearance.theme,
    saveTheme: (theme) => updateAppearance({ theme }),
  });
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
    saveRoom,
    saveEditedRoom,
    selectedSavedRoomGroupId,
    setEditingSavedRoom,
    setSavedRoomSearchQuery,
    setSelectedSavedRoomGroupId,
    startEditSavedRoom,
  } = useSavedRooms({
    config,
    draftRoomId,
    saveConfig,
  });
  const roomConnections = useRoomConnections({ config, saveConfig, sessions });
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

  async function persistDisplayConfig(save: () => Promise<void>) {
    try {
      await save();
      setDisplayConfigError(null);
    } catch {
      setDisplayConfigError("显示设置保存失败，已保留原设置");
    }
  }

  async function updateDisplayAppearance(
    appearance: Parameters<typeof updateAppearance>[0],
  ) {
    await persistDisplayConfig(() => updateAppearance(appearance));
  }

  async function updateDisplayMessageConfig(
    messageDisplay: Parameters<typeof updateMessageDisplay>[0],
  ) {
    await persistDisplayConfig(() => updateMessageDisplay(messageDisplay));
  }

  async function resetDisplayAppearance() {
    await persistDisplayConfig(resetAppearance);
  }

  const roomLabels = new Map<number, string>();
  for (const session of sessions) {
    const roomId = session.roomId ?? session.requestedRoomId;
    const anchorName = session.anchorName?.trim();
    roomLabels.set(
      roomId,
      anchorName && anchorName !== "未知"
        ? `${anchorName} · ${roomId}`
        : `房间 ${roomId}`,
    );
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
      isThemeSaving={themePreference.isThemeSaving}
      onCollapsedChange={setIsSidebarCollapsed}
      onTabChange={setActiveTab}
      onThemeToggle={themePreference.toggleTheme}
      status={
        <span>
          {sessions.length === 0
            ? "尚未连接直播间"
            : `房间会话 ${sessions.length}`}
        </span>
      }
      theme={themePreference.theme}
      themeError={themePreference.themeError}
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
            commandErrors={roomConnections.commandErrors}
            onCreateGroup={createSavedRoomGroup}
            onConnectDraftRoom={() =>
              roomConnections.connectDraftRoom(draftRoomId)
            }
            onConnectSavedRoom={roomConnections.connectSavedRoom}
            onConnectSelectedRooms={roomConnections.connectSelectedRooms}
            onDeleteRoom={deleteSavedRoom}
            onDeleteGroup={deleteSavedRoomGroup}
            onDisconnectAllRooms={roomConnections.disconnectAllRooms}
            onDisconnectSession={roomConnections.disconnectSession}
            onEditRoomChange={setEditingSavedRoom}
            onGroupChange={setSelectedSavedRoomGroupId}
            onOpenRecordingDir={danmakuRecording.openDirectory}
            onRecordingEnabledChange={danmakuRecording.setEnabled}
            onRenameGroup={renameSavedRoomGroup}
            onRetryRecording={danmakuRecording.retry}
            onRetrySession={roomConnections.retrySession}
            onRoomIdChange={setDraftRoomId}
            onRoomSelected={roomConnections.setRoomSelected}
            onSaveCurrentRoom={saveCurrentRoom}
            onSaveEditedRoom={saveEditedRoom}
            onSaveTemporaryRoom={(session) =>
              saveRoom(String(session.requestedRoomId), session.anchorName)
            }
            onSearchQueryChange={setSavedRoomSearchQuery}
            onStartEditRoom={startEditSavedRoom}
            onStopEditRoom={() => setEditingSavedRoom(null)}
            savedRoomError={savedRoomError}
            savedRoomSearchQuery={savedRoomSearchQuery}
            selectedGroupId={selectedSavedRoomGroupId}
            selectedSavedRoomIds={roomConnections.selectedSavedRoomIds}
            selectionError={roomConnections.selectionError}
            recordingCommandError={danmakuRecording.commandError}
            recordingStatus={danmakuRecording.status}
            sessions={sessions}
            snapshotError={snapshotError}
            temporarySessions={roomConnections.temporarySessions}
          />
        ) : null}

        {activeTab === "display" ? (
          <DisplaySettings
            appearance={config.appearance}
            displayConfigError={displayConfigError}
            messageDisplay={config.messageDisplay}
            onResetAppearance={resetDisplayAppearance}
            onUpdateAppearance={updateDisplayAppearance}
            onUpdateMessageDisplay={updateDisplayMessageConfig}
            verticalFlowStatus={verticalFlowStatus}
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
            roomLabels={roomLabels}
            rules={config.filter.rules}
            runtimeStatus={filterRuntimeStatus}
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
              saveConfig((current) => ({
                ...current,
                mockPanelEnabled: enabled,
              }))
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
