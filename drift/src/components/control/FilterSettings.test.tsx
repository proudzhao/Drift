import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { FilterRule } from "../../types/config";
import {
  EMPTY_FILTER_RUNTIME_STATUS,
  type FilterRuntimeStatus,
} from "../../types/filterRuntime";
import { FilterSettings } from "./FilterSettings";

const RUNTIME_STATUS: FilterRuntimeStatus = {
  roomId: 6,
  pausedFanMedalRuleIds: ["fan-only"],
  pauseReason: "fan_medal_protocol_unknown",
};

test("shows grouped empty state and rejects empty rule values", async () => {
  const user = userEvent.setup();
  render(
    <FilterSettings
      onRulesChange={vi.fn()}
      rules={[]}
      runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
    />,
  );

  await user.click(screen.getByRole("button", { name: "新增规则" }));

  expect(screen.getByRole("alert")).toHaveTextContent("规则内容不能为空");
  expect(screen.getByRole("region", { name: "新增规则" })).toBeVisible();
  expect(screen.getByText("暂无过滤规则")).toBeVisible();
  expect(
    screen.getByText("填写上方表单后新增第一条规则。"),
  ).toBeVisible();
  for (const select of screen.getAllByRole("combobox")) {
    expect(select).toHaveClass("min-w-0");
  }
  expect(
    within(screen.getByRole("combobox", { name: "规则目标" }))
      .getAllByRole("option")
      .map((option) => option.getAttribute("value")),
  ).toEqual(["text", "user", "senderUid", "currentRoomFanMedal"]);
  expect(
    screen.queryByRole("combobox", { name: "最近发言用户" }),
  ).not.toBeInTheDocument();
});

test("keeps rule creation, toggling, and deletion with complete arrays", async () => {
  const user = userEvent.setup();
  const onRulesChange = vi.fn();
  const { rerender } = render(
    <FilterSettings
      onRulesChange={onRulesChange}
      rules={[]}
      runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
    />,
  );

  await user.type(screen.getByPlaceholderText("规则名称"), "隐藏关键词");
  const selects = screen.getAllByRole("combobox");
  await user.selectOptions(selects[0], "user");
  await user.selectOptions(selects[1], "equals");
  await user.selectOptions(selects[2], "highlight");
  await user.type(screen.getByPlaceholderText("匹配用户名"), "Alice");
  await user.click(screen.getByRole("button", { name: "新增规则" }));

  const createdRules = onRulesChange.mock.calls[0][0] as FilterRule[];
  expect(createdRules).toEqual([
    {
      id: expect.any(String),
      enabled: true,
      name: "隐藏关键词",
      target: "user",
      operator: "equals",
      value: "Alice",
      action: "highlight",
    },
  ]);

  onRulesChange.mockClear();
  rerender(
    <FilterSettings
      onRulesChange={onRulesChange}
      rules={createdRules}
      runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
    />,
  );
  await user.click(
    screen.getByRole("switch", { name: "启用规则 隐藏关键词" }),
  );
  const disabledRules = onRulesChange.mock.calls[0][0] as FilterRule[];
  expect(disabledRules).toEqual([{ ...createdRules[0], enabled: false }]);

  onRulesChange.mockClear();
  rerender(
    <FilterSettings
      onRulesChange={onRulesChange}
      rules={disabledRules}
      runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
    />,
  );
  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(onRulesChange).toHaveBeenCalledWith([]);
});

test("truncates long rule names and values in narrow layouts", () => {
  const longName = "一条很长很长不会撑开控制窗口的过滤规则名称";
  const longValue = "一段很长很长不会撑开控制窗口的匹配内容";
  render(
    <FilterSettings
      onRulesChange={vi.fn()}
      rules={[
        {
          id: "long-rule",
          enabled: true,
          name: longName,
          target: "text",
          operator: "contains",
          value: longValue,
          action: "hide",
        },
      ]}
      runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
    />,
  );

  expect(screen.getByText(longName)).toHaveClass("truncate");
  expect(screen.getByText(new RegExp(longValue))).toHaveClass("truncate");
  expect(screen.getByRole("button", { name: "删除" })).toHaveClass(
    "bg-drift-danger-bg",
  );
});

