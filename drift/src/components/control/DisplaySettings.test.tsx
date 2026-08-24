import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../../types/config";
import { EMPTY_VERTICAL_FLOW_STATUS } from "../../types/verticalFlow";
import { DisplaySettings } from "./DisplaySettings";

afterEach(clearMocks);

test("keeps display patches and window commands", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    return null;
  });
  const user = userEvent.setup();
  const onResetAppearance = vi.fn();
  const onUpdateAppearance = vi.fn();
  const onUpdateMessageDisplay = vi.fn();
  render(
    <DisplaySettings
      appearance={DEFAULT_APP_CONFIG.appearance}
      messageDisplay={DEFAULT_APP_CONFIG.messageDisplay}
      onResetAppearance={onResetAppearance}
      onUpdateAppearance={onUpdateAppearance}
      onUpdateMessageDisplay={onUpdateMessageDisplay}
      verticalFlowStatus={EMPTY_VERTICAL_FLOW_STATUS}
    />,
  );

  expect(screen.getByRole("button", { name: "横向滚动" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "纵向聊天流" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("slider", { name: "滚动速度" })).toBeEnabled();
  expect(screen.getByRole("switch", { name: "显示用户名" })).toBeEnabled();
  expect(screen.queryByText("过载策略")).not.toBeInTheDocument();
  expect(screen.queryByText(/纵向队列/)).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole("slider", { name: "字号" }), {
    target: { value: "24" },
  });
  fireEvent.change(screen.getByRole("slider", { name: "透明度" }), {
    target: { value: "80" },
  });
  fireEvent.change(screen.getByRole("slider", { name: "滚动速度" }), {
    target: { value: "18" },
  });
  await user.click(screen.getByRole("button", { name: "中" }));
  await user.click(screen.getByRole("switch", { name: "显示用户名" }));
  await user.click(screen.getByRole("switch", { name: "普通弹幕" }));
  await user.click(screen.getByRole("switch", { name: "礼物消息" }));
  await user.click(screen.getByRole("switch", { name: "上舰消息" }));
  await user.click(screen.getByRole("switch", { name: "醒目留言" }));
  await user.click(screen.getByRole("button", { name: "显示弹幕窗口" }));
  await user.click(screen.getByRole("button", { name: "隐藏弹幕窗口" }));
  await user.click(screen.getByRole("button", { name: "恢复默认显示设置" }));

  expect(onUpdateAppearance.mock.calls).toEqual([
    [{ fontSize: 24 }],
    [{ opacity: 0.8 }],
    [{ scrollDuration: 18 }],
    [{ density: "medium" }],
    [{ showUsername: !DEFAULT_APP_CONFIG.appearance.showUsername }],
  ]);
  expect(onUpdateMessageDisplay.mock.calls).toEqual([
    [{ showDanmaku: false }],
    [{ showGift: false }],
    [{ showGuard: false }],
    [{ showSuperChat: false }],
  ]);
  expect(calls).toContainEqual({
    command: "show_window",
    payload: { label: "main" },
  });
  expect(calls).toContainEqual({
    command: "hide_window",
    payload: { label: "main" },
  });
  expect(onResetAppearance).toHaveBeenCalledOnce();
  expect(screen.getByRole("region", { name: "外观" })).toBeVisible();
  expect(screen.getByRole("region", { name: "内容" })).toBeVisible();
  expect(screen.getByRole("region", { name: "弹幕窗口" })).toBeVisible();
  expect(screen.getByRole("region", { name: "重置" })).toBeVisible();
});

test("shows vertical-only controls and forces username semantics", async () => {
  const onUpdateAppearance = vi.fn();
  const user = userEvent.setup();
  render(
    <DisplaySettings
      appearance={{
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "vertical",
        verticalOverflowPolicy: "complete",
      }}
      messageDisplay={DEFAULT_APP_CONFIG.messageDisplay}
      onResetAppearance={vi.fn()}
      onUpdateAppearance={onUpdateAppearance}
      onUpdateMessageDisplay={vi.fn()}
      verticalFlowStatus={{
        active: true,
        policy: "complete",
        backlog: 42,
        speedMultiplier: 4,
        droppedTotal: 3,
      }}
    />,
  );

  expect(screen.getByRole("slider", { name: "滚动速度" })).toBeDisabled();
  expect(screen.getByText("仅横向模式生效")).toBeVisible();
  expect(screen.getByRole("switch", { name: "显示用户名" })).toBeDisabled();
  expect(screen.getByText("纵向聊天流始终显示用户名")).toBeVisible();
  expect(screen.getByText("积压 42 条 · 4× 加速")).toBeVisible();
  expect(screen.getByText("本次运行已丢弃 3 条")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "实时优先" }));
  expect(onUpdateAppearance).toHaveBeenCalledWith({
    verticalOverflowPolicy: "realtime",
  });
});

test("shows the normal vertical queue state without a drop notice", () => {
  render(
    <DisplaySettings
      appearance={{
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "vertical",
      }}
      messageDisplay={DEFAULT_APP_CONFIG.messageDisplay}
      onResetAppearance={vi.fn()}
      onUpdateAppearance={vi.fn()}
      onUpdateMessageDisplay={vi.fn()}
      verticalFlowStatus={EMPTY_VERTICAL_FLOW_STATUS}
    />,
  );

  expect(screen.getByText("纵向队列正常")).toBeVisible();
  expect(screen.queryByText(/本次运行已丢弃/)).not.toBeInTheDocument();
});

test("renders a display config error at the top of the page", () => {
  render(
    <DisplaySettings
      appearance={DEFAULT_APP_CONFIG.appearance}
      displayConfigError="显示设置保存失败，已保留原设置"
      messageDisplay={DEFAULT_APP_CONFIG.messageDisplay}
      onResetAppearance={vi.fn()}
      onUpdateAppearance={vi.fn()}
      onUpdateMessageDisplay={vi.fn()}
      verticalFlowStatus={EMPTY_VERTICAL_FLOW_STATUS}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "显示设置保存失败，已保留原设置",
  );
  expect(screen.getByRole("alert").nextElementSibling).toHaveAttribute(
    "aria-label",
    "外观",
  );
});
