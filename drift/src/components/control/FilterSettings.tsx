import { useState } from "react";
import type {
  FilterAction,
  FilterOperator,
  FilterRule,
  FilterTarget,
} from "../../types/config";
import type { FilterRuntimeStatus } from "../../types/filterRuntime";
import { classNames } from "../../utils/classNames";
import { Button, Input, Select, Toggle } from "../ui";
import { EmptyState, SettingsPage, SettingsSection } from "./settings-ui";

type FilterSettingsProps = {
  onRulesChange: (rules: FilterRule[]) => void;
  rules: FilterRule[];
  runtimeStatus: FilterRuntimeStatus;
};

const TARGET_LABELS: Record<FilterTarget, string> = {
  text: "弹幕内容",
  user: "用户名",
  senderUid: "用户 UID",
  currentRoomFanMedal: "本房粉丝牌",
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
  senderUid: "输入用户 UID",
  currentRoomFanMedal: "yes / no",
};

function isFollowedUserRule(rule: FilterRule) {
  return (
    rule.enabled &&
    rule.target === "senderUid" &&
    rule.operator === "equals" &&
    rule.action === "highlight" &&
    /^[1-9]\d*$/.test(rule.value.trim())
  );
}

export function FilterSettings({
  onRulesChange,
  rules,
  runtimeStatus,
}: FilterSettingsProps) {
  const [target, setTarget] = useState<FilterTarget>("text");
  const [operator, setOperator] = useState<FilterOperator>("contains");
  const [action, setAction] = useState<FilterAction>("hide");
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [ruleError, setRuleError] = useState("");
  const hasPausedFanMedalRule = rules.some(
    (rule) =>
      rule.enabled &&
      rule.target === "currentRoomFanMedal" &&
      runtimeStatus.pausedFanMedalRuleIds.includes(rule.id),
  );

  function changeTarget(nextTarget: FilterTarget) {
    setTarget(nextTarget);
    setRuleError("");
    if (nextTarget === "senderUid") {
      setOperator("equals");
    } else if (nextTarget === "currentRoomFanMedal") {
      setOperator("equals");
      setValue("no");
    }
  }

  function addRule() {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setRuleError("规则内容不能为空");
      return;
    }
    if (target === "senderUid" && !/^[1-9]\d*$/.test(trimmedValue)) {
      setRuleError("UID 必须是大于 0 的十进制整数");
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
      {hasPausedFanMedalRule ? (
        <p
          className="drift-theme-transition m-0 rounded-lg border border-[var(--drift-ui-warning-border)] bg-[var(--drift-ui-warning-soft)] px-3 py-2 text-[10px] text-[var(--drift-ui-warning)]"
          role="alert"
        >
          粉丝牌协议无法确认，本次连接已暂停相关规则；重新连接后重试
        </p>
      ) : null}
      <SettingsSection
        actions={
          <span className="drift-theme-transition text-[9px] text-[var(--drift-ui-muted)]">
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
            aria-label="规则目标"
            className="min-w-0"
            onChange={(event) =>
              changeTarget(event.currentTarget.value as FilterTarget)
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
            aria-label="匹配方式"
            className="min-w-0"
            disabled={
              target === "senderUid" || target === "currentRoomFanMedal"
            }
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
            aria-label="规则动作"
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
          {target === "currentRoomFanMedal" ? (
            <Select
              aria-label="粉丝牌状态"
              className="col-span-2 min-w-0"
              onChange={(event) => setValue(event.currentTarget.value)}
              value={value}
            >
              <option value="yes">已佩戴</option>
              <option value="no">未佩戴</option>
            </Select>
          ) : (
            <Input
              aria-label="规则值"
              className="col-span-2 min-w-0"
              onChange={(event) => setValue(event.currentTarget.value)}
              placeholder={VALUE_PLACEHOLDERS[target]}
              value={value}
            />
          )}
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
            className="drift-theme-transition m-0 border-t border-drift-line px-3 py-2 text-[10px] text-[var(--drift-ui-warning)]"
            role="alert"
          >
            {ruleError}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection
        actions={
          <span className="drift-theme-transition text-[9px] text-[var(--drift-ui-muted)]">{rules.length} 条</span>
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
                className="drift-theme-transition grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-drift-line px-3 py-2.5 first:border-t-0 max-[519px]:grid-cols-[minmax(0,1fr)_auto]"
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
                    <span className="drift-theme-transition min-w-0 truncate text-[11px] font-semibold text-drift-ink">
                      {rule.name}
                    </span>
                  </div>
                  <span className="drift-theme-transition min-w-0 truncate text-[9px] text-[var(--drift-ui-muted)]">
                    {TARGET_LABELS[rule.target]} · {OPERATOR_LABELS[rule.operator]} ·{" "}
                    {rule.value}
                  </span>
                </div>
                <span
                  className={classNames(
                    "drift-theme-transition shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold",
                    isFollowedUserRule(rule)
                      ? "border-[var(--drift-ui-followed-border)] bg-[var(--drift-ui-followed-soft)] text-[var(--drift-ui-followed)]"
                      : rule.action === "hide"
                      ? "border-[var(--drift-ui-danger-border)] bg-[var(--drift-ui-danger-soft)] text-[var(--drift-ui-danger)]"
                      : "border-[var(--drift-ui-signal)] bg-[var(--drift-ui-selected)] text-[var(--drift-ui-signal-text)]",
                  )}
                >
                  {isFollowedUserRule(rule)
                    ? "关注高亮"
                    : ACTION_LABELS[rule.action]}
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
