import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../../types/config";
import type { RoomSessionSnapshot } from "../../types/roomSession";
import type { AppConfigUpdater } from "./useControlConfig";
import { useRoomConnections } from "./useRoomConnections";

function configWithSixSavedRooms(): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    savedRooms: Array.from({ length: 6 }, (_, index) => ({
      id: `room-${index + 1}`,
      roomId: String(index + 1),
      displayName: `房间 ${index + 1}`,
      groupId: "uncategorized",
      updatedAt: "2026-08-27T00:00:00.000Z",
    })),
  };
}

function connectedSession(
  sessionId: string,
  roomId: number,
): RoomSessionSnapshot {
  return {
    sessionId,
    requestedRoomId: roomId,
    roomId,
    status: "connected",
    message: `已连接直播间 ${roomId}`,
  };
}

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
});

test("rejects a sixth selected saved room through the queued updater", async () => {
  const base = configWithSixSavedRooms();
  const config = {
    ...base,
    selectedSavedRoomIds: base.savedRooms.slice(0, 5).map((room) => room.id),
  };
  const saveConfig = vi.fn(async (updater: AppConfigUpdater) => {
    updater(config);
  });
  const { result } = renderHook(() =>
    useRoomConnections({ config, saveConfig, sessions: [] }),
  );

  await act(() => result.current.setRoomSelected("room-6", true));

  expect(result.current.selectionError).toBe("最多选择 5 个直播间");
  expect(saveConfig).toHaveBeenCalledOnce();
});

test("selection persists without connecting and reports save failure", async () => {
  mockIPC(() => {
    throw new Error("must not connect");
  });
  const config = configWithSixSavedRooms();
  const saveConfig = vi.fn(async (_updater: AppConfigUpdater) => {
    throw new Error("write failed");
  });
  const { result } = renderHook(() =>
    useRoomConnections({ config, saveConfig, sessions: [] }),
  );

  await act(() => result.current.setRoomSelected("room-1", true));

  expect(saveConfig).toHaveBeenCalledOnce();
  const updater = saveConfig.mock.calls[0][0];
  expect(updater(config).selectedSavedRoomIds).toEqual(["room-1"]);
  expect(result.current.selectionError).toContain("write failed");
});

test("connect selected keeps partial success and does not persist a draft room", async () => {
  const config = {
    ...configWithSixSavedRooms(),
    selectedSavedRoomIds: ["room-1", "room-2"],
  };
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    const requestedRoomId =
      (payload as { requestedRoomId?: number }).requestedRoomId;
    if (command === "connect_bilibili_room" && requestedRoomId === 2) {
      throw new Error("房间 2 未开播");
    }
    return connectedSession(`s-${requestedRoomId}`, requestedRoomId ?? 1);
  });
  const saveConfig = vi.fn(async () => undefined);
  const { result } = renderHook(() =>
    useRoomConnections({ config, saveConfig, sessions: [] }),
  );

  await act(() => result.current.connectSelectedRooms());
  expect(calls.filter((call) => call.command === "connect_bilibili_room"))
    .toEqual(expect.arrayContaining([
      { command: "connect_bilibili_room", payload: { requestedRoomId: 1 } },
      { command: "connect_bilibili_room", payload: { requestedRoomId: 2 } },
    ]));
  expect(result.current.commandErrors["room-2"]).toContain("未开播");

  await act(() => result.current.connectDraftRoom("9"));
  expect(calls).toContainEqual({
    command: "connect_bilibili_room",
    payload: { requestedRoomId: 9 },
  });
  expect(saveConfig).not.toHaveBeenCalled();
});

test("connect selected reports invalid saved rooms without invoking them", async () => {
  const base = configWithSixSavedRooms();
  const config = {
    ...base,
    savedRooms: [
      {
        ...base.savedRooms[0],
        roomId: "bad-room",
      },
      ...base.savedRooms.slice(1),
    ],
    selectedSavedRoomIds: ["room-1", "room-2"],
  };
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    return null;
  });
  const { result } = renderHook(() =>
    useRoomConnections({
      config,
      saveConfig: vi.fn(async () => undefined),
      sessions: [],
    }),
  );

  await act(() => result.current.connectSelectedRooms());

  expect(calls).toEqual([
    { command: "connect_bilibili_room", payload: { requestedRoomId: 2 } },
  ]);
  expect(result.current.commandErrors["room-1"]).toBe(
    "请输入有效的直播间房间号",
  );
  expect(result.current.commandErrors["room-2"]).toBeUndefined();
});

