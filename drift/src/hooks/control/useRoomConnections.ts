import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, SavedRoom } from "../../types/config";
import {
  isNetworkSessionActive,
  type RoomSessionSnapshot,
} from "../../types/roomSession";
import type { AppConfigUpdater } from "./useControlConfig";

const INVALID_ROOM_ID_ERROR = "请输入有效的直播间房间号";
const MAX_SELECTED_ROOMS_ERROR = "最多选择 5 个直播间";

type UseRoomConnectionsParams = {
  config: AppConfig;
  saveConfig: (updater: AppConfigUpdater) => Promise<void>;
  sessions: RoomSessionSnapshot[];
};

export function useRoomConnections({
  config,
  saveConfig,
  sessions,
}: UseRoomConnectionsParams) {
  const [commandErrors, setCommandErrors] = useState<Record<string, string>>(
    {},
  );
  const [selectionError, setSelectionError] = useState("");
  const selectedSavedRoomIds = useMemo(
    () => new Set(config.selectedSavedRoomIds),
    [config.selectedSavedRoomIds],
  );
  const temporarySessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          !config.savedRooms.some((room) =>
            roomMatchesSession(room, session),
          ),
      ),
    [config.savedRooms, sessions],
  );

  async function setRoomSelected(savedRoomId: string, selected: boolean) {
    try {
      await saveConfig((current) => {
        if (!selected) {
          return {
            ...current,
            selectedSavedRoomIds: current.selectedSavedRoomIds.filter(
              (id) => id !== savedRoomId,
            ),
          };
        }

        if (current.selectedSavedRoomIds.includes(savedRoomId)) {
          return current;
        }
        if (current.selectedSavedRoomIds.length >= 5) {
          throw new Error(MAX_SELECTED_ROOMS_ERROR);
        }

        return {
          ...current,
          selectedSavedRoomIds: [...current.selectedSavedRoomIds, savedRoomId],
        };
      });
      setSelectionError("");
    } catch (error) {
      setSelectionError(errorMessage(error));
    }
  }

  async function connectDraftRoom(roomId: string) {
    const requestedRoomId = parseRoomId(roomId);
    if (requestedRoomId === null) {
      setCommandError("draft", INVALID_ROOM_ID_ERROR);
      return;
    }
    await runCommand("draft", "connect_bilibili_room", { requestedRoomId });
  }

  async function connectSavedRoom(room: SavedRoom) {
    const requestedRoomId = parseRoomId(room.roomId);
    if (requestedRoomId === null) {
      setCommandError(room.id, INVALID_ROOM_ID_ERROR);
      return;
    }
    await runCommand(room.id, "connect_bilibili_room", { requestedRoomId });
  }

  async function connectSelectedRooms() {
    const rooms = config.selectedSavedRoomIds
      .map((id) => config.savedRooms.find((room) => room.id === id))
      .filter((room): room is SavedRoom => room !== undefined)
      .filter(
        (room) =>
          !sessions.some(
            (session) =>
              isNetworkSessionActive(session.status) &&
              roomMatchesSession(room, session),
          ),
      );
    const validRooms: Array<{
      requestedRoomId: number;
      room: SavedRoom;
    }> = [];
    const invalidRoomIds = new Set<string>();
    for (const room of rooms) {
      const requestedRoomId = parseRoomId(room.roomId);
      if (requestedRoomId === null) {
        invalidRoomIds.add(room.id);
        continue;
      }
      validRooms.push({ requestedRoomId, room });
    }
    const outcomes = await Promise.allSettled(
      validRooms.map(({ requestedRoomId }) =>
        invoke("connect_bilibili_room", {
          requestedRoomId,
        }),
      ),
    );

    setCommandErrors((current) => {
      const next = { ...current };
      rooms.forEach((room) => {
        if (invalidRoomIds.has(room.id)) {
          next[room.id] = INVALID_ROOM_ID_ERROR;
        }
      });
      validRooms.forEach(({ room }, index) => {
        const outcome = outcomes[index];
        if (outcome.status === "rejected") {
          next[room.id] = String(outcome.reason);
        } else {
          delete next[room.id];
        }
      });
      return next;
    });
  }

  async function disconnectSession(sessionId: string) {
    await runCommand(sessionId, "disconnect_bilibili_room", { sessionId });
  }

  async function disconnectAllRooms() {
    await runCommand("all", "disconnect_all_bilibili_rooms");
  }

  async function retrySession(session: RoomSessionSnapshot) {
    setCommandError(session.sessionId, "");
    try {
      await invoke("disconnect_bilibili_room", {
        sessionId: session.sessionId,
      });
      await invoke("connect_bilibili_room", {
        requestedRoomId: session.requestedRoomId,
      });
    } catch (error) {
      setCommandError(session.sessionId, String(error));
    }
  }

  async function runCommand(
    errorKey: string,
    command: string,
    payload?: Record<string, unknown>,
  ) {
    setCommandError(errorKey, "");
    try {
      await invoke(command, payload);
    } catch (error) {
      setCommandError(errorKey, errorMessage(error));
    }
  }

  function setCommandError(key: string, error: string) {
    setCommandErrors((current) => {
      const next = { ...current };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
  }

  return {
    commandErrors,
    connectDraftRoom,
    connectSavedRoom,
    connectSelectedRooms,
    disconnectSession,
    disconnectAllRooms,
    retrySession,
    setRoomSelected,
    selectedSavedRoomIds,
    selectionError,
    temporarySessions,
  };
}

export function roomMatchesSession(
  room: SavedRoom,
  session: RoomSessionSnapshot,
) {
  const roomId = parseRoomId(room.roomId);
  return (
    roomId !== null &&
    (roomId === session.requestedRoomId || roomId === session.roomId)
  );
}

export function findRoomSession(
  room: SavedRoom,
  sessions: RoomSessionSnapshot[],
) {
  const matches = sessions.filter((session) =>
    roomMatchesSession(room, session),
  );
  return (
    matches.find((session) => isNetworkSessionActive(session.status)) ??
    matches[0]
  );
}

function parseRoomId(roomId: string) {
  const numericRoomId = Number(roomId.trim());
  return Number.isSafeInteger(numericRoomId) && numericRoomId > 0
    ? numericRoomId
    : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
