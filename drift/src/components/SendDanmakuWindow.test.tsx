import type { InvokeArgs } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { SendDanmakuStatus } from "../types/danmaku";
import type { RoomSessionSnapshot } from "../types/roomSession";
import { SendDanmakuWindow } from "./SendDanmakuWindow";

const eventMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();

  return {
    emit(event: string, payload: unknown) {
      handlers.get(event)?.({ payload });
    },
    handlers,
    listen: vi.fn(
      async (
        event: string,
        callback: (event: { payload: unknown }) => void,
      ) => {
        handlers.set(event, callback);
        return vi.fn(() => {
          if (handlers.get(event) === callback) {
            handlers.delete(event);
          }
        });
      },
    ),
    reset() {
      handlers.clear();
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: eventMock.listen,
}));

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
  eventMock.reset();
  localStorage.clear();
  delete document.documentElement.dataset.driftTheme;
  document.documentElement.style.colorScheme = "";
});

function roomSession(
  roomId: number,
  anchorName: string,
  overrides: Partial<RoomSessionSnapshot> = {},
): RoomSessionSnapshot {
  return {
    sessionId: `room-session-${roomId}`,
    requestedRoomId: roomId,
    roomId,
    anchorName,
    fanMedalName: `${anchorName}粉丝牌`,
    status: "connected",
    message: "已连接",
    liveStatus: 1,
    ...overrides,
  };
}

function statusFor(
  roomId: number | null,
  anchorName?: string,
  overrides: Partial<SendDanmakuStatus> = {},
): SendDanmakuStatus {
  return {
    anchorName,
    canSend: roomId !== null,
    cooldownMs: 0,
    reason: roomId === null ? "请选择发送目标" : "可以发送",
    roomId: roomId ?? undefined,
    status: roomId === null ? null : "connected",
    ...overrides,
  };
}

function configSnapshot(theme: "dark" | "light", lastRoomId?: string) {
  return {
    appearance: { theme },
    send: lastRoomId ? { lastRoomId } : {},
  };
}

function payloadRecord(payload: InvokeArgs | undefined): Record<string, unknown> {
  return payload && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function payloadRoomId(payload: InvokeArgs | undefined) {
  const roomId = payloadRecord(payload).roomId;
  return typeof roomId === "number" ? roomId : null;
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

test("restores a connected last target, persists changes, sends explicit roomId, and still closes", async () => {
  const calls: Array<{ command: string; payload: Record<string, unknown> }> =
    [];
  const sessions = [roomSession(6, "主播甲"), roomSession(7, "主播乙")];
  mockIPC((command, payload) => {
    calls.push({ command, payload: payloadRecord(payload) });
    if (command === "load_app_config") return configSnapshot("light", "7");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      const room = sessions.find((item) => item.roomId === roomId);
      return statusFor(roomId, room?.anchorName);
    }
    if (command === "set_last_send_room_id") {
      const roomId = payloadRoomId(payload);
      return configSnapshot("light", roomId === null ? undefined : String(roomId));
    }
    if (command === "send_bilibili_danmaku") {
      return { code: 0, cooldownMs: 3000, message: "发送成功" };
    }
    if (command === "hide_send_danmaku_window") return null;
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("7"));
  expect(await screen.findByText("准备发送")).toBeVisible();

  await user.selectOptions(select, "6");
  await waitFor(() =>
    expect(calls).toContainEqual({
      command: "set_last_send_room_id",
      payload: { roomId: 6 },
    }),
  );
  expect(select).toHaveValue("6");
  expect(
    calls.filter((call) => call.command === "send_bilibili_danmaku"),
  ).toHaveLength(0);

  const input = screen.getByRole("textbox", { name: "弹幕内容" });
  fireEvent.change(input, { target: { value: " 你好 " } });
  await user.click(screen.getByRole("button", { name: "发送" }));

  await waitFor(() => expect(input).toHaveValue(""));
  expect(screen.getByRole("status")).toHaveTextContent("发送成功");
  expect(calls).toContainEqual({
    command: "send_bilibili_danmaku",
    payload: { roomId: 6, text: "你好" },
  });

  await user.click(screen.getByRole("button", { name: "关闭发送窗口" }));
  expect(calls).toContainEqual({
    command: "hide_send_danmaku_window",
    payload: {},
  });
});

test("refreshes connected room targets when the send window opens", async () => {
  let sessions: RoomSessionSnapshot[] = [];
  let sessionSnapshotCalls = 0;
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light");
    if (command === "get_bilibili_room_sessions") {
      sessionSnapshotCalls += 1;
      return sessions;
    }
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      const room = sessions.find((item) => item.roomId === roomId);
      return statusFor(roomId, room?.anchorName);
    }
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(sessionSnapshotCalls).toBe(1));
  expect(screen.queryByRole("option", { name: "主播甲 · 6" })).toBeNull();
  await waitFor(() =>
    expect(eventMock.handlers.has("send-window-opened")).toBe(true),
  );

  sessions = [roomSession(6, "主播甲")];
  eventMock.emit("send-window-opened", undefined);

  await waitFor(() =>
    expect(screen.getByRole("option", { name: "主播甲 · 6" })).toBeVisible(),
  );
  expect(sessionSnapshotCalls).toBe(2);
  expect(select).toHaveValue("");
  await user.selectOptions(select, "6");
  expect(select).toHaveValue("6");
});

