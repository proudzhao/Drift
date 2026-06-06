import { useEffect, useMemo, useState } from "react";
import type { EditingSavedRoom } from "../../components/control/SavedRoomList";
import {
  ALL_SAVED_ROOM_GROUP_ID,
  UNGROUPED_SAVED_ROOM_GROUP_ID,
  type AppConfig,
  type SavedRoomGroup,
  type SavedRoom,
} from "../../types/config";
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
  const [selectedSavedRoomGroupId, setSelectedSavedRoomGroupId] = useState(
    ALL_SAVED_ROOM_GROUP_ID,
  );
  const [savedRoomSearchQuery, setSavedRoomSearchQuery] = useState("");

  const filteredSavedRooms = useMemo(
    () =>
      filterSavedRooms(
        config.savedRooms,
        selectedSavedRoomGroupId,
        savedRoomSearchQuery,
      ),
    [config.savedRooms, savedRoomSearchQuery, selectedSavedRoomGroupId],
  );

  useEffect(() => {
    if (
      selectedSavedRoomGroupId !== ALL_SAVED_ROOM_GROUP_ID &&
      !config.savedRoomGroups.some(
        (group) => group.id === selectedSavedRoomGroupId,
      )
    ) {
      setSelectedSavedRoomGroupId(ALL_SAVED_ROOM_GROUP_ID);
    }
  }, [config.savedRoomGroups, selectedSavedRoomGroupId]);

  async function saveRooms(savedRooms: SavedRoom[]) {
    await saveConfig({
      ...config,
      savedRooms,
    });
  }

  async function saveRoomGroups(
    savedRoomGroups: SavedRoomGroup[],
    savedRooms = config.savedRooms,
  ) {
    await saveConfig({
      ...config,
      savedRoomGroups,
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
    const targetGroupId = resolveDefaultSaveGroupId(
      config,
      selectedSavedRoomGroupId,
    );
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
            groupId: targetGroupId,
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
      groupId: resolveTargetGroupId(config, room.groupId),
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
              groupId: resolveTargetGroupId(config, editingSavedRoom.groupId),
              updatedAt: new Date().toISOString(),
            }
          : room,
      ),
    );
    setEditingSavedRoom(null);
  }

  async function createSavedRoomGroup(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSavedRoomError("分组名称不能为空");
      return false;
    }
    if (hasDuplicateGroupName(config.savedRoomGroups, trimmedName)) {
      setSavedRoomError("分组名称已存在");
      return false;
    }

    const now = new Date().toISOString();
    const group: SavedRoomGroup = {
      id: createSavedRoomGroupId(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
    };

    setSavedRoomError("");
    await saveRoomGroups([...config.savedRoomGroups, group]);
    setSelectedSavedRoomGroupId(group.id);
    return true;
  }

  async function renameSavedRoomGroup(groupId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSavedRoomError("分组名称不能为空");
      return false;
    }
    if (hasDuplicateGroupName(config.savedRoomGroups, trimmedName, groupId)) {
      setSavedRoomError("分组名称已存在");
      return false;
    }
    if (!config.savedRoomGroups.some((group) => group.id === groupId)) {
      setSavedRoomError("分组不存在");
      return false;
    }

    const now = new Date().toISOString();
    setSavedRoomError("");
    await saveRoomGroups(
      config.savedRoomGroups.map((group) =>
        group.id === groupId
          ? { ...group, name: trimmedName, updatedAt: now }
          : group,
      ),
    );
    return true;
  }

  async function deleteSavedRoomGroup(groupId: string) {
    if (config.savedRoomGroups.length <= 1) {
      setSavedRoomError("至少保留一个分组");
      return false;
    }
    const groupExists = config.savedRoomGroups.some(
      (group) => group.id === groupId,
    );
    if (!groupExists) {
      setSavedRoomError("分组不存在");
      return false;
    }

    const nextGroups = config.savedRoomGroups.filter(
      (group) => group.id !== groupId,
    );
    const nextRooms = config.savedRooms.map((room) =>
      room.groupId === groupId
        ? { ...room, groupId: UNGROUPED_SAVED_ROOM_GROUP_ID }
        : room,
    );

    setSavedRoomError("");
    await saveRoomGroups(nextGroups, nextRooms);
    if (selectedSavedRoomGroupId === groupId) {
      setSelectedSavedRoomGroupId(ALL_SAVED_ROOM_GROUP_ID);
    }
    return true;
  }

  return {
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
  };
}

function filterSavedRooms(
  rooms: SavedRoom[],
  selectedGroupId: string,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();

  return rooms.filter((room) => {
    const matchesGroup =
      selectedGroupId === ALL_SAVED_ROOM_GROUP_ID ||
      room.groupId === selectedGroupId;
    if (!matchesGroup) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [room.roomId, room.displayName, room.anchorName ?? ""].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });
}

function resolveTargetGroupId(config: AppConfig, groupId: string) {
  if (config.savedRoomGroups.some((group) => group.id === groupId)) {
    return groupId;
  }
  return UNGROUPED_SAVED_ROOM_GROUP_ID;
}

function resolveDefaultSaveGroupId(config: AppConfig, selectedGroupId: string) {
  if (
    selectedGroupId !== ALL_SAVED_ROOM_GROUP_ID &&
    config.savedRoomGroups.some((group) => group.id === selectedGroupId)
  ) {
    return selectedGroupId;
  }

  return UNGROUPED_SAVED_ROOM_GROUP_ID;
}

function hasDuplicateGroupName(
  groups: SavedRoomGroup[],
  name: string,
  ignoredGroupId?: string,
) {
  return groups.some(
    (group) => group.id !== ignoredGroupId && group.name === name,
  );
}

function createSavedRoomGroupId() {
  return `group-${createSavedRoomId()}`;
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
