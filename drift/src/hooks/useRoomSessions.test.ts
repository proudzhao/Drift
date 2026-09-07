import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { RoomSessionSnapshot } from "../types/roomSession";
import { useRoomSessions } from "./useRoomSessions";

const eventMock = vi.hoisted(() => ({
  handler: undefined as
    | ((event: { payload: unknown }) => void)
    | undefined,
  listen: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: eventMock.listen,
}));

const CONNECTED_SESSION: RoomSessionSnapshot = {
  sessionId: "room-session-1",
  requestedRoomId: 6,
  roomId: 6,
  anchorName: "主播甲",
  status: "connected",
  message: "已连接直播间 6",
};

beforeEach(() => {
  eventMock.listen.mockImplementation(
    async (_name: string, handler: (event: { payload: unknown }) => void) => {
      eventMock.handler = handler;
      return eventMock.unlisten;
    },
  );
});

afterEach(() => {
  clearMocks();
  eventMock.handler = undefined;
  vi.clearAllMocks();
});

test("installs the session listener before requesting the snapshot", async () => {
  const order: string[] = [];
  eventMock.listen.mockImplementation(async (name, handler) => {
    order.push(`listen:${name}`);
    eventMock.handler = handler;
    return eventMock.unlisten;
  });
  mockIPC((command) => {
    order.push(`invoke:${command}`);
    return [];
  });

  renderHook(() => useRoomSessions({ enabled: true }));

  await waitFor(() =>
    expect(order).toEqual([
      "listen:bilibili-room-sessions",
      "invoke:get_bilibili_room_sessions",
    ]),
  );
});

test("ignores a late mount snapshot after any session event", async () => {
  let resolveSnapshot: ((sessions: unknown) => void) | undefined;
  const snapshot = new Promise<unknown>((resolve) => {
    resolveSnapshot = resolve;
  });
  mockIPC(() => snapshot);
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  act(() => eventMock.handler?.({ payload: [CONNECTED_SESSION] }));
  expect(result.current.sessions).toEqual([CONNECTED_SESSION]);

  await act(async () => {
    resolveSnapshot?.([]);
    await snapshot;
  });
  expect(result.current.sessions).toEqual([CONNECTED_SESSION]);
});

test("ignores a late snapshot failure after a session event", async () => {
  let rejectSnapshot: ((error: unknown) => void) | undefined;
  const snapshot = new Promise<unknown>((_resolve, reject) => {
    rejectSnapshot = reject;
  });
  mockIPC(() => snapshot);
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  act(() => eventMock.handler?.({ payload: [CONNECTED_SESSION] }));
  await act(async () => {
    rejectSnapshot?.(new Error("late snapshot failed"));
    await snapshot.catch(() => undefined);
  });

  expect(result.current.sessions).toEqual([CONNECTED_SESSION]);
  expect(result.current.snapshotError).toBe("");
});

test("keeps the previous sessions when an event payload is invalid", async () => {
  mockIPC(() => [CONNECTED_SESSION]);
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));
  await waitFor(() => expect(result.current.sessions).toEqual([CONNECTED_SESSION]));

  act(() => eventMock.handler?.({ payload: { sessions: [] } }));

  expect(result.current.sessions).toEqual([CONNECTED_SESSION]);
  expect(result.current.snapshotError).not.toBe("");
});

test("an invalid event still makes the late mount snapshot ignorable", async () => {
  let resolveSnapshot: ((sessions: unknown) => void) | undefined;
  const snapshot = new Promise<unknown>((resolve) => {
    resolveSnapshot = resolve;
  });
  mockIPC(() => snapshot);
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  act(() => eventMock.handler?.({ payload: "invalid" }));
  expect(result.current.isInitialReady).toBe(true);
  await act(async () => {
    resolveSnapshot?.([CONNECTED_SESSION]);
    await snapshot;
  });

  expect(result.current.sessions).toEqual([]);
  expect(result.current.snapshotError).not.toBe("");
});

test("normalizes mixed payloads and de-duplicates session ids", async () => {
  mockIPC(() => [
    CONNECTED_SESSION,
    { ...CONNECTED_SESSION, message: "duplicate" },
    { sessionId: "", requestedRoomId: 7, status: "connected", message: "bad" },
    {
      sessionId: "room-session-2",
      requestedRoomId: 7,
      roomId: 0,
      status: "connected",
      message: "bad room",
    },
  ]);
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));

  await waitFor(() => expect(result.current.sessions).toEqual([CONNECTED_SESSION]));
});

test("cleans up the listener on unmount", async () => {
  const disposers: Array<ReturnType<typeof vi.fn>> = [];
  eventMock.listen.mockImplementation(async (_name, handler) => {
    eventMock.handler = handler;
    const dispose = vi.fn();
    disposers.push(dispose);
    return dispose;
  });
  mockIPC(() => []);
  const { unmount } = renderHook(() => useRoomSessions({ enabled: true }));
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  unmount();

  expect(disposers.length).toBeGreaterThan(0);
  expect(disposers.every((dispose) => dispose.mock.calls.length === 1)).toBe(
    true,
  );
});

test("does not install a listener or request a snapshot when disabled", () => {
  mockIPC(() => {
    throw new Error("must not invoke");
  });

  const { result } = renderHook(() => useRoomSessions({ enabled: false }));

  expect(eventMock.listen).not.toHaveBeenCalled();
  expect(result.current).toEqual({
    sessions: [],
    snapshotError: "",
    isInitialReady: false,
  });
});

test("becomes ready after the initial snapshot completes", async () => {
  mockIPC(() => []);
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));

  await waitFor(() => expect(result.current.isInitialReady).toBe(true));
});

test("becomes ready after the initial snapshot fails", async () => {
  mockIPC(() => {
    throw new Error("snapshot unavailable");
  });
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));

  await waitFor(() => expect(result.current.isInitialReady).toBe(true));
  expect(result.current.snapshotError).toContain("snapshot unavailable");
});

test("becomes ready after an invalid initial snapshot", async () => {
  mockIPC(() => ({ sessions: [] }));
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));

  await waitFor(() => expect(result.current.isInitialReady).toBe(true));
  expect(result.current.snapshotError).toBe("房间会话状态格式无效");
});

test("becomes ready as soon as the first session event arrives", async () => {
  let resolveSnapshot: ((sessions: unknown) => void) | undefined;
  const snapshot = new Promise<unknown>((resolve) => {
    resolveSnapshot = resolve;
  });
  mockIPC(() => snapshot);
  const { result } = renderHook(() => useRoomSessions({ enabled: true }));
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  act(() => eventMock.handler?.({ payload: [CONNECTED_SESSION] }));

  expect(result.current.isInitialReady).toBe(true);
  await act(async () => {
    resolveSnapshot?.([]);
    await snapshot;
  });
});
