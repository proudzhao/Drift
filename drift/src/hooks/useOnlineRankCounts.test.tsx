import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RoomSessionSnapshot } from "../types/roomSession";
import { useOnlineRankCounts } from "./useOnlineRankCounts";

const eventMock = vi.hoisted(() => {
  let handler: ((event: { payload: unknown }) => void) | undefined;
  return {
    emit(payload: unknown) {
      handler?.({ payload });
    },
    listen: vi.fn(async (_event: string, callback: typeof handler) => {
      handler = callback;
      return vi.fn(() => {
        if (handler === callback) handler = undefined;
      });
    }),
    reset() {
      handler = undefined;
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: eventMock.listen }));

function session(
  sessionId: string,
  roomId: number,
  anchorName: string,
  status: RoomSessionSnapshot["status"] = "connected",
): RoomSessionSnapshot {
  return {
    sessionId,
    requestedRoomId: roomId,
    roomId,
    anchorName,
    status,
    message: status,
  };
}

afterEach(() => {
  eventMock.reset();
  vi.clearAllMocks();
});

test("keeps current room counts sorted and removes disconnected sessions", async () => {
  let roomSessions = [
    session("s2", 7, " 小海梓 "),
    session("s1", 6, "补给箱"),
  ];
  const { result, rerender } = renderHook(() =>
    useOnlineRankCounts({ enabled: true, roomSessions }),
  );

  await act(async () => undefined);
  act(() => {
    eventMock.emit({ sessionId: "s2", roomId: 7, count: 863 });
    eventMock.emit({ sessionId: "s1", roomId: 6, count: 12000 });
  });

  expect(result.current).toEqual([
    { sessionId: "s1", roomId: 6, label: "补给箱", count: 12000 },
    { sessionId: "s2", roomId: 7, label: "小海梓", count: 863 },
  ]);

  roomSessions = [session("s2", 7, "小海梓", "reconnecting")];
  rerender();
  expect(result.current).toEqual([
    { sessionId: "s2", roomId: 7, label: "小海梓", count: 863 },
  ]);
});

test("rejects stale, mismatched and malformed count events", async () => {
  const roomSessions = [session("current", 6, "")];
  const { result } = renderHook(() =>
    useOnlineRankCounts({ enabled: true, roomSessions }),
  );

  await act(async () => undefined);
  act(() => {
    eventMock.emit({ sessionId: "stale", roomId: 6, count: 1 });
    eventMock.emit({ sessionId: "current", roomId: 7, count: 2 });
    eventMock.emit({ sessionId: "current", roomId: 6, count: -1 });
    eventMock.emit({ sessionId: "current", roomId: 6, count: 1.5 });
    eventMock.emit({ sessionId: "current", roomId: 6, count: 0 });
  });

  expect(result.current).toEqual([
    { sessionId: "current", roomId: 6, label: "房间 6", count: 0 },
  ]);
});
