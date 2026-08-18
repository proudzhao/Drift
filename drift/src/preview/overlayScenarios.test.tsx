import { render, screen } from "@testing-library/react";
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
    "overlay-mock-idle",
    "overlay-mock-active",
    "overlay-history-empty",
    "overlay-history-filled",
    "overlay-history-search-empty",
    "overlay-stats-empty",
    "overlay-stats-filled",
    "overlay-narrow-history",
    "overlay-narrow-stats",
  ]);
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
  expect(screen.getByText("100")).toBeInTheDocument();
});
