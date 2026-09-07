import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, SavedRoom } from "../../types/config";
import type { RoomSessionSnapshot } from "../../types/roomSession";
import type { DanmakuRecordingStatus } from "../../types/recording";
import { Button, Input, IconButton, Toggle } from "../ui";
import { RoomSessionList } from "./RoomSessionList";
import { SavedRoomGroupControls } from "./SavedRoomGroupControls";
import { SavedRoomList, type EditingSavedRoom } from "./SavedRoomList";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusBanner,
  StatusDot,
  type StatusTone,
} from "./settings-ui";

type RoomSettingsProps = {
  commandErrors: Record<string, string>;
  config: AppConfig;
  draftRoomId: string;
  editingSavedRoom: EditingSavedRoom | null;
  filteredSavedRooms: SavedRoom[];
  onConnectDraftRoom: () => void | Promise<void>;
  onConnectSavedRoom: (room: SavedRoom) => void | Promise<void>;
  onConnectSelectedRooms: () => void | Promise<void>;
  onCreateGroup: (name: string) => Promise<boolean>;
  onDeleteGroup: (groupId: string) => Promise<boolean>;
  onDeleteRoom: (roomId: string) => void;
  onDisconnectAllRooms: () => void | Promise<void>;
  onDisconnectSession: (sessionId: string) => void | Promise<void>;
  onEditRoomChange: (room: EditingSavedRoom) => void;
  onGroupChange: (groupId: string) => void;
  onOpenRecordingDir: () => void | Promise<void>;
  onRecordingEnabledChange: (enabled: boolean) => void | Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<boolean>;
  onRetryRecording: () => void | Promise<void>;
  onRetrySession: (session: RoomSessionSnapshot) => void | Promise<void>;
  onRoomIdChange: (roomId: string) => void;
  onRoomSelected: (savedRoomId: string, selected: boolean) => void | Promise<void>;
  onSaveCurrentRoom: () => void;
  onSaveEditedRoom: () => void;
  onSaveTemporaryRoom: (session: RoomSessionSnapshot) => void | Promise<void>;
  onSearchQueryChange: (query: string) => void;
  onStartEditRoom: (room: SavedRoom) => void;
  onStopEditRoom: () => void;
  recordingCommandError: string;
  recordingStatus: DanmakuRecordingStatus;
  savedRoomError: string;
  savedRoomSearchQuery: string;
  selectedGroupId: string;
  selectedSavedRoomIds: Set<string>;
  selectionError: string;
  sessions: RoomSessionSnapshot[];
  snapshotError: string;
  temporarySessions: RoomSessionSnapshot[];
};

