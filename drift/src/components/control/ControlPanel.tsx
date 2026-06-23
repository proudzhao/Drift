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
import { classNames } from "../../utils/classNames";
import { AccountSettings } from "./AccountSettings";
import { AboutSettings } from "./AboutSettings";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { DisplaySettings } from "./DisplaySettings";
import { FilterSettings } from "./FilterSettings";
import { RoomSettings } from "./RoomSettings";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { ShortcutSettings } from "./ShortcutSettings";
import { Button } from "../ui";

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
  const updateNoticeText = getUpdateNoticeText(
    updateState,
    updateProgressPercent,
  );

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

  const settingsPanelClassName = classNames(
    "relative grid min-h-0 gap-3 overflow-hidden border border-[#d6d6d6] bg-[#e4e4e4] px-10 py-5",
    shouldShowUpdateNotice
      ? "grid-rows-[auto_minmax(0,1fr)]"
      : "grid-rows-[minmax(0,1fr)]",
  );

  return (
    <main className="box-border grid h-screen min-h-screen grid-rows-[auto_auto_minmax(0,1fr)_auto] content-start gap-3 overflow-hidden bg-[#ececec] px-6 pb-4 pt-2.5 text-[#202124]">
      <header className="grid grid-cols-[minmax(0,1fr)] items-center">
        <strong className="text-center text-[13px] font-bold leading-tight text-[#4b4b4b]">
          Drift 设置
        </strong>
      </header>

      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <section className={settingsPanelClassName}>
        {shouldShowUpdateNotice ? (
          <div
            className="grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-3.5 rounded-[7px] border border-blue-300/70 bg-[#eef6ff] px-3 py-2.5 shadow-drift-control"
            role="status"
          >
            <div className="grid min-w-0 gap-1">
              <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold text-[#145da0]">
                {updateNoticeText.title}
              </strong>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#4f657a]">
                {updateNoticeText.description}
              </span>
              {updateState.status === "downloading" ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-drift-primary transition-[width]"
                    style={{
                      width:
                        updateProgressPercent === null
                          ? "35%"
                          : `${updateProgressPercent}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>
            <div className="grid grid-flow-col gap-1.5">
              {updateState.status === "available" ? (
                <Button onClick={installUpdate} size="sm" variant="primary">
                  下载并安装
                </Button>
              ) : null}
              {updateState.status === "installed" ? (
                <Button onClick={restartApp} size="sm" variant="primary">
                  重启 Drift
                </Button>
              ) : null}
              {updateState.status === "available" ? (
                <Button
                  onClick={() => openUrl(updateState.releaseUrl)}
                  size="sm"
                >
                  GitHub
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  setActiveTab("about");
                }}
                size="sm"
              >
                查看详情
              </Button>
              {updateState.status === "available" ? (
                <Button
                  aria-label="稍后提醒"
                  onClick={() =>
                    setDismissedUpdateVersion(updateState.latestVersion)
                  }
                  size="sm"
                  variant="ghost"
                >
                  稍后
                </Button>
              ) : null}
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
            onCheckUpdate={checkForUpdate}
            onInstallUpdate={installUpdate}
            onLoadCurrentVersion={loadCurrentVersion}
            onRestartApp={restartApp}
            onUpdateConfigChange={updateUpdateConfig}
            updateState={updateState}
            updateConfig={config.update}
          />
        ) : null}
      </section>

      <footer>
        <span className="text-[11px] text-[#6f7782]">
          {config.shortcuts.toggleEditMode} 切换编辑模式 ·{" "}
          {config.shortcuts.toggleOverlayWindow} 显示/隐藏弹幕窗口 ·{" "}
          {config.shortcuts.openSendDanmaku} 发送弹幕
        </span>
      </footer>
    </main>
  );
}

type UpdateState = ReturnType<typeof useAppUpdate>["state"];

function getUpdateNoticeText(
  updateState: UpdateState,
  progressPercent: number | null,
) {
  if (updateState.status === "downloading") {
    return {
      title:
        progressPercent === null
          ? "正在下载更新"
          : `正在下载更新 ${progressPercent}%`,
      description:
        progressPercent === null
          ? `已下载 ${formatBytes(updateState.downloadedBytes)}`
          : `${formatBytes(updateState.downloadedBytes)} / ${formatBytes(
              updateState.totalBytes ?? 0,
            )}`,
    };
  }

  if (updateState.status === "installing") {
    return {
      title: "正在安装更新",
      description: "安装过程中请不要关闭 Drift。",
    };
  }

  if (updateState.status === "installed") {
    return {
      title: "安装完成，重启后生效",
      description: "重启 Drift 后即可使用新版本。",
    };
  }

  return {
    title: `发现新版本 ${updateState.latestVersion}`,
    description: `当前版本 ${updateState.currentVersion || "未知"}，可在应用内下载并安装。`,
  };
}

function formatBytes(value: number) {
  if (value <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