test("creates a manual UID rule with fixed equals matching", async () => {
  const user = userEvent.setup();
  const onRulesChange = vi.fn();
  const fanRule: FilterRule = {
    id: "fan-only",
    enabled: true,
    name: "只看本房牌",
    target: "currentRoomFanMedal",
    operator: "equals",
    value: "no",
    action: "hide",
  };
  render(
    <FilterSettings
      onRulesChange={onRulesChange}
      rules={[fanRule]}
      runtimeStatus={RUNTIME_STATUS}
    />,
  );

  const target = screen.getByRole("combobox", { name: "规则目标" });
  expect(target).toHaveTextContent("用户 UID");
  expect(target).toHaveTextContent("本房粉丝牌");

  await user.selectOptions(target, "senderUid");
  expect(screen.getByRole("combobox", { name: "匹配方式" })).toHaveValue(
    "equals",
  );
  await user.type(screen.getByRole("textbox", { name: "规则值" }), "42");
  expect(screen.getByRole("textbox", { name: "规则值" })).toHaveValue("42");

  await user.click(screen.getByRole("button", { name: "新增规则" }));
  expect(onRulesChange).toHaveBeenCalledWith([
    fanRule,
    expect.objectContaining({
      target: "senderUid",
      operator: "equals",
      value: "42",
    }),
  ]);
  const savedRule = onRulesChange.mock.calls[0][0][1] as FilterRule;
  expect(Object.keys(savedRule).sort()).toEqual(
    ["action", "enabled", "id", "name", "operator", "target", "value"].sort(),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "本次连接已暂停相关规则",
  );
});

test("keeps text operators and constrains fan medal rules", async () => {
  const user = userEvent.setup();
  render(
    <FilterSettings
      onRulesChange={vi.fn()}
      rules={[]}
      runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
    />,
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "规则目标" }),
    "text",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "匹配方式" }),
    "endsWith",
  );
  expect(screen.getByRole("combobox", { name: "匹配方式" })).toHaveValue(
    "endsWith",
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "规则目标" }),
    "currentRoomFanMedal",
  );
  expect(screen.getByRole("combobox", { name: "匹配方式" })).toHaveValue(
    "equals",
  );
  expect(screen.getByRole("combobox", { name: "粉丝牌状态" })).toHaveValue(
    "no",
  );
  expect(
    screen.getByRole("combobox", { name: "粉丝牌状态" }),
  ).toHaveTextContent("已佩戴");
  expect(
    screen.getByRole("combobox", { name: "粉丝牌状态" }),
  ).toHaveTextContent("未佩戴");
});

test.each(["0", "-1", "1.5", "1e3", "abc"])(
  "rejects invalid manual UID %s",
  async (invalidUid) => {
    const user = userEvent.setup();
    const onRulesChange = vi.fn();
    render(
      <FilterSettings
        onRulesChange={onRulesChange}
        rules={[]}
        runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "规则目标" }),
      "senderUid",
    );
    await user.type(screen.getByRole("textbox", { name: "规则值" }), invalidUid);
    await user.click(screen.getByRole("button", { name: "新增规则" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "UID 必须是大于 0 的十进制整数",
    );
    expect(onRulesChange).not.toHaveBeenCalled();
  },
);

test("only warns for paused enabled fan medal rules", () => {
  const fanRule: FilterRule = {
    id: "fan-only",
    enabled: true,
    name: "只看本房牌",
    target: "currentRoomFanMedal",
    operator: "equals",
    value: "no",
    action: "hide",
  };
  const { rerender } = render(
    <FilterSettings
      onRulesChange={vi.fn()}
      rules={[fanRule]}
      runtimeStatus={RUNTIME_STATUS}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "本次连接已暂停相关规则",
  );

  rerender(
    <FilterSettings
      onRulesChange={vi.fn()}
      rules={[{ ...fanRule, enabled: false }]}
      runtimeStatus={RUNTIME_STATUS}
    />,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("distinguishes enabled valid followed user rules from generic highlights", () => {
  const rules: FilterRule[] = [
    {
      id: "followed",
      enabled: true,
      name: "关注 Alice",
      target: "senderUid",
      operator: "equals",
      value: "42",
      action: "highlight",
    },
    {
      id: "disabled-followed",
      enabled: false,
      name: "停用关注 Bob",
      target: "senderUid",
      operator: "equals",
      value: "7",
      action: "highlight",
    },
    {
      id: "invalid-followed",
      enabled: true,
      name: "无效关注",
      target: "senderUid",
      operator: "equals",
      value: "0",
      action: "highlight",
    },
    {
      id: "generic",
      enabled: true,
      name: "关键词高亮",
      target: "text",
      operator: "contains",
      value: "关键词",
      action: "highlight",
    },
  ];

  render(
    <FilterSettings
      onRulesChange={vi.fn()}
      rules={rules}
      runtimeStatus={EMPTY_FILTER_RUNTIME_STATUS}
    />,
  );

  const ruleList = within(screen.getByRole("region", { name: "规则列表" }));
  expect(ruleList.getAllByText("关注高亮")).toHaveLength(1);
  expect(ruleList.getAllByText("高亮")).toHaveLength(3);
  expect(ruleList.getByText("关注高亮")).toHaveClass(
    "border-[var(--drift-ui-followed-border)]",
    "bg-[var(--drift-ui-followed-soft)]",
    "text-[var(--drift-ui-followed)]",
  );
});
