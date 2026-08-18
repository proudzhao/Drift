import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { OverlayEditWorkspace } from "./components/OverlayEditWorkspace";
import { DEFAULT_APP_CONFIG } from "./types/config";
import App from "./App";

type WorkspaceProps = ComponentProps<typeof OverlayEditWorkspace>;

const controllerMocks = vi.hoisted(() => ({
  setShowHistory: vi.fn<Dispatch<SetStateAction<boolean>>>(),
  setShowStats: vi.fn<Dispatch<SetStateAction<boolean>>>(),
  startDragging: vi.fn(async () => undefined),
  startResizeDragging: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "main",
    setSizeConstraints: vi.fn(async () => undefined),
    startDragging: controllerMocks.startDragging,
    startResizeDragging: controllerMocks.startResizeDragging,
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => vi.fn()),
}));

vi.mock("./styles/tailwind.css", () => ({}));
vi.mock("./App.css", () => ({}));

vi.mock("./hooks/useDanmakuRuntime", () => ({
  useDanmakuRuntime: () => ({
    activeRoomIdRef: { current: null },
    clearLiveMessageState: vi.fn(),
    enqueueLiveMessages: vi.fn(),
    handleMockRateChange: vi.fn(),
    historySnapshot: [],
    items: [],
    mock: { active: false, rate: 50, totalGenerated: 0 },
    removeDanmakuItem: vi.fn(),
    setShowHistory: controllerMocks.setShowHistory,
    setShowStats: controllerMocks.setShowStats,
    showHistory: false,
    showStats: false,
    startMockDanmaku: vi.fn(),
    statsSnapshot: {
      startedAt: 1,
      updatedAt: 1,
      totalMessages: 0,
      lastMinuteMessages: 0,
      lastFiveMinuteMessages: 0,
      messagesPerMinute: 0,
      kindCounts: { danmaku: 0, super_chat: 0, gift: 0, guard: 0 },
      topUsers: [],
      topWords: [],
    },
    stopMockDanmaku: vi.fn(),
    triggerMockBurst: vi.fn(),
  }),
}));

vi.mock("./components/OverlayEditWorkspace", () => ({
  OverlayEditWorkspace: (props: WorkspaceProps) => (
    <div
      data-mock={props.mock ? "enabled" : "disabled"}
      data-testid="workspace"
    >
      <button onClick={props.onToggleHistory} type="button">
        history
      </button>
      <button onClick={props.onToggleStats} type="button">
        stats
      </button>
      <button onClick={props.onShowMock} type="button">
        mock
      </button>
      <button onClick={props.onExit} type="button">
        exit
      </button>
      <button onMouseDown={props.onDragStart} type="button">
        drag
      </button>
      <button
        onMouseDown={(event) => props.onResizeStart("NorthWest", event)}
        type="button"
      >
        resize
      </button>
    </div>
  ),
}));

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
});

function installIPC(mockPanelEnabled: boolean) {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "load_app_config") {
      return { ...DEFAULT_APP_CONFIG, mockPanelEnabled };
    }
    if (command === "set_edit_mode") {
      return {
        is_edit_mode: true,
        is_click_through: false,
        shortcut: "Command+Option+K",
      };
    }
    return null;
  });
  return calls;
}

test("passes mock only when the loaded config enables it", async () => {
  installIPC(true);
  render(<App />);

  await waitFor(() =>
    expect(screen.getByTestId("workspace")).toHaveAttribute(
      "data-mock",
      "enabled",
    ),
  );
});

test("keeps mock absent when diagnostics disables it", async () => {
  installIPC(false);
  render(<App />);

  await waitFor(() =>
    expect(screen.getByTestId("workspace")).toHaveAttribute(
      "data-mock",
      "disabled",
    ),
  );
});

test("keeps history, stats and narrow mock modes mutually exclusive", async () => {
  installIPC(true);
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByRole("button", { name: "history" }));
  const historyUpdater =
    controllerMocks.setShowHistory.mock.calls[
      controllerMocks.setShowHistory.mock.calls.length - 1
    ]?.[0];
  if (typeof historyUpdater !== "function") {
    throw new Error("history updater was not forwarded");
  }
  expect(historyUpdater(false)).toBe(true);
  expect(controllerMocks.setShowStats).toHaveBeenLastCalledWith(false);

  await user.click(screen.getByRole("button", { name: "stats" }));
  const statsUpdater =
    controllerMocks.setShowStats.mock.calls[
      controllerMocks.setShowStats.mock.calls.length - 1
    ]?.[0];
  if (typeof statsUpdater !== "function") {
    throw new Error("stats updater was not forwarded");
  }
  expect(statsUpdater(false)).toBe(true);
  expect(controllerMocks.setShowHistory).toHaveBeenLastCalledWith(false);

  await user.click(screen.getByRole("button", { name: "mock" }));
  expect(controllerMocks.setShowHistory).toHaveBeenLastCalledWith(false);
  expect(controllerMocks.setShowStats).toHaveBeenLastCalledWith(false);
});

test("forwards drag, resize and exit through the workspace", async () => {
  const ipcCalls = installIPC(true);
  const user = userEvent.setup();
  render(<App />);

  await screen.findByTestId("workspace");
  fireEvent.mouseDown(screen.getByRole("button", { name: "drag" }), {
    button: 0,
  });
  fireEvent.mouseDown(screen.getByRole("button", { name: "resize" }), {
    button: 0,
  });
  await user.click(screen.getByRole("button", { name: "exit" }));

  expect(controllerMocks.startDragging).toHaveBeenCalledOnce();
  expect(controllerMocks.startResizeDragging).toHaveBeenCalledWith(
    "NorthWest",
  );
  await waitFor(() =>
    expect(ipcCalls).toContainEqual({
      command: "set_edit_mode",
      payload: { enabled: false },
    }),
  );
});
