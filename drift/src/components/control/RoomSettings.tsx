import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, SavedRoom } from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";
import { classNames } from "../../utils/classNames";
import { Button, Input, IconButton } from "../ui";
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
  const roomStatusClassName = roomStatusColor(status.status);
  const anchorName = status.anchorName || "未知";

  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] content-stretch gap-3 overflow-hidden">
      <div className="grid grid-cols-[max-content_minmax(0,1fr)_auto_64px] items-center gap-2">
        <label
          className="flex items-center gap-1 text-[13px] font-semibold text-[#1f1f1f]"
          htmlFor="control-room-id"
        >
          房间号
        </label>
        <Input
          disabled={isConnected}
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
        {isConnected ? (
          <Button onClick={onDisconnect}>
            断开
          </Button>
        ) : (
          <Button disabled={!draftRoomId.trim()} onClick={onConnect}>
            连接
          </Button>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-center gap-4">
        <div className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium text-[#555d66]">
          <span
            className={classNames(
              "size-2.5 shrink-0 rounded-full",
              roomStatusClassName.dot,
            )}
          />
          <span className={roomStatusClassName.text}>状态：{roomStatusLabel}</span>
          <span>主播：{anchorName}</span>
        </div>
        <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[11px] text-[#6f7782]">
          {status.message}
        </p>
      </div>
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden">
        <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-[7px] overflow-hidden pt-0.5">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_max-content] items-center gap-2">
            <div className="flex min-w-0 items-baseline gap-[7px]">
              <strong className="text-[13px] font-bold text-[#1f1f1f]">
                常用直播间
              </strong>
              <span className="text-[10px] font-semibold text-[#7c8490]">
                {filteredSavedRooms.length} 个
              </span>
            </div>
            <Button
              disabled={!draftRoomId.trim()}
              onClick={onSaveCurrentRoom}
              size="sm"
            >
              保存当前直播间
            </Button>
          </div>
          <div className="grid min-w-0 gap-1.5">
            {savedRoomError ? (
              <p className="m-0 text-[11px] leading-snug text-[#b45f06]">
                {savedRoomError}
              </p>
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

function roomStatusColor(status: DanmakuStatus["status"]) {
  switch (status) {
    case "connected":
      return {
        dot: "bg-[#34c759]",
        text: "text-[#248a3d]",
      };
    case "connecting":
      return {
        dot: "bg-[#0a84ff]",
        text: "text-[#555d66]",
      };
    case "reconnecting":
      return {
        dot: "bg-[#0a84ff]",
        text: "text-[#b45f06]",
      };
    case "not_live":
    case "invalid_room":
    case "disconnected":
      return {
        dot: "bg-[#ff9500]",
        text: "text-[#b45f06]",
      };
    case "idle":
    default:
      return {
        dot: "bg-[#a8a8a8]",
        text: "text-[#555d66]",
      };
  }
}
