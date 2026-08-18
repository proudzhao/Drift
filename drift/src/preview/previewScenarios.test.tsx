import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  PREVIEW_SCENARIOS,
  PreviewScenario,
  PreviewScenarioPicker,
  getPreviewScenario,
  type PreviewScenarioId,
} from "./previewScenarios";

test("combines control, send, and overlay preview scenarios", () => {
  expect(PREVIEW_SCENARIOS.map((scenario) => scenario.id)).toEqual([
    "default",
    "room-empty",
    "room-connected",
    "account-logged-out",
    "account-logged-in",
    "account-qr",
    "filters-empty",
    "filters-long",
    "diagnostics-expanded",
    "update-available",
    "update-error",
    "send-ready",
    "send-unavailable",
    "send-cooldown",
    "send-sending",
    "send-success",
    "send-error",
    "send-over-limit",
    "send-long-content",
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
  expect(getPreviewScenario("missing").id).toBe("default");
});

test("keeps the combined picker collapsed and reports a send selection", async () => {
  const user = userEvent.setup();
  const onScenarioChange = vi.fn();
  render(
    <PreviewScenarioPicker
      onScenarioChange={onScenarioChange}
      selectedScenarioId="default"
    />,
  );

  expect(screen.getByText("开发场景").closest("details")).not.toHaveAttribute(
    "open",
  );
  await user.click(screen.getByText("开发场景"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "开发预览场景" }),
    "send-error",
  );
  expect(onScenarioChange).toHaveBeenCalledWith("send-error");
});

test.each<{ expectedText: string; scenarioId: PreviewScenarioId }>([
  { scenarioId: "send-ready", expectedText: "准备发送" },
  {
    scenarioId: "send-unavailable",
    expectedText: "请先登录 B 站并连接直播间",
  },
  {
    scenarioId: "send-cooldown",
    expectedText: "已发送，稍后可继续发送",
  },
  { scenarioId: "send-sending", expectedText: "发送中" },
  { scenarioId: "send-success", expectedText: "发送成功" },
  {
    scenarioId: "send-error",
    expectedText: "Error: 发送失败，请检查网络后重试",
  },
  { scenarioId: "send-over-limit", expectedText: "超出 3 字" },
  {
    scenarioId: "send-long-content",
    expectedText:
      "该长错误文案用于检查状态轨道的截断和固定高度，并确认持续增长的错误详情不会改变窗口尺寸",
  },
])(
  "renders $scenarioId through the real send view",
  ({ scenarioId, expectedText }) => {
    render(<PreviewScenario scenarioId={scenarioId} />);
    expect(screen.getByRole("main")).toHaveClass("drift-send-shell");
    expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
  },
);
