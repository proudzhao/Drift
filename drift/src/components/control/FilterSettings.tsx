import { useState } from "react";
import type {
  FilterAction,
  FilterOperator,
  FilterRule,
  FilterTarget,
} from "../../types/config";
import { classNames } from "../../utils/classNames";
import { Button, Input, Select, Toggle } from "../ui";
import { EmptyState, SettingsPage, SettingsSection } from "./settings-ui";

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
    <SettingsPage>
      <SettingsSection
        actions={
          <span className="text-[9px] text-[#789097]">
            {rules.length} 条已保存
          </span>
        }
        title="新增规则"
      >
        <div className="grid min-w-0 grid-cols-4 gap-2 px-3 py-3 max-[519px]:grid-cols-2">
          <Input
            className="col-span-2 min-w-0"
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="规则名称"
            value={name}
          />
          <Select
            className="min-w-0"
            onChange={(event) =>
              setTarget(event.currentTarget.value as FilterTarget)
            }
            value={target}
          >
            {Object.entries(TARGET_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            className="min-w-0"
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
            className="min-w-0"
            onChange={(event) =>
              setAction(event.currentTarget.value as FilterAction)
            }
            value={action}
          >
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            className="col-span-2 min-w-0"
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder={VALUE_PLACEHOLDERS[target]}
            value={value}
          />
          <Button
            className="min-w-0 max-[519px]:col-span-2"
            onClick={addRule}
            variant="primary"
          >
            新增规则
          </Button>
        </div>
        {ruleError ? (
          <p
            className="m-0 border-t border-drift-line px-3 py-2 text-[10px] text-[var(--control-warning)]"
            role="alert"
          >
            {ruleError}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection
        actions={
          <span className="text-[9px] text-[#789097]">{rules.length} 条</span>
        }
        title="规则列表"
      >
        {rules.length === 0 ? (
          <div className="p-3">
            <EmptyState
              description="填写上方表单后新增第一条规则。"
              title="暂无过滤规则"
            />
          </div>
        ) : (
          <div className="grid min-w-0">
            {rules.map((rule) => (
              <div
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-drift-line px-3 py-2.5 first:border-t-0 max-[519px]:grid-cols-[minmax(0,1fr)_auto]"
                key={rule.id}
              >
                <div className="grid min-w-0 gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Toggle
                      aria-label={`启用规则 ${rule.name}`}
                      checked={rule.enabled}
                      onCheckedChange={(checked) =>
                        updateRule(rule.id, { enabled: checked })
                      }
                    />
                    <span className="min-w-0 truncate text-[11px] font-semibold text-drift-ink">
                      {rule.name}
                    </span>
                  </div>
                  <span className="min-w-0 truncate text-[9px] text-[#789097]">
                    {TARGET_LABELS[rule.target]} · {OPERATOR_LABELS[rule.operator]} ·{" "}
                    {rule.value}
                  </span>
                </div>
                <span
                  className={classNames(
                    "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold",
                    rule.action === "hide"
                      ? "border-[rgba(224,108,117,0.45)] bg-[rgba(224,108,117,0.1)] text-[#f2a7ad]"
                      : "border-[rgba(50,199,217,0.4)] bg-[rgba(50,199,217,0.08)] text-[#8ce8f0]",
                  )}
                >
                  {ACTION_LABELS[rule.action]}
                </span>
                <Button
                  className="max-[519px]:col-start-2"
                  onClick={() => deleteRule(rule.id)}
                  size="sm"
                  variant="danger"
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

function createRuleId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