test("skips selected rooms that already have an active matching session", async () => {
  const config = {
    ...configWithSixSavedRooms(),
    selectedSavedRoomIds: ["room-1", "room-2"],
  };
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    return null;
  });
  const { result } = renderHook(() =>
    useRoomConnections({
      config,
      saveConfig: vi.fn(async () => undefined),
      sessions: [connectedSession("s-1", 1)],
    }),
  );

  await act(() => result.current.connectSelectedRooms());

  expect(calls).toEqual([
    { command: "connect_bilibili_room", payload: { requestedRoomId: 2 } },
  ]);
});

test("concurrent selections enforce the cap inside the queued updater", async () => {
  const base = configWithSixSavedRooms();
  let currentConfig: AppConfig = {
    ...base,
    selectedSavedRoomIds: base.savedRooms.slice(0, 4).map((room) => room.id),
  };
  let continueFirstSave: (() => void) | undefined;
  const firstSaveGate = new Promise<void>((resolve) => {
    continueFirstSave = resolve;
  });
  let saveCount = 0;
  let queue = Promise.resolve();
  const saveConfig = vi.fn((updater: AppConfigUpdater) => {
    const operation = queue.then(async () => {
      saveCount += 1;
      if (saveCount === 1) {
        await firstSaveGate;
      }
      currentConfig = updater(currentConfig);
    });
    queue = operation.catch(() => undefined);
    return operation;
  });
  const { result } = renderHook(() =>
    useRoomConnections({ config: currentConfig, saveConfig, sessions: [] }),
  );

  await act(async () => {
    const firstSelection = result.current.setRoomSelected("room-5", true);
    const secondSelection = result.current.setRoomSelected("room-6", true);
    continueFirstSave?.();
    await Promise.allSettled([firstSelection, secondSelection]);
  });

  expect(saveConfig).toHaveBeenCalledTimes(2);
  expect(currentConfig.selectedSavedRoomIds).toEqual([
    "room-1",
    "room-2",
    "room-3",
    "room-4",
    "room-5",
  ]);
  expect(result.current.selectionError).toBe("最多选择 5 个直播间");
});

test("retry disconnects the terminal session before reconnecting its requested room", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    return null;
  });
  const terminal: RoomSessionSnapshot = {
    sessionId: "s-6",
    requestedRoomId: 6,
    status: "not_live",
    message: "未开播",
  };
  const { result } = renderHook(() =>
    useRoomConnections({
      config: DEFAULT_APP_CONFIG,
      saveConfig: vi.fn(async () => undefined),
      sessions: [terminal],
    }),
  );

  await act(() => result.current.retrySession(terminal));

  expect(calls).toEqual([
    { command: "disconnect_bilibili_room", payload: { sessionId: "s-6" } },
    { command: "connect_bilibili_room", payload: { requestedRoomId: 6 } },
  ]);
});

test("uses the binding async disconnect command payloads", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    return [];
  });
  const { result } = renderHook(() =>
    useRoomConnections({
      config: DEFAULT_APP_CONFIG,
      saveConfig: vi.fn(async () => undefined),
      sessions: [],
    }),
  );

  await act(() => result.current.disconnectSession("s-1"));
  await act(() => result.current.disconnectAllRooms());

  expect(calls).toEqual([
    { command: "disconnect_bilibili_room", payload: { sessionId: "s-1" } },
    { command: "disconnect_all_bilibili_rooms", payload: {} },
  ]);
});

test("temporary sessions match neither requested nor real saved room ids", () => {
  const config = configWithSixSavedRooms();
  const sessions = [
    connectedSession("saved-requested", 1),
    { ...connectedSession("saved-real", 70), roomId: 2 },
    connectedSession("temporary", 9),
  ];

  const { result } = renderHook(() =>
    useRoomConnections({
      config,
      saveConfig: vi.fn(async () => undefined),
      sessions,
    }),
  );

  expect(result.current.temporarySessions).toEqual([sessions[2]]);
});
