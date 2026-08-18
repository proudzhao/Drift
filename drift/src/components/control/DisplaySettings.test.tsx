import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../../types/config";
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
    />,
  );

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
