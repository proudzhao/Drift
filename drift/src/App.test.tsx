import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { OverlayEditWorkspace } from "./components/OverlayEditWorkspace";
import danmakuOverlaySource from "./components/DanmakuOverlay.tsx?raw";
import danmakuTrackSource from "./components/DanmakuTrack.tsx?raw";
import { DEFAULT_APP_CONFIG, type AppConfig } from "./types/config";
import App from "./App";
import { useVerticalFlowStatus } from "./hooks/control/useVerticalFlowStatus";

const appThemeMock = vi.hoisted(() => ({ setTheme: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/app", () => ({ setTheme: appThemeMock.setTheme }));

type WorkspaceProps = ComponentProps<typeof OverlayEditWorkspace>;

const controllerMocks = vi.hoisted(() => ({
  setShowHistory: vi.fn<Dispatch<SetStateAction<boolean>>>(),
  setShowStats: vi.fn<Dispatch<SetStateAction<boolean>>>(),
  startDragging: vi.fn(async () => undefined),
  startResizeDragging: vi.fn(async () => undefined),
}));

const windowMock = vi.hoisted(() => ({ label: "main" }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: windowMock.label,
    setSizeConstraints: vi.fn(async () => undefined),
    startDragging: controllerMocks.startDragging,
    startResizeDragging: controllerMocks.startResizeDragging,
  }),
}));

const eventMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();

  return {
    emit: vi.fn(async (event: string, payload?: unknown) => {
      handlers.get(event)?.({ payload });
    }),
    handlers,
    listen: vi.fn<
      (
        event: string,
        callback: (event: { payload: unknown }) => void,
      ) => Promise<() => void>
    >(
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
  emit: eventMock.emit,
  listen: eventMock.listen,
}));

vi.mock("./styles/tailwind.css", () => ({}));
vi.mock("./App.css", () => ({}));

