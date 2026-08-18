import { Check, MousePointer2, Pencil, Trash2, X } from "lucide-react";
import {
  UNGROUPED_SAVED_ROOM_GROUP_ID,
  type SavedRoom,
  type SavedRoomGroup,
} from "../../types/config";
import {
  IconButton,
  Input,
  Select,
  Tooltip,
  TooltipProvider,
} from "../ui";
import { EmptyState } from "./settings-ui";

export type EditingSavedRoom = {
  displayName: string;
  groupId: string;
  id: string;
  roomId: string;
};

type SavedRoomListProps = {
  editingSavedRoom: EditingSavedRoom | null;
  isConnected: boolean;
  onDeleteRoom: (roomId: string) => void;
  onEditRoomChange: (room: EditingSavedRoom) => void;
  onSaveEditedRoom: () => void;
  onSelectRoom: (room: SavedRoom) => void;
  onStartEditRoom: (room: SavedRoom) => void;
  onStopEditRoom: () => void;
  groups: SavedRoomGroup[];
  rooms: SavedRoom[];
};

export function SavedRoomList({
  editingSavedRoom,
  isConnected,
  onDeleteRoom,
  onEditRoomChange,
  onSaveEditedRoom,
  onSelectRoom,
  onStartEditRoom,
  onStopEditRoom,
  groups,
  rooms,
}: SavedRoomListProps) {
  if (rooms.length === 0) {
    return (
      <EmptyState
        description="输入房间号后可保存到这里。"
        title="暂无常用直播间"
      />
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="settings-scroll-list grid min-h-0 content-start gap-1.5 pr-1">
        {rooms.map((room) => {
          const isEditing = editingSavedRoom?.id === room.id;

          return (
            <div
              className={
                isEditing
                  ? "grid min-w-0 grid-cols-[minmax(0,1fr)_88px_96px_auto] items-center gap-2 rounded-lg border border-drift-line bg-[#0d191e] p-2 max-[619px]:grid-cols-2 max-[519px]:grid-cols-1"
                  : "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-drift-line bg-[#0d191e] px-3 py-2"
              }
              key={room.id}
            >
              {isEditing && editingSavedRoom ? (
                <>
                  <Input
                    aria-label="直播间名称"
                    inputSize="sm"
                    onChange={(event) =>
                      onEditRoomChange({
                        ...editingSavedRoom,
                        displayName: event.currentTarget.value,
                      })
                    }
                    value={editingSavedRoom.displayName}
                  />
                  <Input
                    aria-label="房间号"
                    inputSize="sm"
                    inputMode="numeric"
                    onChange={(event) =>
                      onEditRoomChange({
                        ...editingSavedRoom,
                        roomId: event.currentTarget.value,
                      })
                    }
                    value={editingSavedRoom.roomId}
                  />
                  <Select
                    aria-label="分组"
                    onChange={(event) =>
                      onEditRoomChange({
                        ...editingSavedRoom,
                        groupId: event.currentTarget.value,
                      })
                    }
                    selectSize="sm"
                    value={editingSavedRoom.groupId}
                  >
                    <option value={UNGROUPED_SAVED_ROOM_GROUP_ID}>不分组</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip content="保存">
                      <IconButton
                        aria-label="保存"
                        onClick={onSaveEditedRoom}
                        size="sm"
                        variant="primary"
                      >
                        <Check aria-hidden="true" size={14} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="取消">
                      <IconButton
                        aria-label="取消"
                        onClick={onStopEditRoom}
                        size="sm"
                      >
                        <X aria-hidden="true" size={14} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid min-w-0 gap-0.5">
                    <strong className="truncate text-[11px] text-drift-ink">
                      {room.displayName}
                    </strong>
                    <span className="drift-data-text truncate text-[9px] text-[#789097]">
                      {formatRoomMeta(groups, room)}
                      {room.anchorName ? ` · ${room.anchorName}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip content="选择">
                      <IconButton
                        aria-label="选择"
                        disabled={isConnected}
                        onClick={() => onSelectRoom(room)}
                        size="sm"
                      >
                        <MousePointer2 aria-hidden="true" size={13} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="修改">
                      <IconButton
                        aria-label="修改"
                        onClick={() => onStartEditRoom(room)}
                        size="sm"
                      >
                        <Pencil aria-hidden="true" size={13} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="删除">
                      <IconButton
                        aria-label="删除"
                        onClick={() => onDeleteRoom(room.id)}
                        size="sm"
                        variant="danger"
                      >
                        <Trash2 aria-hidden="true" size={13} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function formatRoomMeta(groups: SavedRoomGroup[], room: SavedRoom) {
  const groupName = groups.find((group) => group.id === room.groupId)?.name;
  return groupName ? `${room.roomId} / ${groupName}` : room.roomId;
}