test("clears only the removed target selection without fallback or input loss", async () => {
  let sessions = [roomSession(6, "主播甲"), roomSession(7, "主播乙")];
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "6");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      const room = sessions.find((item) => item.roomId === roomId);
      return room ? statusFor(roomId, room.anchorName) : statusFor(null);
    }
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("6"));

  const input = screen.getByRole("textbox", { name: "弹幕内容" });
  await user.type(input, "保留内容");

  sessions = [roomSession(7, "主播乙")];
  eventMock.emit("bilibili-room-sessions", sessions);

  await waitFor(() => expect(select).toHaveValue(""));
  expect(screen.getByRole("option", { name: "主播乙 · 7" })).toBeVisible();
  expect(input).toHaveValue("保留内容");
  expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("请选择发送目标");
});

test("rolls back the target selection and shows danger when persistence fails", async () => {
  const sessions = [roomSession(6, "主播甲"), roomSession(7, "主播乙")];
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("dark", "7");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      const room = sessions.find((item) => item.roomId === roomId);
      return room ? statusFor(roomId, room.anchorName) : statusFor(null);
    }
    if (command === "set_last_send_room_id") {
      if (payloadRoomId(payload) === 6) {
        throw new Error("保存失败");
      }
      const roomId = payloadRoomId(payload);
      return configSnapshot("dark", roomId === null ? undefined : String(roomId));
    }
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("7"));

  await user.selectOptions(select, "6");

  await waitFor(() => expect(select).toHaveValue("7"));
  expect(await screen.findByText("Error: 保存失败")).toBeVisible();
  expect(screen.getByRole("status")).toHaveAttribute("data-tone", "danger");
});

test("keeps the latest selection when an earlier persistence fails later", async () => {
  const earlierWrite = deferred<ReturnType<typeof configSnapshot>>();
  const laterWrite = deferred<ReturnType<typeof configSnapshot>>();
  const sessions = [
    roomSession(6, "主播甲"),
    roomSession(7, "主播乙"),
    roomSession(8, "主播丙"),
  ];
  let persistedRoomId = 8;
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "8");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      const room = sessions.find((item) => item.roomId === roomId);
      return statusFor(roomId, room?.anchorName);
    }
    if (command === "set_last_send_room_id") {
      const roomId = payloadRoomId(payload);
      const write = roomId === 6 ? earlierWrite : laterWrite;
      return write.promise.then((config) => {
        persistedRoomId = roomId ?? persistedRoomId;
        return config;
      });
    }
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("8"));

  await user.selectOptions(select, "6");
  await user.selectOptions(select, "7");
  laterWrite.resolve(configSnapshot("light", "7"));
  earlierWrite.reject(new Error("较早选择保存失败"));

  await waitFor(() => expect(persistedRoomId).toBe(7));
  await waitFor(() => expect(select).toHaveValue("7"));
  expect(screen.getByRole("status")).not.toHaveTextContent("较早选择保存失败");
});

