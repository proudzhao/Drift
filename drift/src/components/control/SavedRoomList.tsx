import type { SavedRoom } from "../../types/config";

export type EditingSavedRoom = {
  displayName: string;
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
  rooms,
}: SavedRoomListProps) {
  if (rooms.length === 0) {
    return (
      <p className="empty-state">
        暂无常用直播间，输入房间号后可保存到这里。
      </p>
    );
  }

  return (
    <div className="saved-room-list settings-scroll-list">
      {rooms.map((room) => {
        const isEditing = editingSavedRoom?.id === room.id;

        return (
          <div
            className={`saved-room-item ${isEditing ? "is-editing" : ""}`}
            key={room.id}
          >
            {isEditing && editingSavedRoom ? (
              <>
                <input
                  aria-label="直播间名称"
                  onChange={(event) =>
                    onEditRoomChange({
                      ...editingSavedRoom,
                      displayName: event.currentTarget.value,
                    })
                  }
                  value={editingSavedRoom.displayName}
                />
                <input
                  aria-label="房间号"
                  inputMode="numeric"
                  onChange={(event) =>
                    onEditRoomChange({
                      ...editingSavedRoom,
                      roomId: event.currentTarget.value,
                    })
                  }
                  value={editingSavedRoom.roomId}
                />
                <div className="saved-room-actions">
                  <button onClick={onSaveEditedRoom} type="button">
                    保存
                  </button>
                  <button onClick={onStopEditRoom} type="button">
                    取消
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="saved-room-info">
                  <strong>{room.displayName}</strong>
                  <span>{room.roomId}</span>
                </div>
                <div className="saved-room-actions">
                  <button
                    disabled={isConnected}
                    onClick={() => onSelectRoom(room)}
                    type="button"
                  >
                    选择
                  </button>
                  <button onClick={() => onStartEditRoom(room)} type="button">
                    修改
                  </button>
                  <button onClick={() => onDeleteRoom(room.id)} type="button">
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
