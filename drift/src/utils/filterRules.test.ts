import { describe, expect, test } from "vitest";

import type {
  FilterAction,
  FilterOperator,
  FilterRule,
  FilterTarget,
} from "../types/config";
import type { LiveMessage } from "../types/danmaku";
import { applyFilterConfig } from "./filterRules";

function message(
  kind: LiveMessage["kind"],
  text: string,
  senderUid?: number,
): LiveMessage {
  return { id: `${kind}-${text}`, kind, user: "用户", text, senderUid };
}

const danmaku = (text: string, uid?: number) =>
  message("danmaku", text, uid);
const superChat = (text: string, uid?: number) =>
  message("super_chat", text, uid);
const gift = (text: string, uid?: number) => message("gift", text, uid);
const guard = (text: string, uid?: number) => message("guard", text, uid);

function rule(
  target: FilterTarget,
  operator: FilterOperator,
  value: string,
  action: FilterAction,
  id = `${target}-${value}`,
): FilterRule {
  return {
    id,
    enabled: true,
    name: "测试规则",
    target,
    operator,
    value,
    action,
  };
}

function decide(liveMessage: LiveMessage, ...rules: FilterRule[]) {
  return applyFilterConfig(liveMessage, { blockedWords: [], rules });
}

describe("applyFilterConfig", () => {
  test("keeps legacy text and blockedWords behavior", () => {
    expect(
      decide(gift("抽奖礼物"), rule("text", "contains", "抽奖", "hide"))
        .visible,
    ).toBe(false);
    expect(
      decide(danmaku("Alpha"), rule("text", "contains", "alpha", "hide"))
        .visible,
    ).toBe(true);
    expect(
      applyFilterConfig(danmaku("旧屏蔽词"), {
        blockedWords: ["屏蔽"],
        rules: [],
      }),
    ).toEqual({
      visible: false,
      highlighted: false,
      followedUser: false,
      pauseFanMedalRuleIds: [],
    });
  });

  test("keeps the username target case-sensitive", () => {
    const liveMessage: LiveMessage = {
      ...guard("上舰"),
      user: "Alice",
    };

    expect(
      decide(liveMessage, rule("user", "equals", "Alice", "hide")).visible,
    ).toBe(false);
    expect(
      decide(liveMessage, rule("user", "equals", "alice", "hide")).visible,
    ).toBe(true);
  });

  test("matches sender uid with equals across all message kinds", () => {
    const hide = rule("senderUid", "equals", "42", "hide");
    for (const liveMessage of [
      danmaku("x", 42),
      superChat("x", 42),
      gift("x", 42),
      guard("x", 42),
    ]) {
      expect(decide(liveMessage, hide).visible).toBe(false);
    }

    expect(decide(danmaku("x"), hide).visible).toBe(true);
    expect(decide(danmaku("x", 7), hide).visible).toBe(true);
  });

  test.each([0, -42, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not match invalid sender uid %s",
    (senderUid) => {
      expect(
        decide(
          danmaku("x", senderUid),
          rule("senderUid", "equals", String(senderUid), "hide"),
        ).visible,
      ).toBe(true);
    },
  );

  test("only supports equals for sender uid", () => {
    expect(
      decide(
        danmaku("x", 42),
        rule("senderUid", "contains", "42", "hide"),
      ).visible,
    ).toBe(true);
  });

  test("pauses unknown fan medal rules without hiding by those rules", () => {
    const first = rule(
      "currentRoomFanMedal",
      "equals",
      "no",
      "hide",
      "fan-first",
    );
    const second = rule(
      "currentRoomFanMedal",
      "equals",
      "yes",
      "highlight",
      "fan-second",
    );
    const liveMessage = {
      ...danmaku("x"),
      currentRoomFanMedal: "unknown" as const,
    };

    expect(decide(liveMessage, first, second)).toEqual({
      visible: true,
      highlighted: false,
      followedUser: false,
      pauseFanMedalRuleIds: ["fan-first", "fan-second"],
    });
    expect(
      decide(
        { ...danmaku("x"), currentRoomFanMedal: "no" },
        first,
      ).visible,
    ).toBe(false);
    expect(decide(superChat("x"), first).visible).toBe(true);
    expect(
      decide(
        { ...superChat("x"), currentRoomFanMedal: "no" },
        first,
      ).visible,
    ).toBe(true);
  });

  test("skips fan medal rules that are already paused", () => {
    const fanRule = rule(
      "currentRoomFanMedal",
      "equals",
      "no",
      "hide",
      "fan-only",
    );
    const liveMessage = {
      ...danmaku("x"),
      currentRoomFanMedal: "unknown" as const,
    };

    expect(
      applyFilterConfig(
        liveMessage,
        { blockedWords: [], rules: [fanRule] },
        { pausedFanMedalRuleIds: new Set([fanRule.id]) },
      ),
    ).toEqual({
      visible: true,
      highlighted: false,
      followedUser: false,
      pauseFanMedalRuleIds: [],
    });
  });

  test("keeps collected pause ids when another rule hides the message", () => {
    const fanRule = rule(
      "currentRoomFanMedal",
      "equals",
      "no",
      "hide",
      "fan-only",
    );
    const textRule = rule("text", "contains", "x", "hide", "text-hide");

    expect(
      decide(
        { ...danmaku("x"), currentRoomFanMedal: "unknown" },
        fanRule,
        textRule,
      ),
    ).toEqual({
      visible: false,
      highlighted: false,
      followedUser: false,
      pauseFanMedalRuleIds: [fanRule.id],
    });
  });

  test("keeps every active fan medal pause id when blockedWords hides", () => {
    const first = rule(
      "currentRoomFanMedal",
      "equals",
      "no",
      "hide",
      "fan-first",
    );
    const second = rule(
      "currentRoomFanMedal",
      "equals",
      "yes",
      "highlight",
      "fan-second",
    );
    const paused = rule(
      "currentRoomFanMedal",
      "equals",
      "no",
      "hide",
      "fan-paused",
    );

    expect(
      applyFilterConfig(
        { ...danmaku("命中屏蔽词"), currentRoomFanMedal: "unknown" },
        { blockedWords: ["屏蔽"], rules: [first, second, paused] },
        { pausedFanMedalRuleIds: new Set([paused.id]) },
      ),
    ).toEqual({
      visible: false,
      highlighted: false,
      followedUser: false,
      pauseFanMedalRuleIds: [first.id, second.id],
    });
  });

  test("keeps hide priority over highlight regardless of rule order", () => {
    const highlight = rule("text", "contains", "x", "highlight", "mark");
    const hide = rule("user", "equals", "用户", "hide", "hide");

    for (const rules of [
      [highlight, hide],
      [hide, highlight],
    ]) {
      expect(decide(danmaku("x"), ...rules)).toEqual({
        visible: false,
        highlighted: false,
        followedUser: false,
        pauseFanMedalRuleIds: [],
      });
    }
  });

  test("marks sender uid equals highlight as a followed user for all kinds", () => {
    const follow = rule(
      "senderUid",
      "equals",
      "42",
      "highlight",
      "follow-42",
    );

    for (const liveMessage of [
      danmaku("x", 42),
      superChat("x", 42),
      gift("x", 42),
      guard("x", 42),
    ]) {
      expect(decide(liveMessage, follow)).toEqual({
        visible: true,
        highlighted: false,
        followedUser: true,
        pauseFanMedalRuleIds: [],
      });
    }
  });

  test("keeps non-follow highlight rules generic", () => {
    expect(
      decide(
        danmaku("关键词"),
        rule("text", "contains", "关键词", "highlight"),
      ),
    ).toEqual({
      visible: true,
      highlighted: true,
      followedUser: false,
      pauseFanMedalRuleIds: [],
    });
  });

  test("keeps generic and followed highlight sources when both match", () => {
    const follow = rule("senderUid", "equals", "42", "highlight", "follow");
    const generic = rule("text", "contains", "x", "highlight", "generic");

    for (const rules of [
      [follow, generic],
      [generic, follow],
    ]) {
      expect(decide(danmaku("x", 42), ...rules)).toEqual({
        visible: true,
        highlighted: true,
        followedUser: true,
        pauseFanMedalRuleIds: [],
      });
    }
  });

  test.each([
    rule("senderUid", "equals", "42", "hide"),
    rule("senderUid", "contains", "42", "highlight"),
    { ...rule("senderUid", "equals", "42", "highlight"), enabled: false },
    rule("senderUid", "equals", "", "highlight"),
  ])("does not follow invalid rule shape %#", (candidateRule) => {
    expect(decide(danmaku("x", 42), candidateRule).followedUser).toBe(false);
  });

  test("clears followed state when another rule or blockedWords hides", () => {
    const follow = rule("senderUid", "equals", "42", "highlight", "follow");
    const hide = rule("text", "contains", "x", "hide", "hide");

    expect(decide(danmaku("x", 42), follow, hide).followedUser).toBe(false);
    expect(
      applyFilterConfig(danmaku("屏蔽", 42), {
        blockedWords: ["屏蔽"],
        rules: [follow],
      }).followedUser,
    ).toBe(false);
  });

  test.each(["commentText", "messageType", "giftName", "guardLevel"])(
    "ignores deprecated target %s even when passed around migration",
    (target) => {
      const deprecated = rule("text", "contains", "x", "hide");
      (deprecated as unknown as { target: string }).target = target;

      expect(
        decide(
          { ...gift("x"), giftName: "x", guardLevel: 3 },
          deprecated,
        ),
      ).toEqual({
        visible: true,
        highlighted: false,
        followedUser: false,
        pauseFanMedalRuleIds: [],
      });
    },
  );
});