test("restores the last persisted target when rapid queued selections both fail", async () => {
  const earlierWrite = deferred<ReturnType<typeof configSnapshot>>();
  const laterWrite = deferred<ReturnType<typeof configSnapshot>>();
  const sessions = [
    roomSession(6, "主播甲"),
    roomSession(7, "主播乙"),
    roomSession(8, "主播丙"),
  ];
  let persistedRoomId = 8;
  const statusRoomIds: Array<number | null> = [];
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "8");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      statusRoomIds.push(roomId);
      const room = sessions.find((item) => item.roomId === roomId);
      return statusFor(roomId, room?.anchorName);
    }
    if (command === "set_last_send_room_id") {
      const roomId = payloadRoomId(payload);
      const write = roomId === 6 ? earlierWrite : laterWrite;
      return write.promise.then((config) => {
        persistedRoomId = roomId ?? persistedRoomId;
        return config;
      });
    }
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("8"));

  await user.selectOptions(select, "6");
  await user.selectOptions(select, "7");
  earlierWrite.reject(new Error("较早选择保存失败"));
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "发送目标直播间" }),
    ).toHaveValue("7"),
  );
  laterWrite.reject(new Error("最新选择保存失败"));

  await waitFor(() => expect(persistedRoomId).toBe(8));
  await waitFor(() => expect(select).toHaveValue("8"));
  await waitFor(() =>
    expect(statusRoomIds[statusRoomIds.length - 1]).toBe(8),
  );
  expect(await screen.findByText("Error: 最新选择保存失败")).toBeVisible();
});

test("ignores an old authority target while a queued target write is pending", async () => {
  const pendingWrite = deferred<ReturnType<typeof configSnapshot>>();
  const delayedAuthority = deferred<ReturnType<typeof configSnapshot>>();
  const sessions = [roomSession(6, "主播甲"), roomSession(8, "主播丙")];
  const statusRoomIds: Array<number | null> = [];
  let loadCount = 0;
  let persistedRoomId = 8;
  mockIPC((command, payload) => {
    if (command === "load_app_config") {
      loadCount += 1;
      return loadCount === 1
        ? configSnapshot("light", "8")
        : delayedAuthority.promise;
    }
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      statusRoomIds.push(roomId);
      const room = sessions.find((item) => item.roomId === roomId);
      return statusFor(roomId, room?.anchorName);
    }
    if (command === "set_last_send_room_id") {
      return pendingWrite.promise.then((config) => {
        persistedRoomId = payloadRoomId(payload) ?? persistedRoomId;
        return config;
      });
    }
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("8"));
  await waitFor(() =>
    expect(eventMock.handlers.has("send-window-opened")).toBe(true),
  );

  await user.selectOptions(select, "6");
  eventMock.emit("send-window-opened", undefined);

  await waitFor(() => expect(loadCount).toBe(2));
  pendingWrite.resolve(configSnapshot("light", "6"));
  await waitFor(() => expect(persistedRoomId).toBe(6));
  await waitFor(() => expect(select).toHaveValue("6"));
  await waitFor(() =>
    expect(statusRoomIds[statusRoomIds.length - 1]).toBe(6),
  );

  delayedAuthority.resolve(configSnapshot("dark", "8"));
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );
  expect(select).toHaveValue("6");
  expect(statusRoomIds[statusRoomIds.length - 1]).toBe(6);
});

test("serializes target writes so out-of-order completion keeps the latest persisted target", async () => {
  const earlierWrite = deferred<ReturnType<typeof configSnapshot>>();
  const laterWrite = deferred<ReturnType<typeof configSnapshot>>();
  const sessions = [
    roomSession(6, "主播甲"),
    roomSession(7, "主播乙"),
    roomSession(8, "主播丙"),
  ];
  let persistedRoomId = 8;
  const completedWrites: number[] = [];
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "8");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      const room = sessions.find((item) => item.roomId === roomId);
      return statusFor(roomId, room?.anchorName);
    }
    if (command === "set_last_send_room_id") {
      const roomId = payloadRoomId(payload);
      const write = roomId === 6 ? earlierWrite : laterWrite;
      return write.promise.then((config) => {
        persistedRoomId = roomId ?? persistedRoomId;
        if (roomId !== null) completedWrites.push(roomId);
        return config;
      });
    }
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("8"));

  await user.selectOptions(select, "6");
  await user.selectOptions(select, "7");
  laterWrite.resolve(configSnapshot("light", "7"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  earlierWrite.resolve(configSnapshot("light", "6"));

  await waitFor(() => expect(completedWrites).toHaveLength(2));
  expect(completedWrites).toEqual([6, 7]);
  expect(persistedRoomId).toBe(7);
  expect(select).toHaveValue("7");
});

