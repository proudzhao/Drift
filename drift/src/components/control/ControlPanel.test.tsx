import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../../types/config";
import { EMPTY_DANMAKU_RECORDING_STATUS } from "../../types/recording";
import { ControlPanel } from "./ControlPanel";

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => undefined),
  listen: vi.fn(async () => vi.fn()),
}));

beforeEach(() => {
  mockIPC((command) => {
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return {
        roomId: 6,
        pausedFanMedalRuleIds: ["fan-only"],
        pauseReason: "fan_medal_protocol_unknown",
      };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    throw new Error(`Unexpected preview command: ${command}`);
  });
});

test("passes runtime warnings to the filter page", async () => {
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{
        ...DEFAULT_APP_CONFIG,
        filter: {
          ...DEFAULT_APP_CONFIG.filter,
          rules: [
            {
              id: "fan-only",
              enabled: true,
              name: "只看本房牌",
              target: "currentRoomFanMedal",
              operator: "equals",
              value: "no",
              action: "hide",
            },
          ],
        },
        update: { checkOnStartup: false },
      }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "过滤规则" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "本次连接已暂停相关规则",
  );
});

afterEach(() => {
  clearMocks();
});

test("switches existing pages through the new control shell", async () => {
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{
        ...DEFAULT_APP_CONFIG,
        update: { checkOnStartup: false },
      }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  expect(screen.getByRole("heading", { name: "直播间" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "弹幕显示" }));
  expect(screen.getByRole("heading", { name: "弹幕显示" })).toBeVisible();
  expect(screen.getByText("字号")).toBeVisible();
  expect(screen.getByRole("button", { name: "收起侧边栏" })).toBeVisible();
});

test("wires recording status and commands without optimistic toggles", async () => {
  const commands: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    commands.push({ command, payload });
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return {
        roomId: null,
        pausedFanMedalRuleIds: [],
        pauseReason: null,
      };
    }
    if (command === "get_danmaku_recording_status") {
      return {
        enabled: true,
        state: "error",
        currentFileName: null,
        errorMessage: "记录目录无访问权限，记录已暂停",
      };
    }
    return null;
  });
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{
        ...DEFAULT_APP_CONFIG,
        update: { checkOnStartup: false },
      }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  expect(
    await screen.findByText(/暂停期间的消息不会补写/),
  ).toBeVisible();
  const toggle = screen.getByRole("switch", { name: "记录弹幕" });
  expect(toggle).toHaveAttribute("aria-checked", "true");

  await user.click(screen.getByRole("button", { name: "重试记录" }));
  await user.click(screen.getByRole("button", { name: "打开记录目录" }));
  await user.click(toggle);

  expect(commands).toContainEqual({
    command: "retry_danmaku_recording",
    payload: {},
  });
  expect(commands).toContainEqual({
    command: "open_danmaku_record_dir",
    payload: {},
  });
  expect(commands).toContainEqual({
    command: "set_danmaku_recording_enabled",
    payload: { enabled: false },
  });
  expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("persists light theme from the header action", async () => {
  const commands: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    commands.push({ command, payload });
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return { roomId: null, pausedFanMedalRuleIds: [], pauseReason: null };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "save_app_config") {
      return (payload as { config: AppConfig }).config;
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const onConfigChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{ ...DEFAULT_APP_CONFIG, update: { checkOnStartup: false } }}
      isConnected={false}
      onConfigChange={onConfigChange}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "切换到亮色主题" }));
  expect(commands).toContainEqual({
    command: "save_app_config",
    payload: {
      config: {
        ...DEFAULT_APP_CONFIG,
        appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "light" },
        update: { checkOnStartup: false },
      },
    },
  });
  await waitFor(() => expect(onConfigChange).toHaveBeenCalled());
});

test("restores the prior theme and error when header theme persistence fails", async () => {
  mockIPC((command) => {
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return { roomId: null, pausedFanMedalRuleIds: [], pauseReason: null };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "save_app_config") throw new Error("write failed");
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{ ...DEFAULT_APP_CONFIG, update: { checkOnStartup: false } }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "切换到亮色主题" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "主题保存失败，已恢复原主题",
  );
  expect(screen.getByRole("button", { name: "切换到亮色主题" })).toBeEnabled();
});

