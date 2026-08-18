import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { SendDanmakuStatus } from "../types/danmaku";
import { SendDanmakuWindow } from "./SendDanmakuWindow";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => vi.fn()),
}));

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
});

const READY_STATUS: SendDanmakuStatus = {
  anchorName: "测试主播",
  canSend: true,
  cooldownMs: 0,
  reason: "可以发送",
  roomId: 123456,
  status: "connected",
};

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