test("keeps failed text and exposes the failure in the status rail", async () => {
  const sessions = [roomSession(123456, "测试主播")];
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "123456");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      return statusFor(roomId, "测试主播");
    }
    if (command === "send_bilibili_danmaku") throw new Error("发送失败");
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  await screen.findByText("准备发送");
  const input = screen.getByRole("textbox", { name: "弹幕内容" });
  fireEvent.change(input, { target: { value: "保留内容" } });
  await user.click(screen.getByRole("button", { name: "发送" }));

  expect(await screen.findByText("Error: 发送失败")).toBeVisible();
  expect(input).toHaveValue("保留内容");
  expect(screen.getByRole("status")).toHaveAttribute("data-tone", "danger");
});

test("keeps Enter, Escape and manual drag commands with explicit room payloads", async () => {
  const calls: Array<{ command: string; payload: Record<string, unknown> }> =
    [];
  const sessions = [roomSession(123456, "测试主播")];
  mockIPC((command, payload) => {
    calls.push({ command, payload: payloadRecord(payload) });
    if (command === "load_app_config") return configSnapshot("light", "123456");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      return statusFor(roomId, "测试主播");
    }
    if (command === "send_bilibili_danmaku") {
      return { code: 0, cooldownMs: 3000, message: "发送成功" };
    }
    return null;
  });
  render(<SendDanmakuWindow />);

  await screen.findByText("准备发送");
  const input = screen.getByRole("textbox", { name: "弹幕内容" });
  fireEvent.change(input, { target: { value: "Enter 发送" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(calls).toContainEqual({
      command: "send_bilibili_danmaku",
      payload: { roomId: 123456, text: "Enter 发送" },
    }),
  );

  fireEvent.mouseDown(screen.getByLabelText("拖动发送窗口"), {
    button: 0,
    screenX: 10,
    screenY: 20,
  });
  await waitFor(() =>
    expect(calls).toContainEqual({
      command: "begin_send_danmaku_window_drag",
      payload: { screenX: 10, screenY: 20 },
    }),
  );
  fireEvent.mouseUp(window);
  await waitFor(() =>
    expect(calls).toContainEqual({
      command: "end_send_danmaku_window_drag",
      payload: {},
    }),
  );

  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() =>
    expect(calls).toContainEqual({
      command: "hide_send_danmaku_window",
      payload: {},
    }),
  );
});

test.each(["light", "dark"] as const)(
  "applies the initial %s authority theme snapshot",
  async (theme) => {
    const sessions = [roomSession(123456, "测试主播")];
    mockIPC((command, payload) => {
      if (command === "load_app_config") return configSnapshot(theme, "123456");
      if (command === "get_bilibili_room_sessions") return sessions;
      if (command === "get_send_danmaku_status") {
        const roomId = payloadRoomId(payload);
        return statusFor(roomId, "测试主播");
      }
      return null;
    });

    render(<SendDanmakuWindow />);

    await waitFor(() =>
      expect(document.documentElement.dataset.driftTheme).toBe(theme),
    );
    expect(localStorage.getItem("drift-ui-theme")).toBe(theme);
  },
);

test("ignores app-config-changed theme events while the window is open", async () => {
  const sessions = [roomSession(123456, "测试主播")];
  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "123456");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      return statusFor(roomId, "测试主播");
    }
    return null;
  });

  render(<SendDanmakuWindow />);
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("light"),
  );
  expect(eventMock.handlers.has("app-config-changed")).toBe(false);

  eventMock.emit("app-config-changed", configSnapshot("dark", "123456"));

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.documentElement.dataset.driftTheme).toBe("light");
  expect(localStorage.getItem("drift-ui-theme")).toBe("light");
});

