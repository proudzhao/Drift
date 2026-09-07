import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  UNGROUPED_SAVED_ROOM_GROUP_ID,
  type SavedRoom,
  type SavedRoomGroup,
} from "../../types/config";
import {
  isNetworkSessionActive,
  type RoomSessionSnapshot,
} from "../../types/roomSession";
import { findRoomSession } from "../../hooks/control/useRoomConnections";
import {
  Button,
  IconButton,
  Input,
  Select,
  Toggle,
  Tooltip,
  TooltipProvider,
} from "../ui";
import { EmptyState, StatusDot } from "./settings-ui";
import { sessionStatusText, sessionStatusTone } from "./RoomSessionList";

export type EditingSavedRoom = {
  displayName: string;
  groupId: string;
  id: string;
  roomId: string;
};

type SavedRoomListProps = {
  commandErrors: Record<string, string>;
  editingSavedRoom: EditingSavedRoom | null;
  groups: SavedRoomGroup[];
  onConnectRoom: (room: SavedRoom) => void | Promise<void>;
  onDeleteRoom: (roomId: string) => void;
  onDisconnectSession: (sessionId: string) => void | Promise<void>;
  onEditRoomChange: (room: EditingSavedRoom) => void;
  onRetrySession: (session: RoomSessionSnapshot) => void | Promise<void>;
  onRoomSelected: (savedRoomId: string, selected: boolean) => void | Promise<void>;
  onSaveEditedRoom: () => void;
  onStartEditRoom: (room: SavedRoom) => void;
  onStopEditRoom: () => void;
  rooms: SavedRoom[];
  selectedSavedRoomIds: Set<string>;
  sessions: RoomSessionSnapshot[];
};

export function SavedRoomList({
  commandErrors,
  editingSavedRoom,
  groups,
  onConnectRoom,
  onDeleteRoom,
  onDisconnectSession,
  onEditRoomChange,
  onRetrySession,
  onRoomSelected,
  onSaveEditedRoom,
  onStartEditRoom,
  onStopEditRoom,
  rooms,
  selectedSavedRoomIds,
  sessions,
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
          const session = findRoomSession(room, sessions);
          const active = session && isNetworkSessionActive(session.status);
          const commandError =
            commandErrors[room.id] ||
            (session ? commandErrors[session.sessionId] : "");

          return (
            <div
              className={
                isEditing
                  ? "drift-theme-transition grid min-w-0 grid-cols-[minmax(0,1fr)_88px_96px_auto] items-center gap-2 rounded-lg border border-drift-line bg-[var(--drift-ui-surface)] p-2 max-[619px]:grid-cols-2 max-[519px]:grid-cols-1"
                  : "drift-theme-transition grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-drift-line bg-[var(--drift-ui-surface)] px-3 py-2 max-[519px]:grid-cols-[auto_minmax(0,1fr)]"
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
                  <Toggle
                    aria-label={`加入多房间 ${room.displayName}`}
                    checked={selectedSavedRoomIds.has(room.id)}
                    onCheckedChange={(checked) =>
                      void onRoomSelected(room.id, checked)
                    }
                  />
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <strong className="drift-theme-transition truncate text-[11px] text-drift-ink">
                        {room.displayName}
                      </strong>
                      {session ? (
                        <StatusDot
                          label={sessionStatusText(session)}
                          tone={sessionStatusTone(session.status)}
                        />
                      ) : (
                        <StatusDot label="未连接" />
                      )}
                    </div>
                    <span className="drift-data-text drift-theme-transition truncate text-[9px] text-[var(--drift-ui-muted)]">
                      {formatRoomMeta(groups, room)}
                      {room.anchorName ? ` · ${room.anchorName}` : ""}
                    </span>
                    {commandError ? (
                      <span
                        className="drift-theme-transition text-[9px] text-[var(--drift-ui-danger)]"
                        role="alert"
                      >
                        {commandError}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1 max-[519px]:col-span-2">
                    {active && session ? (
                      <Button
                        aria-label={`断开房间 ${room.roomId}`}
                        onClick={() => void onDisconnectSession(session.sessionId)}
                        size="sm"
                        variant="danger"
                      >
                        断开
                      </Button>
                    ) : session ? (
                      <Button
                        aria-label={`重试房间 ${room.roomId}`}
                        onClick={() => void onRetrySession(session)}
                        size="sm"
                        variant="primary"
                      >
                        重试
                      </Button>
                    ) : (
                      <Button
                        aria-label={`连接房间 ${room.roomId}`}
                        onClick={() => void onConnectRoom(room)}
                        size="sm"
                        variant="primary"
                      >
                        连接
                      </Button>
                    )}
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
