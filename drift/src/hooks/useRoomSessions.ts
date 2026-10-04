import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  RoomSessionSnapshot,
  RoomSessionStatus,
} from "../types/roomSession";

type UseRoomSessionsParams = {
  enabled: boolean;
};

type UseRoomSessionsResult = {
  isInitialReady: boolean;
  refreshSessions: () => Promise<void>;
  sessions: RoomSessionSnapshot[];
  snapshotError: string;
};

const ROOM_SESSION_STATUSES = new Set<RoomSessionStatus>([
  "connecting",
  "connected",
  "reconnecting",
  "disconnected",
  "not_live",
  "invalid_room",
  "error",
]);

const INVALID_SNAPSHOT_ERROR = "房间会话状态格式无效";

export function useRoomSessions({
  enabled,
}: UseRoomSessionsParams): UseRoomSessionsResult {
  const [sessions, setSessions] = useState<RoomSessionSnapshot[]>([]);
  const [snapshotError, setSnapshotError] = useState("");
  const [isInitialReady, setIsInitialReady] = useState(false);
  const mountedRef = useRef(false);
  const eventVersionRef = useRef(0);

  const refreshSessions = useCallback(async () => {
    const requestVersion = eventVersionRef.current;
    try {
      const snapshot = await invoke<unknown>("get_bilibili_room_sessions");
      if (!mountedRef.current || requestVersion !== eventVersionRef.current) {
        return;
      }
      const normalized = normalizeRoomSessionSnapshots(snapshot);
      if (normalized === null) {
        setSnapshotError(INVALID_SNAPSHOT_ERROR);
      } else {
        setSessions(normalized);
        setSnapshotError("");
      }
      setIsInitialReady(true);
    } catch (error) {
      if (!mountedRef.current || requestVersion !== eventVersionRef.current) {
        return;
      }
      setSnapshotError(String(error));
      setIsInitialReady(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      mountedRef.current = false;
      setSessions([]);
      setSnapshotError("");
      setIsInitialReady(false);
      return;
    }

    mountedRef.current = true;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const disposeListener = await listen<unknown>(
          "bilibili-room-sessions",
          (event) => {
            eventVersionRef.current += 1;
            if (disposed) return;
            setIsInitialReady(true);
            const normalized = normalizeRoomSessionSnapshots(event.payload);
            if (normalized === null) {
              setSnapshotError(INVALID_SNAPSHOT_ERROR);
              return;
            }
            setSessions(normalized);
            setSnapshotError("");
          },
        );
        if (disposed) {
          disposeListener();
          return;
        }
        unlisten = disposeListener;
        await refreshSessions();
      } catch (error) {
        if (!disposed) {
          setSnapshotError(String(error));
          setIsInitialReady(true);
        }
      }
    })();

    return () => {
      disposed = true;
      mountedRef.current = false;
      unlisten?.();
    };
  }, [enabled, refreshSessions]);

  return { isInitialReady, refreshSessions, sessions, snapshotError };
}

export function normalizeRoomSessionSnapshots(
  value: unknown,
): RoomSessionSnapshot[] | null {
  if (!Array.isArray(value)) return null;

  const seenSessionIds = new Set<string>();
  const snapshots: RoomSessionSnapshot[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;

    const sessionId =
      typeof item.sessionId === "string" ? item.sessionId.trim() : "";
    if (
      !sessionId ||
      seenSessionIds.has(sessionId) ||
      !isPositiveInteger(item.requestedRoomId) ||
      (item.roomId !== undefined && !isPositiveInteger(item.roomId)) ||
      !ROOM_SESSION_STATUSES.has(item.status as RoomSessionStatus) ||
      typeof item.message !== "string" ||
      !isOptionalString(item.anchorName) ||
      !isOptionalString(item.fanMedalName) ||
      !isOptionalLiveStatus(item.liveStatus)
    ) {
      continue;
    }

    seenSessionIds.add(sessionId);
    snapshots.push({
      sessionId,
      requestedRoomId: item.requestedRoomId,
      ...(item.roomId === undefined ? {} : { roomId: item.roomId }),
      ...(item.anchorName === undefined ? {} : { anchorName: item.anchorName }),
      ...(item.fanMedalName === undefined
        ? {}
        : { fanMedalName: item.fanMedalName }),
      status: item.status as RoomSessionStatus,
      message: item.message,
      ...(item.liveStatus === undefined ? {} : { liveStatus: item.liveStatus }),
    });
  }
  return snapshots;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalLiveStatus(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)
  );
}
