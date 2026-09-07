import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, test, vi } from "vitest";
import {
  OVERLAY_SCENARIOS,
  OverlayScenarioPreview,
  type OverlayScenarioId,
} from "./overlayScenarios";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

test("provides all stable overlay workspace scenarios", () => {
  expect(OVERLAY_SCENARIOS.map((scenario) => scenario.id)).toEqual([
    "overlay-edit-basic",
    "overlay-followed-messages",
    "overlay-horizontal-multi-room",
    "overlay-mock-idle",
    "overlay-mock-active",
    "overlay-history-empty",
    "overlay-history-filled",
    "overlay-history-search-empty",
    "overlay-history-room-filter",
    "overlay-stats-empty",
    "overlay-stats-filled",
    "overlay-stats-room-filter",
    "overlay-narrow-history",
    "overlay-narrow-stats",
    "overlay-theme-light",
    "overlay-vertical-multi-room",
    "overlay-vertical-mixed",
    "overlay-vertical-backlog",
    "overlay-vertical-long",
  ]);
});

test("renders the multi-room horizontal overlay with two source labels and one unlabeled message", () => {
  const { container } = render(
    <OverlayScenarioPreview scenarioId="overlay-horizontal-multi-room" />,
  );

  expect(screen.getByText("补给箱")).toHaveClass("danmaku-room-source");
  expect(screen.getByText("小海梓")).toHaveClass("danmaku-room-source");
  const horizontalLeftColor = screen
    .getByText("补给箱")
    .getAttribute("data-source-color");
  const horizontalRightColor = screen
    .getByText("小海梓")
    .getAttribute("data-source-color");
  expect(horizontalLeftColor).toMatch(/^[0-4]$/);
  expect(horizontalRightColor).toMatch(/^[0-4]$/);
  expect(horizontalLeftColor).not.toBe(horizontalRightColor);
  expect(container.querySelectorAll(".danmaku-room-source")).toHaveLength(2);
  expect(screen.getByText("普通观众:")).toBeInTheDocument();
  expect(screen.getByText("无标签消息保持语义")).toBeInTheDocument();
  expect(screen.getByText("粉丝牌样式保持").closest(".danmaku")).toHaveStyle({
    "--username-color": "#bd6686",
  });
  expect(screen.getByText("SC ¥30")).toBeInTheDocument();
  expect(
    screen.getByText("关注 SC 样式保持").closest(".danmaku"),
  ).toHaveClass("is-followed");
});

test("renders the multi-room vertical overlay with two source labels and one unlabeled message", () => {
  const { container } = render(
    <OverlayScenarioPreview scenarioId="overlay-vertical-multi-room" />,
  );

  expect(screen.getByLabelText("Drift vertical chat").parentElement).toHaveStyle({
    height: "220px",
    width: "560px",
  });
  expect(screen.getByText("补给箱")).toHaveClass("danmaku-room-source");
  expect(screen.getByText("小海梓")).toHaveClass("danmaku-room-source");
  const verticalLeftColor = screen
    .getByText("补给箱")
    .getAttribute("data-source-color");
  const verticalRightColor = screen
    .getByText("小海梓")
    .getAttribute("data-source-color");
  expect(verticalLeftColor).toMatch(/^[0-4]$/);
  expect(verticalRightColor).toMatch(/^[0-4]$/);
  expect(verticalLeftColor).not.toBe(verticalRightColor);
  expect(container.querySelectorAll(".danmaku-room-source")).toHaveLength(2);
  expect(screen.getByText("无标签消息保持语义")).toBeInTheDocument();
  expect(
    container.querySelector('[data-message-id="vertical-multi-room-medal"]'),
  ).toHaveStyle({ "--username-color": "#bd6686" });
  expect(
    container.querySelector('[data-message-id="vertical-multi-room-followed-sc"]'),
  ).toHaveClass("is-followed");
  expect(screen.getByText("SC ¥30")).toBeInTheDocument();
});

