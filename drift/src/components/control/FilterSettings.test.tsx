import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { FilterRule } from "../../types/config";
import { FilterSettings } from "./FilterSettings";

test("shows grouped empty state and rejects empty rule values", async () => {
  const user = userEvent.setup();
  render(<FilterSettings onRulesChange={vi.fn()} rules={[]} />);

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
});

test("keeps rule creation, toggling, and deletion with complete arrays", async () => {
  const user = userEvent.setup();
  const onRulesChange = vi.fn();
  const { rerender } = render(
    <FilterSettings onRulesChange={onRulesChange} rules={[]} />,
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
    <FilterSettings onRulesChange={onRulesChange} rules={createdRules} />,
  );
  await user.click(
    screen.getByRole("switch", { name: "启用规则 隐藏关键词" }),
  );
  const disabledRules = onRulesChange.mock.calls[0][0] as FilterRule[];
  expect(disabledRules).toEqual([{ ...createdRules[0], enabled: false }]);

  onRulesChange.mockClear();
  rerender(
    <FilterSettings onRulesChange={onRulesChange} rules={disabledRules} />,
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
    />,
  );

  expect(screen.getByText(longName)).toHaveClass("truncate");
  expect(screen.getByText(new RegExp(longValue))).toHaveClass("truncate");
  expect(screen.getByRole("button", { name: "删除" })).toHaveClass(
    "bg-drift-danger-bg",
  );
});
