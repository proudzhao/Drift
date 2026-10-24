import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { RoomSessionSnapshot } from "../types/roomSession";
import { isSourceActive } from "../types/roomSession";

export type OnlineRankCountItem = {
  sessionId: string;
  roomId: number;
  label: string;
  count: number;
};

type OnlineRankCountUpdate = {
  sessionId: string;
  roomId: number;
  count: number;
};

type Params = {
  enabled: boolean;
  roomSessions: RoomSessionSnapshot[];
};

export function useOnlineRankCounts({ enabled, roomSessions }: Params) {
  const sessionsRef = useRef(roomSessions);
  const [counts, setCounts] = useState<Record<string, OnlineRankCountUpdate>>(
    {},
  );

  useLayoutEffect(() => {
    sessionsRef.current = roomSessions;
  }, [roomSessions]);

  useEffect(() => {
    if (!enabled) {
      setCounts({});
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<unknown>("bilibili-online-rank-count", (event) => {
      if (disposed) return;
      const update = normalizeOnlineRankCountUpdate(event.payload);
      if (!update) return;
      const session = sessionsRef.current.find(
        (candidate) => candidate.sessionId === update.sessionId,
      );
      if (
        !session ||
        session.roomId !== update.roomId ||
        !isSourceActive(session.status)
      ) {
        return;
      }
      setCounts((current) => {
        const previous = current[update.sessionId];
        if (
          previous?.roomId === update.roomId &&
          previous.count === update.count
        ) {
          return current;
        }
        return { ...current, [update.sessionId]: update };
      });
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {
        console.warn("Failed to listen for online rank count updates.");
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [enabled]);

  useLayoutEffect(() => {
    const activeSessions = new Map(
      roomSessions
        .filter(
          (session) => session.roomId !== undefined && isSourceActive(session.status),
        )
        .map((session) => [session.sessionId, session.roomId]),
    );
    setCounts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(
          ([sessionId, update]) =>
            activeSessions.get(sessionId) === update.roomId,
        ),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [roomSessions]);

  return useMemo(
    () =>
      roomSessions
        .filter(
          (session) => session.roomId !== undefined && isSourceActive(session.status),
        )
        .flatMap((session) => {
          const update = counts[session.sessionId];
          if (!update || update.roomId !== session.roomId) return [];
          const anchorName = session.anchorName?.trim();
          return [
            {
              sessionId: session.sessionId,
              roomId: update.roomId,
              label: anchorName || `房间 ${update.roomId}`,
              count: update.count,
            },
          ];
        })
        .sort(
          (left, right) =>
            left.roomId - right.roomId ||
            left.sessionId.localeCompare(right.sessionId),
        ),
    [counts, roomSessions],
  );
}

function normalizeOnlineRankCountUpdate(
  value: unknown,
): OnlineRankCountUpdate | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const sessionId =
    typeof item.sessionId === "string" ? item.sessionId.trim() : "";
  if (
    !sessionId ||
    !Number.isSafeInteger(item.roomId) ||
    Number(item.roomId) <= 0 ||
    !Number.isSafeInteger(item.count) ||
    Number(item.count) < 0
  ) {
    return null;
  }
  return {
    sessionId,
    roomId: Number(item.roomId),
    count: Number(item.count),
  };
}
