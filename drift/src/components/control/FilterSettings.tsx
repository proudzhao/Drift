import { useState } from "react";
import type {
  FilterAction,
  FilterOperator,
  FilterRule,
  FilterTarget,
} from "../../types/config";
import { classNames } from "../../utils/classNames";
import { Button, Input, Select, Toggle } from "../ui";

type FilterSettingsProps = {
  onRulesChange: (rules: FilterRule[]) => void;
  rules: FilterRule[];
};

const TARGET_LABELS: Record<FilterTarget, string> = {
  text: "弹幕内容",
  user: "用户名",
  messageType: "消息类型",
  giftName: "礼物名",
  guardLevel: "上舰等级",
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "包含",
  equals: "等于",
  startsWith: "开头是",
  endsWith: "结尾是",
  regex: "正则",
};

const ACTION_LABELS: Record<FilterAction, string> = {
  hide: "隐藏",
  highlight: "高亮",
};

const VALUE_PLACEHOLDERS: Record<FilterTarget, string> = {
  text: "匹配内容",
  user: "匹配用户名",
  messageType: "danmaku / super_chat / gift / guard",
  giftName: "匹配礼物名",
  guardLevel: "1 / 2 / 3",
};

export function FilterSettings({
  onRulesChange,
  rules,
}: FilterSettingsProps) {
  const [target, setTarget] = useState<FilterTarget>("text");
  const [operator, setOperator] = useState<FilterOperator>("contains");
  const [action, setAction] = useState<FilterAction>("hide");
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [ruleError, setRuleError] = useState("");

  function addRule() {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setRuleError("规则内容不能为空");
      return;
    }

    setRuleError("");
    const displayName =
      name.trim() ||
      `${TARGET_LABELS[target]} ${OPERATOR_LABELS[operator]} ${trimmedValue}`;
    onRulesChange([
      ...rules,
      {
        id: createRuleId(),
        enabled: true,
        name: displayName,
        target,
        operator,
        value: trimmedValue,
        action,
      },
    ]);
    setName("");
    setValue("");
  }

  function updateRule(ruleId: string, patch: Partial<FilterRule>) {
    onRulesChange(
      rules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    );
  }

  function deleteRule(ruleId: string) {
    onRulesChange(rules.filter((rule) => rule.id !== ruleId));
  }

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] content-stretch gap-3 overflow-hidden">
      <fieldset className="m-0 grid gap-2.5 rounded-sm border border-[#d1d1d1] bg-[#e7e7e7] px-3.5 pb-3.5 pt-3">
        <legend className="px-2 text-[11px] font-semibold text-[#333333]">
          过滤规则
        </legend>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <strong className="text-xs font-bold text-[#202124]">新增规则</strong>
          <span className="text-[10px] font-medium text-[#747c87]">
            {rules.length} 条已保存
          </span>
        </div>
        <div className="grid grid-cols-4 items-center gap-2 max-[520px]:grid-cols-2">
          <Input
            className="col-span-2"
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="规则名称"
            value={name}
          />
          <Select
            onChange={(event) => setTarget(event.currentTarget.value as FilterTarget)}
            value={target}
          >
            {Object.entries(TARGET_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) =>
              setOperator(event.currentTarget.value as FilterOperator)
            }
            value={operator}
          >
            {Object.entries(OPERATOR_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => setAction(event.currentTarget.value as FilterAction)}
            value={action}
          >
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            className="col-span-2"
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder={VALUE_PLACEHOLDERS[target]}
            value={value}
          />
          <Button
            className="min-w-0 max-[520px]:col-span-2"
            onClick={addRule}
            variant="primary"
          >
            新增规则
          </Button>
        </div>
        {ruleError ? (
          <p className="m-0 text-[11px] leading-snug text-[#b45f06]">
            {ruleError}
          </p>
        ) : null}
      </fieldset>

      <div className="settings-scroll-list grid content-start gap-2 pr-1">
        {rules.length === 0 ? (
          <div className="grid min-h-[118px] place-items-center gap-1 rounded-[7px] border border-dashed border-[#c9c9c9] bg-white/30 text-[#747c87]">
            <strong className="text-xs font-bold text-[#5f6872]">
              暂无过滤规则
            </strong>
            <span className="text-[10px] font-medium">列表为空</span>
          </div>
        ) : (
          rules.map((rule) => (
            <div
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_48px] items-center gap-2 rounded-[7px] border border-[#d3d3d3] bg-gradient-to-b from-[#f8f8f8] to-[#f0f0f0] px-2.5 py-2 shadow-drift-control max-[520px]:grid-cols-[minmax(0,1fr)_auto]"
              key={rule.id}
            >
              <div className="grid min-w-0 gap-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Toggle
                    aria-label={`启用规则 ${rule.name}`}
                    checked={rule.enabled}
                    onCheckedChange={(checked) =>
                      updateRule(rule.id, { enabled: checked })
                    }
                  />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold text-[#202124]">
                    {rule.name}
                  </span>
                </div>
                <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-medium text-[#717984]">
                  {TARGET_LABELS[rule.target]} · {OPERATOR_LABELS[rule.operator]} ·{" "}
                  {rule.value}
                </small>
              </div>
              <span
                className={classNames(
                  "min-w-[34px] rounded-full border px-1.5 py-0.5 text-center text-[10px] font-bold",
                  rule.action === "hide"
                    ? "border-[#d7b7b7] bg-[#fff1f1] text-[#9a3737]"
                    : "border-[#b8d2bf] bg-[#eef9f1] text-[#2d7a43]",
                )}
              >
                {ACTION_LABELS[rule.action]}
              </span>
              <Button
                className="max-[520px]:col-start-2"
                onClick={() => deleteRule(rule.id)}
                size="sm"
              >
                删除
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function createRuleId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
