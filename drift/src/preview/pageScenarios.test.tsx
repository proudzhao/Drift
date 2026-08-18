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
    "account-logged-out",
    "account-logged-in",
    "account-qr",
    "filters-empty",
    "filters-long",
    "diagnostics-expanded",
    "update-available",
    "update-error",
  ]);
  expect(getControlPageScenario("missing").id).toBe("default");
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
    scenarioId: "diagnostics-expanded",
    heading: "诊断",
    expectedText: /该详情用于检查长文本展开时的换行与滚动。/,
  },
  {
    scenarioId: "update-available",
    heading: "关于",
    expectedText: "发现新版本 0.7.1",
  },
  {
    scenarioId: "update-error",
    heading: "关于",
    expectedText: "暂时无法获取更新信息，请稍后重试。",
  },
])("renders $scenarioId with the real $heading page", ({
  expectedText,
  heading,
  scenarioId,
}) => {
  render(<ControlPageScenarioPreview scenarioId={scenarioId} />);

  expect(screen.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
});