test("renders the mixed vertical fixture through the real overlay", () => {
  const { container } = render(
    <OverlayScenarioPreview scenarioId="overlay-vertical-mixed" />,
  );

  expect(container.querySelector(".vertical-chat-danmaku")).toBeInTheDocument();
  expect(container.querySelector(".vertical-chat-super_chat")).toHaveStyle({
    "--super-chat-color": "#e2b52b",
  });
  expect(container.querySelector(".vertical-chat-gift")).toBeInTheDocument();
  expect(container.querySelector(".vertical-chat-guard")).toBeInTheDocument();
  expect(
    container.querySelector('[data-message-id="vertical-mixed-default"]'),
  ).toHaveStyle({ "--username-color": "#c7d0d9" });
  expect(
    container.querySelector('[data-message-id="vertical-mixed-medal"]'),
  ).toHaveStyle({ "--username-color": "#bd6686" });
  expect(
    container.querySelector('[data-message-id="vertical-mixed-combined"]'),
  ).toHaveStyle({ "--username-color": "#ff6fbe" });
  expect(
    container.querySelector('[data-message-id="vertical-mixed-gift"]'),
  ).toHaveTextContent("giftUser: 送出 小花 × 5");
  expect(
    container.querySelector('[data-message-id="vertical-mixed-guard"]'),
  ).toHaveTextContent("guardUser: 开通 舰长");
  expect(screen.getByText("SC ¥100")).toBeInTheDocument();
  expect(screen.getAllByText(/followedUser/)).toHaveLength(2);
  expect(
    container.querySelector('[data-message-id="vertical-mixed-super-chat"]'),
  ).toHaveClass("is-followed");
  expect(
    container.querySelector('[data-message-id="vertical-mixed-super-chat"]'),
  ).not.toHaveClass("is-highlighted", "is-self");
  expect(
    container.querySelector('[data-message-id="vertical-mixed-combined"]'),
  ).toHaveTextContent("普通弹幕 文本结尾");
  expect(
    container.querySelector('[data-message-id="vertical-mixed-combined"]'),
  ).toHaveClass(
    "is-followed",
    "is-highlighted",
    "is-self",
  );
  expect(screen.getByAltText("[微笑]")).toBeInTheDocument();
  expect(screen.getByLabelText("Drift vertical chat").parentElement).toHaveStyle({
    "--danmaku-font-size": "14px",
    height: "220px",
    width: "1280px",
  });
  expect(
    [...container.querySelectorAll(".vertical-chat-message")].map((row) =>
      row.getAttribute("data-message-id"),
    ),
  ).toEqual([
    "vertical-mixed-default",
    "vertical-mixed-medal",
    "vertical-mixed-combined",
    "vertical-mixed-super-chat",
    "vertical-mixed-gift",
    "vertical-mixed-guard",
  ]);
});

test("keeps the complete long vertical message in the narrow fixture", () => {
  render(<OverlayScenarioPreview scenarioId="overlay-vertical-long" />);

  expect(
    screen.getByText(
      "这是一条需要完整换行的中文消息 EnglishLongTokenWithoutSpaces https://example.com/very/long/path",
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Drift vertical chat").parentElement).toHaveStyle({
    "--danmaku-font-size": "14px",
    height: "160px",
    width: "320px",
  });
  expect(document.documentElement.dataset.driftTheme).toBe("light");
});

test("combines the edit workspace and real vertical overlay in backlog", () => {
  render(<OverlayScenarioPreview scenarioId="overlay-vertical-backlog" />);

  expect(screen.getByLabelText("弹幕编辑工作台")).toBeInTheDocument();
  expect(screen.getByLabelText("Drift vertical chat")).toBeInTheDocument();
  expect(screen.getByText("积压消息 18")).toBeInTheDocument();
  expect(
    [...document.querySelectorAll(".vertical-chat-message")].map((row) =>
      row.getAttribute("data-message-id"),
    ),
  ).toEqual(
    Array.from({ length: 18 }, (_, index) => `vertical-backlog-${index + 1}`),
  );
  expect(screen.getByLabelText("Drift vertical chat").parentElement).toHaveStyle({
    height: "220px",
    width: "560px",
  });
});

test("renders followed messages through the real overlay", () => {
  const { container } = render(
    <OverlayScenarioPreview scenarioId="overlay-followed-messages" />,
  );

  expect(container.querySelectorAll(".danmaku.is-followed")).toHaveLength(5);
  expect(container.querySelectorAll(".danmaku.is-self")).toHaveLength(1);
  expect(screen.getByText("SC ¥100")).toBeInTheDocument();
  expect(screen.getByText("本人、关注和普通高亮组合").closest(".danmaku")).toHaveClass(
    "is-followed",
    "is-highlighted",
    "is-self",
  );
});

test("keeps all real message classes in the light workspace scenario", () => {
  const { container } = render(
    <OverlayScenarioPreview scenarioId="overlay-theme-light" />,
  );

  expect(document.documentElement.dataset.driftTheme).toBe("light");
  expect(screen.getByLabelText("弹幕编辑工作台")).toHaveClass(
    "drift-overlay-workspace",
  );
  expect(container.querySelectorAll(".danmaku.is-followed")).toHaveLength(5);
  expect(container.querySelector(".danmaku-danmaku")).toBeInTheDocument();
  expect(container.querySelector(".danmaku-super_chat")).toHaveStyle({
    "--super-chat-color": "#e2b52b",
  });
  expect(container.querySelector(".danmaku-gift")).toBeInTheDocument();
  expect(container.querySelector(".danmaku-guard")).toBeInTheDocument();
  expect(container.querySelector(".danmaku.is-self")).toHaveClass(
    "is-followed",
    "is-highlighted",
  );
});

test.each<OverlayScenarioId>(OVERLAY_SCENARIOS.map((scenario) => scenario.id))(
  "renders %s through the real workspace",
  (scenarioId) => {
    render(<OverlayScenarioPreview scenarioId={scenarioId} />);
    expect(screen.getByLabelText("弹幕编辑工作台")).toHaveClass(
      "drift-overlay-workspace",
    );
  },
);

