import { useState } from "react";
import type { EditingSavedRoom } from "../../components/control/SavedRoomList";
import type { AppConfig, SavedRoom } from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";

type UseSavedRoomsParams = {
  config: AppConfig;
  draftRoomId: string;
  saveConfig: (config: AppConfig) => Promise<void>;
  setDraftRoomId: (roomId: string) => void;
  status: DanmakuStatus;
};

export function useSavedRooms({
  config,
  draftRoomId,
  saveConfig,
  setDraftRoomId,
  status,
}: UseSavedRoomsParams) {
  const [editingSavedRoom, setEditingSavedRoom] =
    useState<EditingSavedRoom | null>(null);
  const [savedRoomError, setSavedRoomError] = useState("");

  async function saveRooms(savedRooms: SavedRoom[]) {
    await saveConfig({
      ...config,
      savedRooms,
    });
  }

  async function saveCurrentRoom() {
    const roomId = draftRoomId.trim();
    if (!isValidRoomId(roomId)) {
      setSavedRoomError("请输入有效的直播间房间号");
      return;
    }

    setSavedRoomError("");
    const now = new Date().toISOString();
    const roomName = status.anchorName?.trim();
    const displayName =
      roomName && roomName !== "未知" ? roomName : `房间 ${roomId}`;
    const existingRoom = config.savedRooms.find((room) => room.roomId === roomId);
    const savedRooms = existingRoom
      ? config.savedRooms.map((room) =>
          room.id === existingRoom.id
            ? {
                ...room,
                anchorName: roomName || room.anchorName,
                displayName: room.displayName || displayName,
                updatedAt: now,
              }
            : room,
        )
      : [
          {
            id: createSavedRoomId(),
            roomId,
            displayName,
            anchorName: roomName,
            updatedAt: now,
          },
          ...config.savedRooms,
        ];

    await saveRooms(savedRooms);
  }

  function selectSavedRoom(room: SavedRoom) {
    setDraftRoomId(room.roomId);
    setSavedRoomError("");
  }

  async function deleteSavedRoom(savedRoomId: string) {
    if (editingSavedRoom?.id === savedRoomId) {
      setEditingSavedRoom(null);
    }
    setSavedRoomError("");
    await saveRooms(config.savedRooms.filter((room) => room.id !== savedRoomId));
  }

  function startEditSavedRoom(room: SavedRoom) {
    setSavedRoomError("");
    setEditingSavedRoom({
      id: room.id,
      roomId: room.roomId,
      displayName: room.displayName,
    });
  }

  async function saveEditedRoom() {
    if (!editingSavedRoom) {
      return;
    }

    const roomId = editingSavedRoom.roomId.trim();
    const displayName = editingSavedRoom.displayName.trim();
    if (!displayName) {
      setSavedRoomError("名称不能为空");
      return;
    }
    if (!isValidRoomId(roomId)) {
      setSavedRoomError("请输入有效的直播间房间号");
      return;
    }
    if (
      config.savedRooms.some(
        (room) => room.id !== editingSavedRoom.id && room.roomId === roomId,
      )
    ) {
      setSavedRoomError("该房间号已在常用直播间中");
      return;
    }

    setSavedRoomError("");
    await saveRooms(
      config.savedRooms.map((room) =>
        room.id === editingSavedRoom.id
          ? {
              ...room,
              roomId,
              displayName,
              updatedAt: new Date().toISOString(),
            }
          : room,
      ),
    );
    setEditingSavedRoom(null);
  }

  return {
    deleteSavedRoom,
    editingSavedRoom,
    savedRoomError,
    saveCurrentRoom,
    saveEditedRoom,
    selectSavedRoom,
    setEditingSavedRoom,
    startEditSavedRoom,
  };
}

function createSavedRoomId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidRoomId(roomId: string) {
  const numericRoomId = Number(roomId.trim());
  return Number.isSafeInteger(numericRoomId) && numericRoomId > 0;
}