test("refreshes authority theme on send-opened but not focus, pageshow or visibility", async () => {
  let loadCount = 0;
  let statusLoadCount = 0;
  const sessions = [roomSession(123456, "测试主播")];
  mockIPC((command, payload) => {
    if (command === "load_app_config") {
      loadCount += 1;
      return configSnapshot(loadCount === 1 ? "light" : "dark", "123456");
    }
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      statusLoadCount += 1;
      const roomId = payloadRoomId(payload);
      return statusFor(roomId, "测试主播");
    }
    return null;
  });

  render(<SendDanmakuWindow />);
  await waitFor(() => expect(loadCount).toBe(1));
  await waitFor(() => expect(statusLoadCount).toBeGreaterThanOrEqual(1));
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("light"),
  );

  const statusAfterMount = statusLoadCount;
  eventMock.emit("send-window-opened", null);
  await waitFor(() => expect(loadCount).toBe(2));
  await waitFor(() => expect(statusLoadCount).toBeGreaterThan(statusAfterMount));
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );

  const statusAfterOpened = statusLoadCount;
  fireEvent.focus(window);
  await waitFor(() => expect(statusLoadCount).toBeGreaterThan(statusAfterOpened));
  expect(loadCount).toBe(2);

  const statusAfterFocus = statusLoadCount;
  fireEvent(window, new Event("pageshow"));
  await waitFor(() => expect(statusLoadCount).toBeGreaterThan(statusAfterFocus));
  expect(loadCount).toBe(2);

  const statusAfterPageshow = statusLoadCount;
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() =>
    expect(statusLoadCount).toBeGreaterThan(statusAfterPageshow),
  );
  expect(loadCount).toBe(2);
});

test("ignores a late null status refresh when send-opened restores a target", async () => {
  const delayedNull = deferred<SendDanmakuStatus>();
  const delayedRestored = deferred<SendDanmakuStatus>();
  const sessions = [roomSession(6, "主播甲")];
  let phase: "mount" | "opened" = "mount";

  mockIPC((command, payload) => {
    if (command === "load_app_config") {
      return phase === "mount"
        ? configSnapshot("light")
        : configSnapshot("light", "6");
    }
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      if (phase === "mount") {
        return statusFor(null);
      }
      if (roomId === null) {
        return delayedNull.promise;
      }
      return delayedRestored.promise;
    }
    return null;
  });

  render(<SendDanmakuWindow />);
  await screen.findByText("请选择发送目标");

  phase = "opened";
  eventMock.emit("send-window-opened", null);

  delayedRestored.resolve(statusFor(6, "主播甲"));
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "发送目标直播间" }),
    ).toHaveValue("6"),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("准备发送"),
  );

  delayedNull.resolve(statusFor(null, undefined, { reason: "请选择发送目标" }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(screen.getByRole("combobox", { name: "发送目标直播间" })).toHaveValue(
    "6",
  );
  expect(screen.getByRole("status")).toHaveTextContent("准备发送");
});

