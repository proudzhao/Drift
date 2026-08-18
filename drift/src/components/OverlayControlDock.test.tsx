import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { OverlayControlDock } from "./OverlayControlDock";

test("hides the mock status when diagnostics disabled", () => {
  render(
    <OverlayControlDock
      drawerOpen={false}
      mockActive={null}
      onExit={vi.fn()}
      onToggleHistory={vi.fn()}
      onToggleStats={vi.fn()}
      shortcut="Command+Option+K"
      showHistory={false}
      showStats={false}
    />,
  );

  expect(screen.queryByText("Mock", { exact: false })).not.toBeInTheDocument();
});

test("keeps the bottom dock layout marker and active drawer state", () => {
  render(
    <OverlayControlDock
      drawerOpen
      mockActive={false}
      onExit={vi.fn()}
      onToggleHistory={vi.fn()}
      onToggleStats={vi.fn()}
      shortcut="Command+Option+K"
      showHistory
      showStats={false}
    />,
  );

  expect(screen.getByRole("navigation", { name: "编辑工作台" })).toHaveClass(
    "overlay-control-dock",
    "absolute",
    "bottom-3",
    "left-3",
    "right-3",
    "pointer-events-auto",
    "box-border",
  );
  expect(screen.getByRole("navigation", { name: "编辑工作台" })).toHaveAttribute(
    "data-drawer-open",
    "true",
  );
});

test("shows read-only mock status and forwards workspace actions", async () => {
  const user = userEvent.setup();
  const onToggleHistory = vi.fn();
  const onToggleStats = vi.fn();
  const onExit = vi.fn();
  render(
    <OverlayControlDock
      drawerOpen
      mockActive
      onExit={onExit}
      onToggleHistory={onToggleHistory}
      onToggleStats={onToggleStats}
      shortcut="Command+Option+K"
      showHistory
      showStats={false}
    />,
  );

  expect(screen.getByText("运行中", { exact: false })).toBeVisible();
  expect(screen.getByRole("button", { name: "弹幕历史" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "弹幕历史" }));
  await user.click(screen.getByRole("button", { name: "弹幕统计" }));
  await user.click(screen.getByRole("button", { name: "完成编辑" }));
  expect(onToggleHistory).toHaveBeenCalledOnce();
  expect(onToggleStats).toHaveBeenCalledOnce();
  expect(onExit).toHaveBeenCalledOnce();
});