test.each([
  "overlay-narrow-history",
  "overlay-narrow-stats",
] satisfies OverlayScenarioId[])("uses the narrow viewport for %s", (scenarioId) => {
  render(<OverlayScenarioPreview scenarioId={scenarioId} />);
  expect(screen.getByLabelText("弹幕编辑工作台").parentElement).toHaveStyle({
    height: "160px",
    width: "320px",
  });
});

test("uses the wide viewport for a regular overlay scenario", () => {
  render(<OverlayScenarioPreview scenarioId="overlay-edit-basic" />);
  const viewport = screen.getByLabelText("弹幕编辑工作台").parentElement;
  expect(viewport).toHaveStyle({
    height: "220px",
    width: "1280px",
  });
  expect(viewport).toHaveClass("max-h-[100vh]", "max-w-[100vw]");
  expect(viewport?.parentElement).toHaveClass("h-screen", "w-screen");
  expect(viewport?.parentElement).not.toHaveClass("p-6");
});

test("provides idle and active mock states", () => {
  const idle = render(
    <OverlayScenarioPreview scenarioId="overlay-mock-idle" />,
  );
  expect(screen.getByText("Mock · 已停止")).toBeInTheDocument();
  idle.unmount();

  render(<OverlayScenarioPreview scenarioId="overlay-mock-active" />);
  expect(screen.getByText("Mock · 运行中")).toBeInTheDocument();
  expect(screen.getByText("已生成 1,248 条")).toBeInTheDocument();
});

test("provides empty, filled, and unmatched history states", () => {
  const empty = render(
    <OverlayScenarioPreview scenarioId="overlay-history-empty" />,
  );
  expect(screen.getByText("暂无弹幕")).toBeInTheDocument();
  empty.unmount();

  const filled = render(
    <OverlayScenarioPreview scenarioId="overlay-history-filled" />,
  );
  expect(screen.getByText("观众 A")).toBeInTheDocument();
  expect(screen.getByText("用于检查截断的超长用户名_Official")).toBeInTheDocument();
  filled.unmount();

  render(
    <OverlayScenarioPreview
      scenarioId="overlay-history-search-empty"
    />,
  );
  expect(screen.getByRole("searchbox", { name: "搜索弹幕历史" })).toHaveValue(
    "不会匹配任何消息",
  );
  expect(screen.getByText("没有匹配的弹幕")).toBeInTheDocument();
});

test("keeps room 6 and room 7 filters reachable in the history drawer fixture", async () => {
  const user = userEvent.setup();
  render(<OverlayScenarioPreview scenarioId="overlay-history-room-filter" />);

  const select = screen.getByRole("combobox", { name: "筛选直播间" });
  expect(select).toHaveValue("all");
  expect(screen.getByRole("option", { name: "主播甲 · 6" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "主播乙 · 7" })).toBeInTheDocument();

  await user.selectOptions(select, "6");
  expect(screen.getByText("房间 6 的第三条固定消息")).toBeVisible();
  expect(screen.queryByText("房间 7 的第三条固定消息")).not.toBeInTheDocument();

  await user.selectOptions(select, "7");
  expect(screen.getByText("房间 7 的第三条固定消息")).toBeVisible();
  expect(screen.queryByText("房间 6 的第三条固定消息")).not.toBeInTheDocument();
});

test.each([
  "overlay-history-filled",
  "overlay-narrow-history",
] satisfies OverlayScenarioId[])(
  "provides a scrollable long history fixture for %s",
  (scenarioId) => {
    render(<OverlayScenarioPreview scenarioId={scenarioId} />);
    expect(
      screen.getAllByRole("button", { name: /^复制 / }),
    ).toHaveLength(20);
    expect(
      screen.getByText("用于检查截断的超长用户名_Official"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("这是一条用于检查历史列表长内容截断的弹幕"),
    ).toBeInTheDocument();
  },
);

test("provides empty and filled statistics", () => {
  const empty = render(
    <OverlayScenarioPreview scenarioId="overlay-stats-empty" />,
  );
  expect(screen.getByText("暂无用户")).toBeInTheDocument();
  expect(screen.getByText("暂无高频词")).toBeInTheDocument();
  empty.unmount();

  render(<OverlayScenarioPreview scenarioId="overlay-stats-filled" />);
  expect(screen.getByText("用于检查截断的超长用户名_Official")).toBeInTheDocument();
  expect(screen.getByText("超长高频词条用于检查截断")).toBeInTheDocument();
  expectTotalMessagesTileValue("100");
});

test("keeps room 6 and room 7 totals stable in the scoped stats fixture", async () => {
  const user = userEvent.setup();
  render(<OverlayScenarioPreview scenarioId="overlay-stats-room-filter" />);

  const select = screen.getByRole("combobox", { name: "筛选直播间" });
  expect(select).toHaveValue("all");
  expectTotalMessagesTileValue("9");

  await user.selectOptions(select, "6");
  expectTotalMessagesTileValue("6");

  await user.selectOptions(select, "7");
  expectTotalMessagesTileValue("3");
});

function expectTotalMessagesTileValue(value: string) {
  const label = screen.getByText("总消息");
  const tile = label.closest("div");

  expect(tile).not.toBeNull();
  expect(within(tile as HTMLDivElement).getByText(value, { selector: "strong" })).toBeInTheDocument();
}