test("ignores a late status response for the previous target after the user selects a new one", async () => {
  const delayedOldTarget = deferred<SendDanmakuStatus>();
  const delayedNewTarget = deferred<SendDanmakuStatus>();
  const sessions = [roomSession(6, "主播甲"), roomSession(7, "主播乙")];
  let firstTargetRequest = true;

  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "7");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      if (roomId === 7 && firstTargetRequest) {
        firstTargetRequest = false;
        return delayedOldTarget.promise;
      }
      if (roomId === 6) {
        return delayedNewTarget.promise;
      }
      const room = sessions.find((item) => item.roomId === roomId);
      return statusFor(roomId, room?.anchorName);
    }
    if (command === "set_last_send_room_id") return null;
    return null;
  });

  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  const select = await screen.findByRole("combobox", {
    name: "发送目标直播间",
  });
  await waitFor(() => expect(select).toHaveValue("7"));

  await user.selectOptions(select, "6");
  delayedNewTarget.resolve(statusFor(6, "主播甲"));
  await waitFor(() => expect(select).toHaveValue("6"));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("准备发送"),
  );

  delayedOldTarget.resolve(
    statusFor(7, "主播乙", { canSend: false, reason: "旧目标不可发送" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(select).toHaveValue("6");
  expect(screen.getByRole("status")).toHaveTextContent("准备发送");
});

test("ignores a late status response after send success feedback is shown", async () => {
  const delayedFocusStatus = deferred<SendDanmakuStatus>();
  const sessions = [roomSession(123456, "测试主播")];
  let immediateReady = true;

  mockIPC((command, payload) => {
    if (command === "load_app_config") return configSnapshot("light", "123456");
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      if (roomId === 123456 && immediateReady) {
        immediateReady = false;
        return statusFor(roomId, "测试主播");
      }
      return delayedFocusStatus.promise;
    }
    if (command === "send_bilibili_danmaku") {
      return { code: 0, cooldownMs: 3000, message: "发送成功" };
    }
    return null;
  });

  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  await screen.findByText("准备发送");
  fireEvent.focus(window);
  const input = screen.getByRole("textbox", { name: "弹幕内容" });
  fireEvent.change(input, { target: { value: "发送成功后保留反馈" } });
  await user.click(screen.getByRole("button", { name: "发送" }));

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("发送成功"),
  );
  delayedFocusStatus.resolve(
    statusFor(123456, "测试主播", { canSend: false, reason: "迟到状态" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(screen.getByRole("status")).toHaveTextContent("发送成功");
  expect(screen.getByRole("status")).toHaveAttribute("data-tone", "success");
});

test("keeps the newer send-opened authority theme when the mount load resolves late", async () => {
  const resolveConfigs: Array<
    (config: ReturnType<typeof configSnapshot>) => void
  > = [];
  const sessions = [roomSession(123456, "测试主播")];
  mockIPC((command, payload) => {
    if (command === "load_app_config") {
      return new Promise<ReturnType<typeof configSnapshot>>((resolve) => {
        resolveConfigs.push(resolve);
      });
    }
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      return statusFor(roomId, "测试主播");
    }
    return null;
  });

  render(<SendDanmakuWindow />);
  await waitFor(() => expect(resolveConfigs).toHaveLength(1));

  eventMock.emit("send-window-opened", null);
  await waitFor(() => expect(resolveConfigs).toHaveLength(2));

  resolveConfigs[1]?.(configSnapshot("dark", "123456"));
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );

  resolveConfigs[0]?.(configSnapshot("light", "123456"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.documentElement.dataset.driftTheme).toBe("dark");
  expect(localStorage.getItem("drift-ui-theme")).toBe("dark");
});

test("cleans up authority refresh fallbacks on unmount", async () => {
  let loadCount = 0;
  const sessions = [roomSession(123456, "测试主播")];
  mockIPC((command, payload) => {
    if (command === "load_app_config") {
      loadCount += 1;
      return configSnapshot("light", "123456");
    }
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      return statusFor(roomId, "测试主播");
    }
    return null;
  });

  const { unmount } = render(<SendDanmakuWindow />);
  await waitFor(() => expect(loadCount).toBe(1));
  unmount();
  fireEvent.focus(window);
  fireEvent(window, new Event("pageshow"));
  fireEvent(document, new Event("visibilitychange"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(loadCount).toBe(1);
  expect(document.documentElement.dataset.driftTheme).toBe("light");
});

test("ignores a late authority snapshot after the window unmounts", async () => {
  document.documentElement.dataset.driftTheme = "dark";
  document.documentElement.style.colorScheme = "dark";
  localStorage.setItem("drift-ui-theme", "dark");

  let resolveConfig:
    | ((config: ReturnType<typeof configSnapshot>) => void)
    | undefined;
  let loadCount = 0;
  const sessions = [roomSession(123456, "测试主播")];
  const configPromise = new Promise<ReturnType<typeof configSnapshot>>(
    (resolve) => {
      resolveConfig = resolve;
    },
  );
  mockIPC((command, payload) => {
    if (command === "load_app_config") {
      loadCount += 1;
      return configPromise;
    }
    if (command === "get_bilibili_room_sessions") return sessions;
    if (command === "get_send_danmaku_status") {
      const roomId = payloadRoomId(payload);
      return statusFor(roomId, "测试主播");
    }
    return null;
  });

  const { unmount } = render(<SendDanmakuWindow />);
  await waitFor(() => expect(loadCount).toBe(1));
  expect(resolveConfig).toBeDefined();
  unmount();

  resolveConfig?.(configSnapshot("light", "123456"));
  await configPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.documentElement.dataset.driftTheme).toBe("dark");
  expect(localStorage.getItem("drift-ui-theme")).toBe("dark");
});
