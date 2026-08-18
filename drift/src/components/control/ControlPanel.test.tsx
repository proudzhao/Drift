import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../../types/config";
import { ControlPanel } from "./ControlPanel";

beforeEach(() => {
  mockIPC((command) => {
    if (command === "auth_get_status") return { isLoggedIn: false };
    throw new Error(`Unexpected preview command: ${command}`);
  });
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