test("keeps the selected UI theme when display settings are reset", async () => {
  const commands: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    commands.push({ command, payload });
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return { roomId: null, pausedFanMedalRuleIds: [], pauseReason: null };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "save_app_config") {
      return (payload as { config: AppConfig }).config;
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{
        ...DEFAULT_APP_CONFIG,
        appearance: { ...DEFAULT_APP_CONFIG.appearance, theme: "light" },
        update: { checkOnStartup: false },
      }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "弹幕显示" }));
  await user.click(screen.getByRole("button", { name: "恢复默认显示设置" }));
  const saveCall = commands.slice().reverse().find(
    (item) => item.command === "save_app_config",
  );
  const savedConfig = (saveCall?.payload as { config: AppConfig }).config;
  expect(savedConfig.appearance.fontSize).toBe(20);
  expect(savedConfig.appearance.scrollDuration).toBe(12);
  expect(savedConfig.appearance.theme).toBe("light");
  expect(savedConfig.appearance.messageFlow).toBe("horizontal");
  expect(savedConfig.appearance.verticalOverflowPolicy).toBe("realtime");
});

test("reports display config save failure without changing the selected flow", async () => {
  mockIPC((command) => {
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return { roomId: null, pausedFanMedalRuleIds: [], pauseReason: null };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "save_app_config") throw new Error("write failed");
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{ ...DEFAULT_APP_CONFIG, update: { checkOnStartup: false } }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "弹幕显示" }));
  await user.click(screen.getByRole("button", { name: "纵向聊天流" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "显示设置保存失败，已保留原设置",
  );
  expect(screen.getByRole("button", { name: "横向滚动" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("clears a display config error after the next successful save", async () => {
  let saveAttempts = 0;
  mockIPC((command, payload) => {
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return { roomId: null, pausedFanMedalRuleIds: [], pauseReason: null };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "save_app_config") {
      saveAttempts += 1;
      if (saveAttempts === 1) throw new Error("write failed");
      return (payload as { config: AppConfig }).config;
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{ ...DEFAULT_APP_CONFIG, update: { checkOnStartup: false } }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "弹幕显示" }));
  await user.click(screen.getByRole("button", { name: "纵向聊天流" }));
  expect(await screen.findByRole("alert")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "纵向聊天流" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

test("lets the later serialized display save own the final error state", async () => {
  let rejectFirstSave: ((error: unknown) => void) | undefined;
  const firstSave = new Promise<AppConfig>((_resolve, reject) => {
    rejectFirstSave = reject;
  });
  let saveAttempts = 0;
  mockIPC((command, payload) => {
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return { roomId: null, pausedFanMedalRuleIds: [], pauseReason: null };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "save_app_config") {
      saveAttempts += 1;
      if (saveAttempts === 1) return firstSave;
      return (payload as { config: AppConfig }).config;
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{ ...DEFAULT_APP_CONFIG, update: { checkOnStartup: false } }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "弹幕显示" }));
  await user.click(screen.getByRole("button", { name: "纵向聊天流" }));
  await user.click(screen.getByRole("button", { name: "低" }));
  rejectFirstSave?.(new Error("first write failed"));

  await waitFor(() => expect(saveAttempts).toBe(2));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

test("keeps authoritative appearance when display reset fails", async () => {
  mockIPC((command) => {
    if (command === "auth_get_status") return { isLoggedIn: false };
    if (command === "get_filter_runtime_status") {
      return { roomId: null, pausedFanMedalRuleIds: [], pauseReason: null };
    }
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "save_app_config") throw new Error("write failed");
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(
    <ControlPanel
      config={{
        ...DEFAULT_APP_CONFIG,
        appearance: {
          ...DEFAULT_APP_CONFIG.appearance,
          messageFlow: "vertical",
        },
        update: { checkOnStartup: false },
      }}
      isConnected={false}
      onConfigChange={vi.fn()}
      onStatusChange={vi.fn()}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "弹幕显示" }));
  await user.click(
    screen.getByRole("button", { name: "恢复默认显示设置" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "显示设置保存失败，已保留原设置",
  );
  expect(screen.getByRole("button", { name: "纵向聊天流" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
