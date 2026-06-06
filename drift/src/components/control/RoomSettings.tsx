import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, SavedRoom } from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";
import { SavedRoomGroupControls } from "./SavedRoomGroupControls";
import { SavedRoomList, type EditingSavedRoom } from "./SavedRoomList";

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
  onRenameGroup: (groupId: string, name: string) => Promise<boolean>;
  onRoomIdChange: (roomId: string) => void;
  onSaveCurrentRoom: () => void;
  onSaveEditedRoom: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectRoom: (room: SavedRoom) => void;
  onStartEditRoom: (room: SavedRoom) => void;
  onStopEditRoom: () => void;
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
  onRenameGroup,
  onRoomIdChange,
  onSaveCurrentRoom,
  onSaveEditedRoom,
  onSearchQueryChange,
  onSelectRoom,
  onStartEditRoom,
  onStopEditRoom,
  savedRoomError,
  savedRoomSearchQuery,
  selectedGroupId,
  status,
}: RoomSettingsProps) {
  const roomStatusLabel = roomStatusText(status);
  const anchorName = status.anchorName || "未知";

  return (
    <div className="settings-page room-settings">
      <div className="settings-row room-form">
        <label htmlFor="control-room-id">房间号</label>
        <input
          disabled={isConnected}
          id="control-room-id"
          inputMode="numeric"
          onChange={(event) => onRoomIdChange(event.currentTarget.value)}
          placeholder="输入房间号"
          value={draftRoomId}
        />
        <span
          className="help-link"
          onClick={() => invoke("open_help_window")}
          title="如何获取房间号"
        >
          ?
        </span>
        {isConnected ? (
          <button onClick={onDisconnect} type="button">
            断开
          </button>
        ) : (
          <button disabled={!draftRoomId.trim()} onClick={onConnect} type="button">
            连接
          </button>
        )}
      </div>
      <div className="room-status-line">
        <div className="room-meta">
          <span className="status-dot" data-status={status.status} />
          <span data-status={status.status}>状态：{roomStatusLabel}</span>
          <span>主播：{anchorName}</span>
        </div>
        <p className="control-status">{status.message}</p>
      </div>
      <div className="room-list-panels">
        <section className="saved-room-panel">
          <div className="saved-room-header">
            <div>
              <strong>常用直播间</strong>
              <span>{filteredSavedRooms.length} 个</span>
            </div>
            <button
              disabled={!draftRoomId.trim()}
              onClick={onSaveCurrentRoom}
              type="button"
            >
              保存当前直播间
            </button>
          </div>
          <div className="saved-room-tools">
            {savedRoomError ? (
              <p className="control-error">{savedRoomError}</p>
            ) : null}
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
          </div>
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
        </section>
      </div>
    </div>
  );
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
