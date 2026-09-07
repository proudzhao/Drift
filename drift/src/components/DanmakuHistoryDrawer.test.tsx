import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  DanmakuHistoryDrawer,
  type HistoryMessage,
} from "./DanmakuHistoryDrawer";
import type { RoomSourceOption } from "../types/roomSession";

const MESSAGES: HistoryMessage[] = [
  {
    id: "1",
    kind: "danmaku",
    user: "观众 A",
    text: "今天好可爱",
    timestamp: 1,
    sourceRoomId: 6,
    sourceAnchorName: "主播甲",
  },
  {
    id: "2",
    kind: "super_chat",
    user: "长用户名_Official",
    text: "另一条弹幕",
    timestamp: 2,
    sourceRoomId: 7,
    sourceAnchorName: "主播乙",
  },
];

const ROOM_SOURCES: RoomSourceOption[] = [
  { roomId: 6, label: "主播甲 · 6" },
  { roomId: 7, label: "主播乙 · 7" },
];

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
}

test("keeps the drawer positioned before the workspace stylesheet lands", () => {
  render(
    <DanmakuHistoryDrawer
      messages={MESSAGES}
      onClose={vi.fn()}
      roomSources={ROOM_SOURCES}
    />,
  );

  expect(screen.getByLabelText("弹幕历史")).toHaveClass(
    "absolute",
    "right-0",
    "grid",
    "w-[296px]",
    "pointer-events-auto",
    "box-border",
  );
});

test("uses shared drawer, search, row and feedback theme tokens", () => {
  render(
    <DanmakuHistoryDrawer
      messages={MESSAGES}
      onClose={vi.fn()}
      roomSources={ROOM_SOURCES}
    />,
  );

  const drawer = screen.getByLabelText("弹幕历史");
  expect(drawer).toHaveClass(
    "drift-theme-transition",
    "border-[var(--drift-ui-border)]",
    "bg-[var(--drift-ui-overlay-drawer)]",
    "text-[var(--drift-ui-ink)]",
  );
  expect(screen.getByRole("searchbox", { name: "搜索弹幕历史" })).toHaveClass(
    "border-[var(--drift-ui-border)]",
    "bg-[var(--drift-ui-overlay-surface)]",
  );
  expect(screen.getByRole("button", { name: "复制 观众 A 的弹幕" })).toHaveClass(
    "drift-theme-transition",
    "border-[var(--drift-ui-overlay-divider)]",
  );
});

test("filters by username or text and preserves empty-result copy", async () => {
  const user = userEvent.setup();
  render(
    <DanmakuHistoryDrawer
      messages={MESSAGES}
      onClose={vi.fn()}
      roomSources={ROOM_SOURCES}
    />,
  );

  await user.type(
    screen.getByRole("searchbox", { name: "搜索弹幕历史" }),
    "可爱",
  );
  expect(screen.getByText("今天好可爱")).toBeVisible();
  expect(screen.queryByText("另一条弹幕")).not.toBeInTheDocument();

  await user.clear(
    screen.getByRole("searchbox", { name: "搜索弹幕历史" }),
  );
  await user.type(
    screen.getByRole("searchbox", { name: "搜索弹幕历史" }),
    "不存在",
  );
  expect(screen.getByText("没有匹配的弹幕")).toBeVisible();
});

test("filters by room before applying search", async () => {
  const user = userEvent.setup();
  render(
    <DanmakuHistoryDrawer
      messages={MESSAGES}
      onClose={vi.fn()}
      roomSources={ROOM_SOURCES}
    />,
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "筛选直播间" }),
    "7",
  );
  expect(screen.getByText("另一条弹幕")).toBeVisible();
  expect(screen.queryByText("今天好可爱")).not.toBeInTheDocument();

  await user.type(
    screen.getByRole("searchbox", { name: "搜索弹幕历史" }),
    "另一条",
  );
  expect(screen.getByText("1 条匹配")).toBeVisible();
  expect(screen.getByText("另一条弹幕")).toBeVisible();
});

test("reports clipboard success on the selected row", async () => {
  const user = userEvent.setup();
  mockClipboard(async () => undefined);
  render(
    <DanmakuHistoryDrawer
      messages={MESSAGES}
      onClose={vi.fn()}
      roomSources={ROOM_SOURCES}
    />,
  );

  await user.click(screen.getByRole("button", { name: "复制 观众 A 的弹幕" }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    "观众 A: 今天好可爱",
  );
  expect(screen.getByText("已复制")).toBeVisible();
});

test("keeps the list and reports clipboard failure", async () => {
  const user = userEvent.setup();
  mockClipboard(async () => {
    throw new Error("clipboard denied");
  });
  render(
    <DanmakuHistoryDrawer
      messages={MESSAGES}
      onClose={vi.fn()}
      roomSources={ROOM_SOURCES}
    />,
  );

  await user.click(screen.getByRole("button", { name: "复制 观众 A 的弹幕" }));
  expect(await screen.findByText("复制失败")).toBeVisible();
  expect(screen.getByText("今天好可爱")).toBeVisible();
});

test("accepts a stable initial query for development scenarios", () => {
  render(
    <DanmakuHistoryDrawer
      initialQuery="不存在"
      messages={MESSAGES}
      onClose={vi.fn()}
      roomSources={ROOM_SOURCES}
    />,
  );
  expect(screen.getByText("没有匹配的弹幕")).toBeVisible();
});
