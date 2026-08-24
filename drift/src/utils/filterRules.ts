import type { FilterConfig, FilterRule } from "../types/config";
import type { LiveMessage } from "../types/danmaku";

export type FilterDecision = {
  visible: boolean;
  highlighted: boolean;
  followedUser: boolean;
  pauseFanMedalRuleIds: string[];
};

export function applyFilterConfig(
  message: LiveMessage,
  filter: FilterConfig,
  runtime: { pausedFanMedalRuleIds: ReadonlySet<string> } = {
    pausedFanMedalRuleIds: new Set(),
  },
): FilterDecision {
  const blockedWords = filter.blockedWords
    .map((word) => word.trim())
    .filter(Boolean);
  const pauseFanMedalRuleIds = new Set(
    message.kind === "danmaku" &&
      message.currentRoomFanMedal === "unknown"
      ? filter.rules
          .filter(
            (rule) =>
              rule.enabled &&
              Boolean(rule.value.trim()) &&
              rule.target === "currentRoomFanMedal" &&
              !runtime.pausedFanMedalRuleIds.has(rule.id),
          )
          .map((rule) => rule.id)
      : [],
  );

  if (blockedWords.some((word) => message.text.includes(word))) {
    return {
      visible: false,
      highlighted: false,
      followedUser: false,
      pauseFanMedalRuleIds: [...pauseFanMedalRuleIds],
    };
  }

  let highlighted = false;
  let followedUser = false;
  for (const rule of filter.rules) {
    if (!rule.enabled || !rule.value.trim()) {
      continue;
    }
    if (
      rule.target === "currentRoomFanMedal" &&
      runtime.pausedFanMedalRuleIds.has(rule.id)
    ) {
      continue;
    }
    if (
      rule.target === "currentRoomFanMedal" &&
      message.kind === "danmaku" &&
      message.currentRoomFanMedal === "unknown"
    ) {
      continue;
    }
    if (!matchesRule(message, rule)) {
      continue;
    }
    if (rule.action === "hide") {
      return {
        visible: false,
        highlighted: false,
        followedUser: false,
        pauseFanMedalRuleIds: [...pauseFanMedalRuleIds],
      };
    }
    if (rule.action === "highlight") {
      if (rule.target === "senderUid" && rule.operator === "equals") {
        followedUser = true;
      } else {
        highlighted = true;
      }
    }
  }

  return {
    visible: true,
    highlighted,
    followedUser,
    pauseFanMedalRuleIds: [...pauseFanMedalRuleIds],
  };
}

function matchesRule(message: LiveMessage, rule: FilterRule) {
  if (rule.target === "senderUid") {
    return (
      rule.operator === "equals" &&
      Number.isInteger(message.senderUid) &&
      (message.senderUid ?? 0) > 0 &&
      message.senderUid?.toString() === rule.value.trim()
    );
  }

  const candidate = candidateValue(message, rule);
  if (candidate === null || candidate === "") {
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

function candidateValue(message: LiveMessage, rule: FilterRule): string | null {
  switch (rule.target) {
    case "user":
      return message.user;
    case "senderUid":
      return null;
    case "currentRoomFanMedal":
      return message.kind === "danmaku"
        ? (message.currentRoomFanMedal ?? null)
        : null;
    case "text":
      return message.text;
    default:
      return null;
  }
}

function matchesRegex(candidate: string, pattern: string) {
  try {
    return new RegExp(pattern).test(candidate);
  } catch {
    return false;
  }
}
