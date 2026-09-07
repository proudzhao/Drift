import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  CONTROL_PAGE_SCENARIOS,
  ControlPageScenarioPreview,
  getControlPageScenario,
  type ControlPageScenarioId,
} from "./pageScenarios";

test("provides stable control page preview scenarios", () => {
  expect(CONTROL_PAGE_SCENARIOS.map((scenario) => scenario.id)).toEqual([
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
  ]);
  expect(getControlPageScenario("missing").id).toBe("default");
});

test("renders the multi-room control scenario through the real room settings", () => {
  render(<ControlPageScenarioPreview scenarioId="control-room-multi" />);

  expect(
    screen.getByText("5 个 · 已选 2/5"),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "连接已选房间" })).toBeEnabled();
  expect(screen.getByText("已连接 1 · 重连中 1 · 未开播 1 · 连接失败 1 · 已断开 1")).toBeVisible();
  expect(screen.getByText("记录中 · 2 个房间")).toBeVisible();
  expect(screen.getByText("2026-08-27-6-补给箱.txt")).toBeVisible();
  expect(screen.getByText("2026-08-27-7-小海梓.txt")).toBeVisible();
  expect(screen.getByRole("switch", { name: "加入多房间 午夜电台" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(screen.getByRole("switch", { name: "加入多房间 清晨练歌" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(screen.getByRole("switch", { name: "加入多房间 周末联机" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(screen.getByText("临时连接")).toBeVisible();
  expect(screen.getByText("巡航测试")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存房间 9527 为常用" })).toBeVisible();
});

test("shows the complete vertical policy with backlog and drops", () => {
  render(
    <ControlPageScenarioPreview scenarioId="control-display-vertical-dropped" />,
  );

  expect(
    screen.getByRole("heading", { name: "弹幕显示", level: 1 }),
  ).toBeVisible();
  expect(screen.getByRole("main")).toHaveClass("drift-control-shell");
  expect(screen.getByRole("region", { name: "外观" })).toBeVisible();
  expect(screen.getByRole("button", { name: "纵向聊天流" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "完整优先" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("积压 1240 条 · 8× 加速")).toBeVisible();
  expect(screen.getByText("本次运行已丢弃 17 条")).toBeVisible();
});

test.each<{
  expectedText: string | RegExp;
  heading: string;
  scenarioId: ControlPageScenarioId;
}>([
  {
    scenarioId: "room-empty",
    heading: "直播间",
    expectedText: "暂无常用直播间",
  },
  {
    scenarioId: "room-connected",
    heading: "直播间",
    expectedText: "已连接",
  },
  {
    scenarioId: "control-room-multi",
    heading: "直播间",
    expectedText: "记录中 · 2 个房间",
  },
  {
    scenarioId: "control-recording-disabled",
    heading: "直播间",
    expectedText: "关闭",
  },
  {
    scenarioId: "control-recording-waiting",
    heading: "直播间",
    expectedText: "等待连接",
  },
  {
    scenarioId: "control-recording-recording",
    heading: "直播间",
    expectedText: "2026-08-27-6-主播甲.txt",
  },
  {
    scenarioId: "control-recording-error",
    heading: "直播间",
    expectedText: /暂停期间的消息不会补写/,
  },
  {
    scenarioId: "account-logged-out",
    heading: "账号",
    expectedText: "未登录 B 站",
  },
  {
    scenarioId: "account-logged-in",
    heading: "账号",
    expectedText: "已登录 B 站",
  },
  {
    scenarioId: "account-qr",
    heading: "账号",
    expectedText: "已扫码，等待手机确认",
  },
  {
    scenarioId: "filters-empty",
    heading: "过滤规则",
    expectedText: "暂无过滤规则",
  },
  {
    scenarioId: "filters-long",
    heading: "过滤规则",
    expectedText: "隐藏抽奖刷屏内容",
  },
  {
    scenarioId: "control-filter-runtime-warning",
    heading: "过滤规则",
    expectedText:
      "示例主播 · 123456 的粉丝牌协议无法确认，本次连接已暂停相关规则；重新连接后重试",
  },
  {
    scenarioId: "diagnostics-expanded",
    heading: "诊断",
    expectedText: /该详情用于检查长文本展开时的换行与滚动。/,
  },
  {
    scenarioId: "update-available",
    heading: "关于",
    expectedText: "发现新版本 0.8.1",
  },
  {
    scenarioId: "update-error",
    heading: "关于",
    expectedText: "暂时无法获取更新信息，请稍后重试。",
  },
  {
    scenarioId: "control-theme-light",
    heading: "直播间",
    expectedText: "切换到暗色主题",
  },
  {
    scenarioId: "control-theme-save-error",
    heading: "直播间",
    expectedText: "主题保存失败，已恢复原主题",
  },
])("renders $scenarioId with the real $heading page", ({
  expectedText,
  heading,
  scenarioId,
}) => {
  render(<ControlPageScenarioPreview scenarioId={scenarioId} />);

  expect(screen.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  expect(
    screen.getByRole("button", {
      name:
        scenarioId === "control-theme-light"
          ? "切换到暗色主题"
          : "切换到亮色主题",
    }),
  ).toBeVisible();
  if (scenarioId !== "control-theme-light") {
    expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
  }
});

test("shows the light control scenario with the dark target action", () => {
  render(<ControlPageScenarioPreview scenarioId="control-theme-light" />);

  expect(document.documentElement.dataset.driftTheme).toBe("light");
  expect(
    screen.getByRole("button", { name: "切换到暗色主题" }),
  ).toBeVisible();
});

test("shows the save error scenario as the rolled-back dark state", () => {
  render(
    <ControlPageScenarioPreview scenarioId="control-theme-save-error" />,
  );

  expect(document.documentElement.dataset.driftTheme).toBe("dark");
  expect(
    screen.getByRole("button", { name: "切换到亮色主题" }),
  ).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "主题保存失败，已恢复原主题",
  );
});
