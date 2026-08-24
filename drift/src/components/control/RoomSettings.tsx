import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, SavedRoom } from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";
import type { DanmakuRecordingStatus } from "../../types/recording";
import { Button, Input, IconButton, Toggle } from "../ui";
import { SavedRoomGroupControls } from "./SavedRoomGroupControls";
import { SavedRoomList, type EditingSavedRoom } from "./SavedRoomList";
import {
  DataValue,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusBanner,
  StatusDot,
  type StatusTone,
} from "./settings-ui";

type RoomSettingsProps = {
  config: AppConfig;
  draftRoomId: string;
  editingSavedRoom: EditingSavedRoom | null;
  filteredSavedRooms: SavedRoom[];
  isConnected: boolean;
  onCreateGroup: (name: string) => Promise<boolean>;
  onConnect: () => void;
  onDeleteGroup: (groupId: string) => Promise<boolean>;
  onDeleteRoom: (roomId: string) => void;
  onDisconnect: () => void;
  onEditRoomChange: (room: EditingSavedRoom) => void;
  onGroupChange: (groupId: string) => void;
  onOpenRecordingDir: () => void | Promise<void>;
  onRecordingEnabledChange: (enabled: boolean) => void | Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<boolean>;
  onRetryRecording: () => void | Promise<void>;
  onRoomIdChange: (roomId: string) => void;
  onSaveCurrentRoom: () => void;
  onSaveEditedRoom: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectRoom: (room: SavedRoom) => void;
  onStartEditRoom: (room: SavedRoom) => void;
  onStopEditRoom: () => void;
  recordingCommandError: string;
  recordingStatus: DanmakuRecordingStatus;
  savedRoomError: string;
  savedRoomSearchQuery: string;
  selectedGroupId: string;
  status: DanmakuStatus;
};

export function RoomSettings({
  config,
  draftRoomId,
  editingSavedRoom,
  filteredSavedRooms,
  isConnected,
  onCreateGroup,
  onConnect,
  onDeleteGroup,
  onDeleteRoom,
  onDisconnect,
  onEditRoomChange,
  onGroupChange,
  onOpenRecordingDir,
  onRecordingEnabledChange,
  onRenameGroup,
  onRetryRecording,
  onRoomIdChange,
  onSaveCurrentRoom,
  onSaveEditedRoom,
  onSearchQueryChange,
  onSelectRoom,
  onStartEditRoom,
  onStopEditRoom,
  recordingCommandError,
  recordingStatus,
  savedRoomError,
  savedRoomSearchQuery,
  selectedGroupId,
  status,
}: RoomSettingsProps) {
  return (
    <SettingsPage>
      <SettingsSection title="连接">
        <SettingsRow
          control={
            <div className="grid min-w-[280px] grid-cols-[minmax(0,1fr)_28px_64px] gap-2 max-[519px]:min-w-0">
              <Input
                disabled={isConnected}
                id="control-room-id"
                inputMode="numeric"
                onChange={(event) =>
                  onRoomIdChange(event.currentTarget.value)
                }
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
              {isConnected ? (
                <Button onClick={onDisconnect}>断开</Button>
              ) : (
                <Button disabled={!draftRoomId.trim()} onClick={onConnect}>
                  连接
                </Button>
              )}
            </div>
          }
          description={status.message}
          descriptionLayout="inline"
          htmlFor="control-room-id"
          label="房间号"
        />
        <SettingsRow
          control={<DataValue>{status.anchorName || "未知"}</DataValue>}
          description="当前直播间主播"
          descriptionLayout="inline"
          label="主播"
        />
        <SettingsRow
          control={
            <StatusDot
              label={roomStatusText(status)}
              tone={roomStatusTone(status.status)}
            />
          }
          description="连接、重连或房间状态"
          descriptionLayout="inline"
          label="状态"
        />
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
            recordingStatus.currentFileName
              ? recordingStatus.currentFileName
              : "尚未生成记录文件"
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
        description={`${filteredSavedRooms.length} 个`}
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
          {savedRoomError ? (
            <StatusBanner
              description={savedRoomError}
              title="常用直播间操作失败"
              tone="danger"
            />
          ) : null}
          <SavedRoomList
            editingSavedRoom={editingSavedRoom}
            groups={config.savedRoomGroups}
            isConnected={isConnected}
            onDeleteRoom={onDeleteRoom}
            onEditRoomChange={onEditRoomChange}
            onSaveEditedRoom={onSaveEditedRoom}
            onSelectRoom={onSelectRoom}
            onStartEditRoom={onStartEditRoom}
            onStopEditRoom={onStopEditRoom}
            rooms={filteredSavedRooms}
          />
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

function recordingStatusText(status: DanmakuRecordingStatus) {
  switch (status.state) {
    case "waiting":
      return "等待连接";
    case "recording":
      return "记录中";
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

function roomStatusTone(status: DanmakuStatus["status"]): StatusTone {
  switch (status) {
    case "connected":
      return "success";
    case "connecting":
    case "reconnecting":
      return "signal";
    case "not_live":
    case "invalid_room":
    case "disconnected":
      return "warning";
    case "idle":
    default:
      return "neutral";
  }
}
