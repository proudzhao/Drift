import { render, screen, within } from "@testing-library/react";
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
  expect(PREVIEW_SCENARIOS).toHaveLength(49);
  expect(PREVIEW_SCENARIOS.map((scenario) => scenario.id)).toEqual([
    "default",
    "room-empty",
    "room-connected",
    "control-room-multi",
    "control-recording-disabled",
    "control-recording-waiting",
    "control-recording-recording",
    "control-recording-error",
    "account-logged-out",
    "account-logged-in",
    "account-qr",
    "filters-empty",
    "filters-long",
    "control-filter-runtime-warning",
    "diagnostics-expanded",
    "update-available",
    "update-error",
    "control-theme-light",
    "control-theme-save-error",
    "control-display-vertical-dropped",
    "send-ready",
    "send-multi-room-targets",
    "send-unavailable",
    "send-cooldown",
    "send-sending",
    "send-success",
    "send-error",
    "send-over-limit",
    "send-long-content",
    "send-theme-light",
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
    scenarioId: "send-multi-room-targets",
    expectedText: "房间 7 发送已就绪",
  },
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
  { scenarioId: "send-theme-light", expectedText: "准备发送" },
])(
  "renders $scenarioId through the real send view",
  ({ scenarioId, expectedText }) => {
    render(<PreviewScenario scenarioId={scenarioId} />);
    expect(screen.getByRole("main")).toHaveClass("drift-send-shell");
    expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
  },
);

test("renders the multi-room send scenario with room 7 selected", () => {
  render(<PreviewScenario scenarioId="send-multi-room-targets" />);

  const select = screen.getByRole("combobox", { name: "发送目标直播间" });
  const options = within(select).getAllByRole("option");
  const connectedOptions = options.filter((option) => option.getAttribute("value"));

  expect(select).toHaveValue("7");
  expect(options.map((option) => option.getAttribute("value"))).toEqual([
    "",
    "6",
    "7",
  ]);
  expect(connectedOptions).toHaveLength(2);
  expect(connectedOptions.map((option) => option.textContent)).toEqual([
    "补给箱 · 6",
    "小海梓 · 7",
  ]);
  expect((connectedOptions[1] as HTMLOptionElement).selected).toBe(true);
  expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
});

test("fits the light send preview to the exact viewport and makes the dark 460px boundary inclusive", () => {
  const light = render(<PreviewScenario scenarioId="send-theme-light" />);
  const lightFrame = screen.getByRole("main").parentElement;
  const lightCanvas = lightFrame?.parentElement;

  expect(lightFrame).toHaveClass("h-[132px]", "w-full", "max-w-[460px]");
  expect(lightCanvas).toHaveClass("h-screen", "w-screen", "overflow-hidden");
  expect(lightCanvas).not.toHaveClass("p-6");

  light.unmount();

  render(<PreviewScenario scenarioId="send-ready" />);
  const darkFrame = screen.getByRole("main").parentElement;
  const darkCanvas = darkFrame?.parentElement;

  expect(darkFrame).toHaveClass("h-[132px]", "w-full", "max-w-[460px]");
  expect(darkCanvas).toHaveClass(
    "w-screen",
    "overflow-auto",
    "bg-[linear-gradient(135deg,#344b55,#16262e)]",
    "p-6",
    "max-[461px]:overflow-hidden",
    "max-[461px]:p-0",
  );
});

test.each<{ expectedText: string; scenarioId: PreviewScenarioId }>([
  {
    scenarioId: "control-theme-light",
    expectedText: "切换到暗色主题",
  },
  {
    scenarioId: "control-theme-save-error",
    expectedText: "主题保存失败，已恢复原主题",
  },
  { scenarioId: "send-theme-light", expectedText: "准备发送" },
  { scenarioId: "overlay-theme-light", expectedText: "弹幕编辑工作台" },
])(
  "renders the fixed $scenarioId theme preview",
  ({ scenarioId, expectedText }) => {
    render(<PreviewScenario scenarioId={scenarioId} />);
    if (scenarioId === "control-theme-light") {
      expect(
        screen.getByRole("button", { name: expectedText }),
      ).toBeVisible();
    } else if (scenarioId === "overlay-theme-light") {
      expect(screen.getByLabelText(expectedText)).toBeVisible();
    } else {
      expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
    }
  },
);
