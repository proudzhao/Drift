import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ControlShell } from "./ControlShell";

test("renders fixed shell slots without changing page content", () => {
  render(
    <ControlShell
      activeTab="room"
      collapsed={false}
      footer={<span>快捷键提示</span>}
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      status={<span>尚未连接</span>}
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
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      status={<span>尚未连接</span>}
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
      onCollapsedChange={vi.fn()}
      onTabChange={vi.fn()}
      status={<span>尚未连接</span>}
    >
      <div>页面内容</div>
    </ControlShell>,
  );
  const content = screen.getByText("页面内容").parentElement;
  expect(content).toHaveClass("bg-drift-surface-dark", "text-drift-ink");
  expect(content).not.toHaveClass("bg-[#e4e4e4]", "text-[#202124]");
});
