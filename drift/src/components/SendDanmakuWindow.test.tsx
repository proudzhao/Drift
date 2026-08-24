import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { SendDanmakuStatus } from "../types/danmaku";
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

const READY_STATUS: SendDanmakuStatus = {
  anchorName: "测试主播",
  canSend: true,
  cooldownMs: 0,
  reason: "可以发送",
  roomId: 123456,
  status: "connected",
};

function themeConfig(theme: "dark" | "light") {
  return { appearance: { theme } };
}

test("keeps status lookup, trimmed send payload, success clearing and close command", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "get_send_danmaku_status") return READY_STATUS;
    if (command === "send_bilibili_danmaku") {
      return { code: 0, cooldownMs: 3000, message: "发送成功" };
    }
    if (command === "hide_send_danmaku_window") return null;
    return null;
  });
  const user = userEvent.setup();
  render(<SendDanmakuWindow />);

  expect(await screen.findByText("准备发送")).toBeVisible();
  const input = screen.getByRole("textbox", { name: "弹幕内容" });
  fireEvent.change(input, { target: { value: " 你好 " } });
  await user.click(screen.getByRole("button", { name: "发送" }));

  await waitFor(() => expect(input).toHaveValue(""));
  expect(screen.getByRole("status")).toHaveTextContent("发送成功");
  expect(calls).toContainEqual({
    command: "send_bilibili_danmaku",
    payload: { text: "你好" },
  });

  await user.click(screen.getByRole("button", { name: "关闭发送窗口" }));
  expect(calls).toContainEqual({
    command: "hide_send_danmaku_window",
    payload: {},
  });
});

test("keeps failed text and exposes the failure in the status rail", async () => {
  mockIPC((command) => {
    if (command === "get_send_danmaku_status") return READY_STATUS;
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

test("keeps Enter, Escape and manual drag commands", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "get_send_danmaku_status") return READY_STATUS;
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
      payload: { text: "Enter 发送" },
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
    mockIPC((command) => {
      if (command === "load_app_config") return themeConfig(theme);
      if (command === "get_send_danmaku_status") return READY_STATUS;
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
  mockIPC((command) => {
    if (command === "load_app_config") return themeConfig("light");
    if (command === "get_send_danmaku_status") return READY_STATUS;
    return null;
  });

  render(<SendDanmakuWindow />);
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("light"),
  );
  expect(eventMock.handlers.has("app-config-changed")).toBe(false);

  eventMock.emit("app-config-changed", themeConfig("dark"));

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.documentElement.dataset.driftTheme).toBe("light");
  expect(localStorage.getItem("drift-ui-theme")).toBe("light");
});

test("refreshes authority theme on send-opened but not focus, pageshow or visibility", async () => {
  let loadCount = 0;
  let statusLoadCount = 0;
  mockIPC((command) => {
    if (command === "load_app_config") {
      loadCount += 1;
      return themeConfig(loadCount === 1 ? "light" : "dark");
    }
    if (command === "get_send_danmaku_status") {
      statusLoadCount += 1;
      return READY_STATUS;
    }
    return null;
  });

  render(<SendDanmakuWindow />);
  await waitFor(() => expect(loadCount).toBe(1));
  await waitFor(() => expect(statusLoadCount).toBe(1));
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("light"),
  );

  eventMock.emit("send-window-opened", null);
  await waitFor(() => expect(loadCount).toBe(2));
  await waitFor(() => expect(statusLoadCount).toBe(2));
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );

  fireEvent.focus(window);
  await waitFor(() => expect(statusLoadCount).toBe(3));
  expect(loadCount).toBe(2);
  fireEvent(window, new Event("pageshow"));
  await waitFor(() => expect(statusLoadCount).toBe(4));
  expect(loadCount).toBe(2);
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => expect(statusLoadCount).toBe(5));
  expect(loadCount).toBe(2);
});

test("keeps the newer send-opened authority theme when the mount load resolves late", async () => {
  const resolveConfigs: Array<(config: ReturnType<typeof themeConfig>) => void> = [];
  mockIPC((command) => {
    if (command === "load_app_config") {
      return new Promise<ReturnType<typeof themeConfig>>((resolve) => {
        resolveConfigs.push(resolve);
      });
    }
    if (command === "get_send_danmaku_status") return READY_STATUS;
    return null;
  });

  render(<SendDanmakuWindow />);
  await waitFor(() => expect(resolveConfigs).toHaveLength(1));

  eventMock.emit("send-window-opened", null);
  await waitFor(() => expect(resolveConfigs).toHaveLength(2));

  resolveConfigs[1]?.(themeConfig("dark"));
  await waitFor(() =>
    expect(document.documentElement.dataset.driftTheme).toBe("dark"),
  );

  resolveConfigs[0]?.(themeConfig("light"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.documentElement.dataset.driftTheme).toBe("dark");
  expect(localStorage.getItem("drift-ui-theme")).toBe("dark");
});

test("cleans up authority refresh fallbacks on unmount", async () => {
  let loadCount = 0;
  mockIPC((command) => {
    if (command === "load_app_config") {
      loadCount += 1;
      return themeConfig("light");
    }
    if (command === "get_send_danmaku_status") return READY_STATUS;
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

  let resolveConfig: ((config: ReturnType<typeof themeConfig>) => void) | undefined;
  let loadCount = 0;
  const configPromise = new Promise<ReturnType<typeof themeConfig>>((resolve) => {
    resolveConfig = resolve;
  });
  mockIPC((command) => {
    if (command === "load_app_config") {
      loadCount += 1;
      return configPromise;
    }
    if (command === "get_send_danmaku_status") return READY_STATUS;
    return null;
  });

  const { unmount } = render(<SendDanmakuWindow />);
  await waitFor(() => expect(loadCount).toBe(1));
  expect(resolveConfig).toBeDefined();
  unmount();

  resolveConfig?.(themeConfig("light"));
  await configPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.documentElement.dataset.driftTheme).toBe("dark");
  expect(localStorage.getItem("drift-ui-theme")).toBe("dark");
});
