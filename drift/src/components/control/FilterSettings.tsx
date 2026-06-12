import { useState } from "react";
import type {
  FilterAction,
  FilterOperator,
  FilterRule,
  FilterTarget,
} from "../../types/config";

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
    <div className="settings-page filter-settings">
      <fieldset className="settings-group filter-rule-builder">
        <legend>过滤规则</legend>
        <div className="filter-rule-grid">
          <input
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="规则名称"
            value={name}
          />
          <select
            onChange={(event) => setTarget(event.currentTarget.value as FilterTarget)}
            value={target}
          >
            {Object.entries(TARGET_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
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
          </select>
          <select
            onChange={(event) => setAction(event.currentTarget.value as FilterAction)}
            value={action}
          >
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder={VALUE_PLACEHOLDERS[target]}
            value={value}
          />
          <button onClick={addRule} type="button">
            新增规则
          </button>
        </div>
        {ruleError ? <p className="control-error">{ruleError}</p> : null}
      </fieldset>

      <div className="filter-rule-list settings-scroll-list">
        {rules.length === 0 ? (
          <p className="empty-state">暂无高级规则</p>
        ) : (
          rules.map((rule) => (
            <div className="filter-rule-item" key={rule.id}>
              <label className="filter-rule-toggle">
                <input
                  checked={rule.enabled}
                  onChange={(event) =>
                    updateRule(rule.id, { enabled: event.currentTarget.checked })
                  }
                  type="checkbox"
                />
                <span>{rule.name}</span>
              </label>
              <small>
                {TARGET_LABELS[rule.target]} · {OPERATOR_LABELS[rule.operator]} ·{" "}
                {rule.value} · {ACTION_LABELS[rule.action]}
              </small>
              <button onClick={() => deleteRule(rule.id)} type="button">
                删除
              </button>
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
