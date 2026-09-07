import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "./types/config";
import type { DanmakuRoomBatch, RoomSessionSnapshot } from "./types/roomSession";
import App from "./App";

const appThemeMock = vi.hoisted(() => ({ setTheme: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/app", () => ({ setTheme: appThemeMock.setTheme }));

const windowMock = vi.hoisted(() => ({ label: "main" }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: windowMock.label,
    setSizeConstraints: vi.fn(async () => undefined),
    startDragging: vi.fn(async () => undefined),
    startResizeDragging: vi.fn(async () => undefined),
  }),
}));

const eventMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();
  return {
    emit: vi.fn(async (event: string, payload?: unknown) => {
      handlers.get(event)?.({ payload });
    }),
    handlers,
    listen: vi.fn(
      async (event: string, callback: (event: { payload: unknown }) => void) => {
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
  emit: eventMock.emit,
  listen: eventMock.listen,
}));

vi.mock("./styles/tailwind.css", () => ({}));
vi.mock("./App.css", () => ({}));

vi.mock("./components/OverlayEditWorkspace", () => ({
  OverlayEditWorkspace: () => <div data-testid="workspace" />,
}));

vi.mock("./components/control/ControlPanel", () => ({
  ControlPanel: () => <div data-testid="control-panel" />,
}));

vi.mock("./components/SendDanmakuWindow", () => ({
  SendDanmakuWindow: () => <div data-testid="send-window" />,
}));

function connected(sessionId: string, roomId: number): RoomSessionSnapshot {
  return {
    sessionId,
    requestedRoomId: roomId,
    roomId,
    status: "connected",
    message: "connected",
  };
}

function batch(
  sessionId: string,
  roomId: number,
  text: string,
): DanmakuRoomBatch {
  return {
    sessionId,
    roomId,
    activeSourceCount: 1,
    messages: [
      {
        id: text,
        roomId,
        kind: "danmaku",
        user: "用户",
        text,
      },
    ],
  };
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve: (value: T) => resolve?.(value) };
}

function installIPC(snapshot: Promise<unknown>, config: AppConfig = DEFAULT_APP_CONFIG) {
  mockIPC((command) => {
    if (command === "load_app_config") {
      return config;
    }
    if (command === "set_edit_mode") {
      return {
        is_edit_mode: true,
        is_click_through: false,
        shortcut: "Command+Option+K",
      };
    }
    if (command === "get_bilibili_room_sessions") {
      return snapshot;
    }
    return null;
  });
}

async function waitForMainListeners() {
  await waitFor(() =>
    expect(eventMock.handlers.has("bilibili-room-sessions")).toBe(true),
  );
  await waitFor(() =>
    expect(eventMock.handlers.has("danmaku-messages")).toBe(true),
  );
}

async function emitEvent(event: string, payload: unknown) {
  await act(async () => {
    eventMock.handlers.get(event)?.({ payload });
  });
}

async function flushHorizontalScheduler() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  eventMock.reset();
  localStorage.clear();
  delete document.documentElement.dataset.driftTheme;
  document.documentElement.style.colorScheme = "";
  appThemeMock.setTheme.mockClear();
  windowMock.label = "main";
});

test("long-lived App listener accepts room batches after readiness", async () => {
  const snapshot = deferred<unknown>();
  installIPC(snapshot.promise);
  render(<App />);

  await waitForMainListeners();
  vi.useFakeTimers();
  expect(
    eventMock.listen.mock.calls.filter(
      ([eventName]) => eventName === "danmaku-messages",
    ),
  ).toHaveLength(1);

  await act(async () => {
    snapshot.resolve([connected("s1", 6)]);
    await snapshot.promise;
  });
  await emitEvent("danmaku-messages", batch("s1", 6, "after-ready"));
  await flushHorizontalScheduler();

  expect(screen.getByText("after-ready")).toBeInTheDocument();
});

test("first-cycle buffered replay survives the runtime clear exactly once", async () => {
  const snapshot = deferred<unknown>();
  installIPC(snapshot.promise);
  render(<App />);

  await waitForMainListeners();
  vi.useFakeTimers();
  await emitEvent("danmaku-messages", batch("s1", 6, "buffered-first"));

  await act(async () => {
    snapshot.resolve([connected("s1", 6)]);
    await snapshot.promise;
  });
  await flushHorizontalScheduler();

  expect(screen.getAllByText("buffered-first")).toHaveLength(1);

  await emitEvent("bilibili-room-sessions", [connected("s1", 6)]);
  await flushHorizontalScheduler();

  expect(screen.getAllByText("buffered-first")).toHaveLength(1);
});

test("invalid initial snapshot ends readiness and drains buffered batches safely", async () => {
  const snapshot = deferred<unknown>();
  installIPC(snapshot.promise);
  render(<App />);

  await waitForMainListeners();
  vi.useFakeTimers();
  await emitEvent("danmaku-messages", batch("s1", 6, "buffered-stale"));

  await act(async () => {
    snapshot.resolve({ sessions: [] });
    await snapshot.promise;
  });
  await flushHorizontalScheduler();

  expect(screen.queryByText("buffered-stale")).not.toBeInTheDocument();

  await emitEvent("bilibili-room-sessions", [connected("s1", 6)]);
  await flushHorizontalScheduler();
  expect(screen.queryByText("buffered-stale")).not.toBeInTheDocument();

  await emitEvent("danmaku-messages", batch("s1", 6, "fresh-after-invalid"));
  await flushHorizontalScheduler();

  expect(screen.queryByText("buffered-stale")).not.toBeInTheDocument();
  expect(screen.getByText("fresh-after-invalid")).toBeInTheDocument();
});
