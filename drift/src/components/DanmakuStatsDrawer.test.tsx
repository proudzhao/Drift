import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DanmakuStatsDrawer, kindSharePercent } from "./DanmakuStatsDrawer";

const FILLED_STATS = {
  startedAt: 1,
  updatedAt: 2,
  totalMessages: 100,
  lastMinuteMessages: 24,
  lastFiveMinuteMessages: 80,
  messagesPerMinute: 24,
  kindCounts: { danmaku: 70, super_chat: 10, gift: 15, guard: 5 },
  topUsers: [
    { user: "这是一个用于检查截断的超长用户名_Official", count: 18 },
  ],
  topWords: [{ word: "这是一个非常长的高频词条", count: 12 }],
};

test("calculates bounded message kind shares", () => {
  expect(kindSharePercent(25, 100)).toBe(25);
  expect(kindSharePercent(1, 0)).toBe(0);
  expect(kindSharePercent(120, 100)).toBe(100);
});

test("keeps the drawer positioned before the workspace stylesheet lands", () => {
  render(<DanmakuStatsDrawer onClose={vi.fn()} stats={FILLED_STATS} />);

  expect(screen.getByLabelText("弹幕统计")).toHaveClass(
    "absolute",
    "right-0",
    "grid",
    "w-[296px]",
    "pointer-events-auto",
    "box-border",
  );
});

test("uses shared drawer, KPI, progress and ranking theme tokens", () => {
  render(<DanmakuStatsDrawer onClose={vi.fn()} stats={FILLED_STATS} />);

  expect(screen.getByLabelText("弹幕统计")).toHaveClass(
    "drift-theme-transition",
    "border-[var(--drift-ui-border)]",
    "bg-[var(--drift-ui-overlay-drawer)]",
  );
  expect(screen.getByText("100").parentElement).toHaveClass(
    "drift-theme-transition",
    "border-[var(--drift-ui-border)]",
    "bg-[var(--drift-ui-overlay-surface)]",
  );
  expect(screen.getByRole("progressbar", { name: "弹幕占比" })).toHaveClass(
    "drift-theme-transition",
    "bg-[var(--drift-ui-overlay-track)]",
  );
  expect(screen.getByText("这是一个用于检查截断的超长用户名_Official").parentElement).toHaveClass(
    "drift-theme-transition",
  );
});

test("keeps the header fixed and puts all statistics in one scroll area", () => {
  render(<DanmakuStatsDrawer onClose={vi.fn()} stats={FILLED_STATS} />);

  const drawer = screen.getByRole("complementary", { name: "弹幕统计" });
  const header = drawer.querySelector<HTMLElement>(".overlay-drawer-header");
  const scrollArea = drawer.querySelector<HTMLElement>(".overlay-stats-scroll");
  const rankings = drawer.querySelector<HTMLElement>(".overlay-stats-rankings");
  const footer = drawer.querySelector<HTMLElement>(".overlay-drawer-footer");

  expect(header).not.toBeNull();
  expect(scrollArea).not.toBeNull();
  expect(header?.parentElement).toBe(drawer);
  expect(scrollArea?.parentElement).toBe(drawer);
  expect(scrollArea).toContainElement(screen.getByLabelText("消息概览"));
  expect(scrollArea).toContainElement(screen.getByLabelText("消息类型"));
  expect(scrollArea).toContainElement(rankings);
  expect(scrollArea).toContainElement(footer);
  expect(scrollArea).toHaveClass("min-h-0", "overflow-y-auto");
  expect(rankings).not.toHaveClass("overflow-y-auto");
});

test("renders KPI, exact counts, shares and ranking labels", () => {
  render(<DanmakuStatsDrawer onClose={vi.fn()} stats={FILLED_STATS} />);

  expect(screen.getByText("100")).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "弹幕占比" })).toHaveAttribute(
    "aria-valuenow",
    "70",
  );
  expect(screen.getByRole("progressbar", { name: "SC占比" })).toHaveAttribute(
    "aria-valuenow",
    "10",
  );
  expect(
    screen.getByText("这是一个用于检查截断的超长用户名_Official"),
  ).toHaveClass("truncate");
  expect(screen.getByText("这是一个非常长的高频词条")).toHaveClass(
    "truncate",
  );
});

test("renders zero-width shares when no messages exist", () => {
  render(
    <DanmakuStatsDrawer
      onClose={vi.fn()}
      stats={{
        ...FILLED_STATS,
        totalMessages: 0,
        kindCounts: { danmaku: 0, super_chat: 0, gift: 0, guard: 0 },
      }}
    />,
  );

  for (const progressbar of screen.getAllByRole("progressbar")) {
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
    expect(progressbar.firstElementChild).toHaveStyle({ width: "0%" });
  }
});