export function RoomSettings({
  commandErrors,
  config,
  draftRoomId,
  editingSavedRoom,
  filteredSavedRooms,
  onConnectDraftRoom,
  onConnectSavedRoom,
  onConnectSelectedRooms,
  onCreateGroup,
  onDeleteGroup,
  onDeleteRoom,
  onDisconnectAllRooms,
  onDisconnectSession,
  onEditRoomChange,
  onGroupChange,
  onOpenRecordingDir,
  onRecordingEnabledChange,
  onRenameGroup,
  onRetryRecording,
  onRetrySession,
  onRoomIdChange,
  onRoomSelected,
  onSaveCurrentRoom,
  onSaveEditedRoom,
  onSaveTemporaryRoom,
  onSearchQueryChange,
  onStartEditRoom,
  onStopEditRoom,
  recordingCommandError,
  recordingStatus,
  savedRoomError,
  savedRoomSearchQuery,
  selectedGroupId,
  selectedSavedRoomIds,
  selectionError,
  sessions,
  snapshotError,
  temporarySessions,
}: RoomSettingsProps) {
  return (
    <SettingsPage>
      <SettingsSection
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              disabled={selectedSavedRoomIds.size === 0}
              onClick={() => void onConnectSelectedRooms()}
              size="sm"
              variant="primary"
            >
              连接已选房间
            </Button>
            <Button
              disabled={sessions.length === 0}
              onClick={() => void onDisconnectAllRooms()}
              size="sm"
              variant="danger"
            >
              全部断开
            </Button>
          </div>
        }
        description={roomSessionSummary(sessions)}
        title="连接"
      >
        <SettingsRow
          control={
            <div className="grid min-w-[360px] grid-cols-[minmax(0,1fr)_28px_112px] gap-2 max-[619px]:min-w-[280px] max-[519px]:min-w-0 max-[519px]:grid-cols-[minmax(0,1fr)_28px]">
              <Input
                id="control-room-id"
                inputMode="numeric"
                onChange={(event) => onRoomIdChange(event.currentTarget.value)}
                placeholder="输入房间号"
                value={draftRoomId}
              />
              <IconButton
                aria-label="如何获取房间号"
                onClick={() => invoke("open_help_window")}
                size="sm"
                title="如何获取房间号"
                variant="ghost"
              >
                ?
              </IconButton>
              <Button
                className="max-[519px]:col-span-2"
                disabled={!draftRoomId.trim()}
                onClick={() => void onConnectDraftRoom()}
              >
                连接
              </Button>
            </div>
          }
          htmlFor="control-room-id"
          label="房间号"
        />
        {snapshotError || commandErrors.draft || commandErrors.all ? (
          <div className="grid gap-2 border-t border-drift-line p-3">
            {snapshotError ? (
              <StatusBanner
                description={snapshotError}
                title="房间会话状态不可用"
                tone="danger"
              />
            ) : null}
            {commandErrors.draft ? (
              <StatusBanner
                description={commandErrors.draft}
                title="临时房间连接失败"
                tone="danger"
              />
            ) : null}
            {commandErrors.all ? (
              <StatusBanner
                description={commandErrors.all}
                title="全部断开失败"
                tone="danger"
              />
            ) : null}
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection
        actions={
          <Button onClick={onOpenRecordingDir} size="sm">
            打开记录目录
          </Button>
        }
        description="按本机日期和真实房间号保存四类直播消息"
        title="本地记录"
      >
        <SettingsRow
          control={
            <Toggle
              aria-label="记录弹幕"
              checked={recordingStatus.enabled}
              onCheckedChange={onRecordingEnabledChange}
            />
          }
          description="开启状态会持久化，连接直播间后自动开始记录"
          label="记录弹幕"
        />
        <SettingsRow
          control={
            <StatusDot
              label={recordingStatusText(recordingStatus)}
              tone={recordingStatusTone(recordingStatus)}
            />
          }
          description={
            recordingStatus.activeFiles.length === 0 ? (
              "尚未生成记录文件"
            ) : recordingStatus.activeFiles.length === 1 ? (
              recordingStatus.activeFiles[0].fileName
            ) : (
              <>
                {recordingStatus.activeFiles.map((file) => (
                  <span className="block" key={file.roomId}>
                    {file.fileName}
                  </span>
                ))}
              </>
            )
          }
          label="状态"
        />
        {recordingStatus.state === "error" ? (
          <div className="border-t border-drift-line p-3">
            <StatusBanner
              actions={<Button onClick={onRetryRecording}>重试记录</Button>}
              description={`${recordingStatus.errorMessage || "记录服务暂不可用"}；暂停期间的消息不会补写`}
              title="记录已暂停"
              tone="danger"
            />
          </div>
        ) : null}
        {recordingCommandError ? (
          <div className="border-t border-drift-line p-3">
            <StatusBanner
              description={recordingCommandError}
              title="本地记录操作失败"
              tone="danger"
            />
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection
        actions={
          <Button
            disabled={!draftRoomId.trim()}
            onClick={onSaveCurrentRoom}
            size="sm"
          >
            保存当前直播间
          </Button>
        }
        description={`${filteredSavedRooms.length} 个 · 已选 ${selectedSavedRoomIds.size}/5`}
        title="常用直播间"
      >
        <div className="grid min-h-0 gap-2 p-3">
          <SavedRoomGroupControls
            groups={config.savedRoomGroups}
            onCreateGroup={onCreateGroup}
            onDeleteGroup={onDeleteGroup}
            onRenameGroup={onRenameGroup}
            onSearchQueryChange={onSearchQueryChange}
            onSelectedGroupChange={onGroupChange}
            searchQuery={savedRoomSearchQuery}
            selectedGroupId={selectedGroupId}
          />
          {savedRoomError || selectionError ? (
            <StatusBanner
              description={savedRoomError || selectionError}
              title="常用直播间操作失败"
              tone="danger"
            />
          ) : null}
          <SavedRoomList
            commandErrors={commandErrors}
            editingSavedRoom={editingSavedRoom}
            groups={config.savedRoomGroups}
            onConnectRoom={onConnectSavedRoom}
            onDeleteRoom={onDeleteRoom}
            onDisconnectSession={onDisconnectSession}
            onEditRoomChange={onEditRoomChange}
            onRetrySession={onRetrySession}
            onRoomSelected={onRoomSelected}
            onSaveEditedRoom={onSaveEditedRoom}
            onStartEditRoom={onStartEditRoom}
            onStopEditRoom={onStopEditRoom}
            rooms={filteredSavedRooms}
            selectedSavedRoomIds={selectedSavedRoomIds}
            sessions={sessions}
          />
        </div>
      </SettingsSection>

      {temporarySessions.length > 0 ? (
        <SettingsSection
          description="未匹配当前常用直播间，只保留到本次运行结束"
          title="临时连接"
        >
          <RoomSessionList
            commandErrors={commandErrors}
            onDisconnectSession={onDisconnectSession}
            onRetrySession={onRetrySession}
            onSaveRoom={onSaveTemporaryRoom}
            sessions={temporarySessions}
          />
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

function roomSessionSummary(sessions: RoomSessionSnapshot[]) {
  if (sessions.length === 0) return "尚未连接直播间";
  const labels: Array<[RoomSessionSnapshot["status"], string]> = [
    ["connected", "已连接"],
    ["connecting", "连接中"],
    ["reconnecting", "重连中"],
    ["not_live", "未开播"],
    ["invalid_room", "房间号不存在"],
    ["error", "连接失败"],
    ["disconnected", "已断开"],
  ];
  return labels
    .map(([status, label]) => {
      const count = sessions.filter((session) => session.status === status).length;
      return count > 0 ? `${label} ${count}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function recordingStatusText(status: DanmakuRecordingStatus) {
  switch (status.state) {
    case "waiting":
      return "等待连接";
    case "recording":
      return status.activeFiles.length > 1
        ? `记录中 · ${status.activeFiles.length} 个房间`
        : "记录中";
    case "error":
      return "记录已暂停";
    case "disabled":
    default:
      return "关闭";
  }
}

function recordingStatusTone(status: DanmakuRecordingStatus): StatusTone {
  switch (status.state) {
    case "waiting":
      return "signal";
    case "recording":
      return "success";
    case "error":
      return "danger";
    case "disabled":
    default:
      return "neutral";
  }
}