vi.mock("./hooks/useDanmakuRuntime", () => ({
  useDanmakuRuntime: ({ config }: { config: AppConfig }) => ({
    activeRoomIdRef: { current: null },
    clearLiveMessageState: vi.fn(),
    enqueueLiveMessages: vi.fn(),
    handleMockRateChange: vi.fn(),
    historySnapshot: [],
    items: [],
    messageFlow: config.appearance.messageFlow,
    mock: { active: false, rate: 50, totalGenerated: 0 },
    pruneVerticalItems: vi.fn(),
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
    verticalFlowStatus: {
      active: false,
      policy: config.appearance.verticalOverflowPolicy,
      backlog: 0,
      speedMultiplier: 1,
      droppedTotal: 0,
    },
    verticalItems: [],
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

vi.mock("./components/control/ControlPanel", () => ({
  ControlPanel: ({ config }: { config: AppConfig }) => (
    <div data-testid="control-panel-theme">{config.appearance.theme}</div>
  ),
}));

vi.mock("./components/SendDanmakuWindow", () => ({
  SendDanmakuWindow: () => <div data-testid="send-window" />,
}));

function VerticalStatusProbe() {
  const status = useVerticalFlowStatus();
  return (
    <output data-testid="vertical-status-probe">
      {`${status.active}:${status.policy}:${status.backlog}`}
    </output>
  );
}

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
  eventMock.reset();
  eventMock.emit.mockImplementation(async (event: string, payload?: unknown) => {
    eventMock.handlers.get(event)?.({ payload });
  });
  eventMock.listen.mockImplementation(
    async (
      event: string,
      callback: (event: { payload: unknown }) => void,
    ) => {
      eventMock.handlers.set(event, callback);
      return vi.fn(() => {
        if (eventMock.handlers.get(event) === callback) {
          eventMock.handlers.delete(event);
        }
      });
    },
  );
  localStorage.clear();
  delete document.documentElement.dataset.driftTheme;
  document.documentElement.style.colorScheme = "";
  appThemeMock.setTheme.mockClear();
  windowMock.label = "main";
});

function installIPC(
  mockPanelEnabled: boolean,
  config: AppConfig = DEFAULT_APP_CONFIG,
) {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "load_app_config") {
      return { ...config, mockPanelEnabled };
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

test("renders only the horizontal overlay for the default flow", async () => {
  installIPC(false);
  render(<App />);

  expect(
    await screen.findByRole("region", { name: "Drift danmaku preview" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "Drift vertical chat" }),
  ).not.toBeInTheDocument();
});

test("renders only the vertical overlay for vertical flow", async () => {
  installIPC(false, {
    ...DEFAULT_APP_CONFIG,
    appearance: {
      ...DEFAULT_APP_CONFIG.appearance,
      messageFlow: "vertical",
    },
  });
  render(<App />);

  expect(
    await screen.findByRole("region", { name: "Drift vertical chat" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "Drift danmaku preview" }),
  ).not.toBeInTheDocument();
});

test("publishes only the safe vertical flow snapshot from the main window", async () => {
  installIPC(false);
  render(<App />);

  await waitFor(() =>
    expect(
      eventMock.emit.mock.calls.some(
        ([event]) => event === "vertical-flow-status",
      ),
    ).toBe(true),
  );
  const publishCall = eventMock.emit.mock.calls.find(
    ([event]) => event === "vertical-flow-status",
  );
  const payload = publishCall?.[1] as Record<string, unknown>;
  expect(payload).toEqual({
    active: false,
    policy: "realtime",
    backlog: 0,
    speedMultiplier: 1,
    droppedTotal: 0,
  });
  expect(Object.keys(payload).sort()).toEqual([
    "active",
    "backlog",
    "droppedTotal",
    "policy",
    "speedMultiplier",
  ]);

  await act(async () => {
    await eventMock.emit("app-config-changed", {
      ...DEFAULT_APP_CONFIG,
      appearance: {
        ...DEFAULT_APP_CONFIG.appearance,
        verticalOverflowPolicy: "complete",
      },
    });
  });
  await waitFor(() =>
    expect(eventMock.emit).toHaveBeenCalledWith(
      "vertical-flow-status",
      expect.objectContaining({ policy: "complete" }),
    ),
  );

  eventMock.emit.mockClear();
  await act(async () => {
    eventMock.handlers.get("vertical-flow-status-request")?.({
      payload: undefined,
    });
  });
  await waitFor(() =>
    expect(eventMock.emit).toHaveBeenCalledWith("vertical-flow-status", {
      active: false,
      policy: "complete",
      backlog: 0,
      speedMultiplier: 1,
      droppedTotal: 0,
    }),
  );
});

test("publishes the latest cold-start snapshot after the request listener is ready", async () => {
  let installRequestListener: (() => void) | undefined;
  eventMock.listen.mockImplementation(
    (
      event: string,
      callback: (event: { payload: unknown }) => void,
    ) => {
      if (event === "vertical-flow-status-request") {
        return new Promise<() => void>((resolve) => {
          installRequestListener = () => {
            eventMock.handlers.set(event, callback);
            resolve(() => undefined);
          };
        });
      }
      eventMock.handlers.set(event, callback);
      return Promise.resolve(() => undefined);
    },
  );
  installIPC(false);

  render(
    <>
      <VerticalStatusProbe />
      <App />
    </>,
  );

  await waitFor(() =>
    expect(eventMock.emit).toHaveBeenCalledWith(
      "vertical-flow-status-request",
    ),
  );
  expect(eventMock.handlers.has("vertical-flow-status-request")).toBe(false);
  await waitFor(() =>
    expect(eventMock.handlers.has("app-config-changed")).toBe(true),
  );
  await act(async () => {
    eventMock.handlers.get("app-config-changed")?.({
      payload: {
        ...DEFAULT_APP_CONFIG,
        appearance: {
          ...DEFAULT_APP_CONFIG.appearance,
          verticalOverflowPolicy: "complete",
        },
      },
    });
    await Promise.resolve();
  });
  expect(screen.getByTestId("vertical-status-probe")).toHaveTextContent(
    "false:realtime:0",
  );

  await act(async () => {
    installRequestListener?.();
    await Promise.resolve();
    await Promise.resolve();
  });

  await waitFor(() =>
    expect(screen.getByTestId("vertical-status-probe")).toHaveTextContent(
      "false:complete:0",
    ),
  );
  const broadcasts = eventMock.emit.mock.calls.filter(
    ([event]) => event === "vertical-flow-status",
  );
  expect(broadcasts).toEqual([
    [
      "vertical-flow-status",
      {
        active: false,
        policy: "complete",
        backlog: 0,
        speedMultiplier: 1,
        droppedTotal: 0,
      },
    ],
  ]);
});

test("does not republish an unchanged vertical flow snapshot", async () => {
  installIPC(false);
  render(<App />);
  await screen.findByRole("region", { name: "Drift danmaku preview" });
  await waitFor(() =>
    expect(
      eventMock.emit.mock.calls.some(
        ([event]) => event === "vertical-flow-status",
      ),
    ).toBe(true),
  );
  eventMock.emit.mockClear();

  await act(async () => {
    eventMock.handlers.get("app-config-changed")?.({
      payload: {
        ...DEFAULT_APP_CONFIG,
        appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "light" },
      },
    });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("light"),
  );

  expect(
    eventMock.emit.mock.calls.filter(
      ([event]) => event === "vertical-flow-status",
    ),
  ).toEqual([]);
});

test("latches vertical status warnings until a later emit succeeds", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let failStatusEmit = true;
  let statusEmitAttempts = 0;
  eventMock.emit.mockImplementation(async (event: string, payload?: unknown) => {
    if (event === "vertical-flow-status") {
      statusEmitAttempts += 1;
      if (failStatusEmit) {
        throw new Error("event unavailable");
      }
    }
    eventMock.handlers.get(event)?.({ payload });
  });
  installIPC(false);
  render(<App />);

  await waitFor(() => expect(statusEmitAttempts).toBe(1));
  await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
  await act(async () => {
    eventMock.handlers.get("vertical-flow-status-request")?.({
      payload: undefined,
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(statusEmitAttempts).toBe(2));
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenLastCalledWith(
    "Failed to publish vertical flow status.",
  );

  await act(async () => {
    eventMock.handlers.get("app-config-changed")?.({
      payload: {
        ...DEFAULT_APP_CONFIG,
        appearance: {
          ...DEFAULT_APP_CONFIG.appearance,
          verticalOverflowPolicy: "complete",
        },
      },
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(statusEmitAttempts).toBe(3));
  expect(warn).toHaveBeenCalledTimes(1);

  failStatusEmit = false;
  await act(async () => {
    eventMock.handlers.get("vertical-flow-status-request")?.({
      payload: undefined,
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(statusEmitAttempts).toBe(4));

  failStatusEmit = true;
  await act(async () => {
    eventMock.handlers.get("app-config-changed")?.({
      payload: DEFAULT_APP_CONFIG,
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(statusEmitAttempts).toBe(5));
  expect(warn).toHaveBeenCalledTimes(2);
  expect(warn).toHaveBeenLastCalledWith(
    "Failed to publish vertical flow status.",
  );
  warn.mockRestore();
});

test("keeps vertical flow status UI out of the transparent main overlay", async () => {
  installIPC(false, {
    ...DEFAULT_APP_CONFIG,
    appearance: {
      ...DEFAULT_APP_CONFIG.appearance,
      messageFlow: "vertical",
    },
  });
  render(<App />);

  expect(
    await screen.findByRole("region", { name: "Drift vertical chat" }),
  ).toBeVisible();
  expect(screen.queryByText(/纵向队列/)).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps the main overlay available when status publishing fails", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  eventMock.emit.mockRejectedValueOnce(new Error("event unavailable"));
  installIPC(false);

  render(<App />);

  expect(
    await screen.findByRole("region", { name: "Drift danmaku preview" }),
  ).toBeVisible();
  await waitFor(() =>
    expect(warn).toHaveBeenCalledWith(
      "Failed to publish vertical flow status.",
    ),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  warn.mockRestore();
});

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

test("uses theme tokens only for the edit-mode backdrop", async () => {
  installIPC(false);
  render(<App />);

  const workspace = await screen.findByTestId("workspace");
  expect(workspace.parentElement).toHaveClass(
    "bg-[var(--drift-ui-edit-backdrop)]",
    "[outline:1px_dashed_var(--drift-ui-edit-outline)]",
  );
});

test("keeps actual danmaku rendering isolated from UI theme tokens", () => {
  for (const source of [danmakuTrackSource, danmakuOverlaySource]) {
    expect(source).not.toContain("driftTheme");
    expect(source).not.toContain("--drift-ui-");
  }
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

test("lets the Rust config override a stale bootstrap mirror", async () => {
  localStorage.setItem("drift-ui-theme", "light");
  let resolveConfig: ((config: AppConfig) => void) | undefined;
  const configPromise = new Promise<AppConfig>((resolve) => {
    resolveConfig = resolve;
  });
  mockIPC((command) => {
    if (command === "load_app_config") return configPromise;
    if (command === "set_edit_mode") {
      return {
        is_edit_mode: true,
        is_click_through: false,
        shortcut: "Command+Option+K",
      };
    }
    return null;
  });

  render(<App />);
  expect(document.documentElement.dataset.driftTheme).toBe("light");

  await act(async () => {
    resolveConfig?.(DEFAULT_APP_CONFIG);
    await configPromise;
  });
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );
  expect(localStorage.getItem("drift-ui-theme")).toBe("dark");
  expect(appThemeMock.setTheme).toHaveBeenLastCalledWith("dark");
});

test("does not let a stale config snapshot overwrite a newer theme event", async () => {
  localStorage.setItem("drift-ui-theme", "light");
  const lightConfig: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "light" },
  };
  const darkConfig: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "dark" },
  };
  let resolveConfig: ((config: AppConfig) => void) | undefined;
  const configPromise = new Promise<AppConfig>((resolve) => {
    resolveConfig = resolve;
  });
  const sequence: string[] = [];

  eventMock.listen.mockImplementation(
    async (event: string, callback: (event: { payload: unknown }) => void) => {
      sequence.push(`listen:${event}`);
      eventMock.handlers.set(event, callback);
      return () => undefined;
    },
  );
  mockIPC((command) => {
    if (command === "load_app_config") {
      sequence.push("invoke:load_app_config");
      eventMock.emit("app-config-changed", darkConfig);
      return configPromise;
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

  render(<App />);
  await waitFor(() =>
    expect(sequence.indexOf("listen:app-config-changed")).toBeGreaterThanOrEqual(
      0,
    ),
  );
  expect(sequence.indexOf("listen:app-config-changed")).toBeLessThan(
    sequence.indexOf("invoke:load_app_config"),
  );
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );

  await act(async () => {
    resolveConfig?.(lightConfig);
    await configPromise;
  });
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );
  expect(localStorage.getItem("drift-ui-theme")).toBe("dark");
  expect(appThemeMock.setTheme).toHaveBeenLastCalledWith("dark");
});

test("leaves post-bootstrap send themes to SendDanmakuWindow", async () => {
  windowMock.label = "send";
  localStorage.setItem("drift-ui-theme", "light");
  document.documentElement.dataset.driftTheme = "light";
  document.documentElement.style.colorScheme = "light";
  const calls: string[] = [];
  mockIPC((command) => {
    calls.push(command);
    if (command === "load_app_config") {
      return {
        ...DEFAULT_APP_CONFIG,
        appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "dark" },
      };
    }
    return null;
  });

  render(<App />);
  await waitFor(() => expect(screen.getByTestId("send-window")).toBeVisible());
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(calls).not.toContain("load_app_config");
  expect(eventMock.handlers.has("app-config-changed")).toBe(false);
  expect(appThemeMock.setTheme).not.toHaveBeenCalled();
  eventMock.emit("app-config-changed", {
    ...DEFAULT_APP_CONFIG,
    appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "light" },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.documentElement.dataset.driftTheme).toBe("light");
  expect(localStorage.getItem("drift-ui-theme")).toBe("light");
});

test.each(["main", "control"] as const)(
  "continues to apply runtime theme events in the %s window",
  async (label) => {
    windowMock.label = label;
    mockIPC((command) => {
      if (command === "load_app_config") {
        return {
          ...DEFAULT_APP_CONFIG,
          appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "dark" },
        };
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

    render(<App />);
    await waitFor(() =>
      expect(document.documentElement.dataset.driftTheme).toBe("dark"),
    );
    eventMock.emit("app-config-changed", {
      ...DEFAULT_APP_CONFIG,
      appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "light" },
    });

    await waitFor(() =>
      expect(document.documentElement.dataset.driftTheme).toBe("light"),
    );
    expect(localStorage.getItem("drift-ui-theme")).toBe("light");
  },
);
