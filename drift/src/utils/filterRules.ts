import type { FilterConfig, FilterRule } from "../types/config";
import type { LiveMessage } from "../types/danmaku";

export type FilterDecision = {
  visible: boolean;
  highlighted: boolean;
};

export function applyFilterConfig(
  message: LiveMessage,
  filter: FilterConfig,
): FilterDecision {
  const blockedWords = filter.blockedWords
    .map((word) => word.trim())
    .filter(Boolean);

  if (blockedWords.some((word) => message.text.includes(word))) {
    return { visible: false, highlighted: false };
  }

  let highlighted = false;
  for (const rule of filter.rules) {
    if (!rule.enabled || !rule.value.trim()) {
      continue;
    }
    if (!matchesRule(message, rule)) {
      continue;
    }
    if (rule.action === "hide") {
      return { visible: false, highlighted: false };
    }
    if (rule.action === "highlight") {
      highlighted = true;
    }
  }

  return { visible: true, highlighted };
}

function matchesRule(message: LiveMessage, rule: FilterRule) {
  const candidate = candidateValue(message, rule);
  if (candidate === "") {
    return false;
  }

  const expected = rule.value.trim();
  switch (rule.operator) {
    case "equals":
      return candidate === expected;
    case "startsWith":
      return candidate.startsWith(expected);
    case "endsWith":
      return candidate.endsWith(expected);
    case "regex":
      return matchesRegex(candidate, expected);
    case "contains":
    default:
      return candidate.includes(expected);
  }
}

function candidateValue(message: LiveMessage, rule: FilterRule) {
  switch (rule.target) {
    case "user":
      return message.user;
    case "messageType":
      return message.kind;
    case "giftName":
      return message.giftName ?? "";
    case "guardLevel":
      return message.guardLevel?.toString() ?? "";
    case "text":
    default:
      return message.text;
  }
}

function matchesRegex(candidate: string, pattern: string) {
  try {
    return new RegExp(pattern).test(candidate);
  } catch {
    return false;
  }
}
