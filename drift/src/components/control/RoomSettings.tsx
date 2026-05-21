import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, SavedRoom } from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";
import { SavedRoomList, type EditingSavedRoom } from "./SavedRoomList";

type RoomSettingsProps = {
  config: AppConfig;
  draftRoomId: string;
  editingSavedRoom: EditingSavedRoom | null;
  isConnected: boolean;
  onConnect: () => void;
  onDeleteRoom: (roomId: string) => void;
  onDisconnect: () => void;
  onEditRoomChange: (room: EditingSavedRoom) => void;
  onRoomIdChange: (roomId: string) => void;
  onSaveCurrentRoom: () => void;
  onSaveEditedRoom: () => void;
  onSelectRoom: (room: SavedRoom) => void;
  onStartEditRoom: (room: SavedRoom) => void;
  onStopEditRoom: () => void;
  savedRoomError: string;
  status: DanmakuStatus;
};

export function RoomSettings({
  config,
  draftRoomId,
  editingSavedRoom,
  isConnected,
  onConnect,
  onDeleteRoom,
  onDisconnect,
  onEditRoomChange,
  onRoomIdChange,
  onSaveCurrentRoom,
  onSaveEditedRoom,
  onSelectRoom,
  onStartEditRoom,
  onStopEditRoom,
  savedRoomError,
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
      <div className="room-meta">
        <span className="status-dot" data-status={status.status} />
        <span data-status={status.status}>状态：{roomStatusLabel}</span>
        <span>主播：{anchorName}</span>
      </div>
      <p className="control-status">{status.message}</p>
      <section className="saved-room-panel">
        <div className="saved-room-header">
          <strong>常用直播间</strong>
          <button
            disabled={!draftRoomId.trim()}
            onClick={onSaveCurrentRoom}
            type="button"
          >
            保存当前直播间
          </button>
        </div>
        {savedRoomError ? <p className="control-error">{savedRoomError}</p> : null}
        <SavedRoomList
          editingSavedRoom={editingSavedRoom}
          isConnected={isConnected}
          onDeleteRoom={onDeleteRoom}
          onEditRoomChange={onEditRoomChange}
          onSaveEditedRoom={onSaveEditedRoom}
          onSelectRoom={onSelectRoom}
          onStartEditRoom={onStartEditRoom}
          onStopEditRoom={onStopEditRoom}
          rooms={config.savedRooms}
        />
      </section>
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
