import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ControlShell } from "./ControlShell";

test("renders fixed shell slots without changing page content", () => {
  render(
    <ControlShell
      activeTab="room"
      collapsed={false}
      footer={<span>快捷键提示</span>}
      isThemeSaving={false}
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      onThemeToggle={vi.fn()}
      status={<span>尚未连接</span>}
      theme="dark"
      themeError=""
      updateNotice={<div>发现新版本</div>}
    >
      <div>现有直播间页面</div>
    </ControlShell>,
  );

  expect(screen.getByRole("heading", { name: "直播间" })).toBeVisible();
  expect(screen.getByText("发现新版本")).toBeVisible();
  expect(screen.getByText("现有直播间页面")).toBeVisible();
  expect(screen.getByText("快捷键提示")).toBeVisible();
});

test("keeps content and footer in their fixed rows without an update notice", () => {
  render(
    <ControlShell
      activeTab="room"
      collapsed={false}
      footer={<span>快捷键提示</span>}
      isThemeSaving={false}
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      onThemeToggle={vi.fn()}
      status={<span>尚未连接</span>}
      theme="dark"
      themeError=""
    >
      <div>现有直播间页面</div>
    </ControlShell>,
  );

  expect(screen.getByText("现有直播间页面").parentElement).toHaveClass(
    "row-start-3",
  );
  expect(screen.getByText("快捷键提示").closest("footer")).toHaveClass(
    "row-start-4",
  );
});

test("uses the Signal Cyan content surface without the light compatibility panel", () => {
  render(
    <ControlShell
      activeTab="room"
      collapsed={false}
      footer={<span>快捷键</span>}
      isThemeSaving={false}
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      onThemeToggle={vi.fn()}
      status={<span>尚未连接</span>}
      theme="dark"
      themeError=""
    >
      <div>页面内容</div>
    </ControlShell>,
  );
  const content = screen.getByText("页面内容").parentElement;
  expect(content).toHaveClass("bg-drift-surface-dark", "text-drift-ink");
  expect(content).not.toHaveClass("bg-[#e4e4e4]", "text-[#202124]");
});

test("uses the same semantic shell structure in light theme", () => {
  render(
    <ControlShell
      activeTab="room"
      collapsed={false}
      footer={<span>快捷键</span>}
      isThemeSaving={false}
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      onThemeToggle={vi.fn()}
      status={<span>尚未连接</span>}
      theme="light"
      themeError=""
    >
      <div>亮色页面内容</div>
    </ControlShell>,
  );

  expect(screen.getByRole("main")).toHaveClass(
    "drift-control-shell",
    "bg-[var(--drift-ui-workspace)]",
  );
  expect(screen.getByText("亮色页面内容").parentElement).toHaveClass(
    "bg-drift-surface-dark",
    "text-drift-ink",
  );
});

test("shows the target theme action and accessible error", async () => {
  const user = userEvent.setup();
  const onThemeToggle = vi.fn();
  const { rerender } = render(
    <ControlShell
      activeTab="room"
      collapsed={false}
      footer={<span>快捷键</span>}
      isThemeSaving={false}
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      onThemeToggle={onThemeToggle}
      status={<span>尚未连接</span>}
      theme="dark"
      themeError=""
    >
      <div>页面内容</div>
    </ControlShell>,
  );

  await user.click(screen.getByRole("button", { name: "切换到亮色主题" }));
  expect(onThemeToggle).toHaveBeenCalledOnce();

  rerender(
    <ControlShell
      activeTab="room"
      collapsed={false}
      footer={<span>快捷键</span>}
      isThemeSaving
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      onThemeToggle={onThemeToggle}
      status={<span>尚未连接</span>}
      theme="light"
      themeError="主题保存失败，已恢复原主题"
    >
      <div>页面内容</div>
    </ControlShell>,
  );

  expect(screen.getByRole("button", { name: "切换到暗色主题" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "主题保存失败，已恢复原主题",
  );
});
