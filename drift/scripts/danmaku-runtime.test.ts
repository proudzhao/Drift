import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiveMessage } from "../src/types/danmaku.ts";
import {
  isProtectedMessage,
  resolveMessageDuration,
  resolveSuperChatDurationMultiplier,
} from "../src/utils/danmakuRuntime.ts";

function liveMessage(
  kind: LiveMessage["kind"],
  superChatPrice?: number,
): LiveMessage {
  return {
    id: `test-${kind}-${String(superChatPrice)}`,
    kind,
    user: "测试用户",
    text: "测试消息",
    superChatPrice,
  };
}

function assertDuration(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9);
}

test("protects self danmaku without protecting other danmaku", () => {
  assert.equal(
    isProtectedMessage({ kind: "danmaku", isSelf: true }),
    true,
  );
  assert.equal(isProtectedMessage({ kind: "danmaku" }), false);
  assert.equal(
    isProtectedMessage({ kind: "danmaku", isSelf: false }),
    false,
  );
});

test("protects followed danmaku without protecting generic highlights", () => {
  assert.equal(
    isProtectedMessage({ kind: "danmaku", followedUser: true }),
    true,
  );
  assert.equal(
    isProtectedMessage({ kind: "danmaku", followedUser: false }),
    false,
  );
  assert.equal(
    isProtectedMessage({ kind: "danmaku", highlighted: true }),
    false,
  );
  assert.equal(isProtectedMessage({ kind: "danmaku" }), false);
});

test("keeps special message kinds protected", () => {
  for (const kind of ["super_chat", "guard", "gift"] as const) {
    assert.equal(isProtectedMessage({ kind }), true);
  }
});

test("maps super chat price boundaries to duration multipliers", () => {
  const cases: Array<[number | undefined, number]> = [
    [undefined, 1.2],
    [0, 1.2],
    [-1, 1.2],
    [Number.NaN, 1.2],
    [Number.POSITIVE_INFINITY, 1.2],
    [1, 1.2],
    [29, 1.2],
    [30, 1.3],
    [49, 1.3],
    [50, 1.4],
    [99, 1.4],
    [100, 1.55],
    [499, 1.55],
    [500, 1.75],
    [999, 1.75],
    [1000, 2],
    [1999, 2],
    [2000, 2.25],
  ];

  for (const [price, expected] of cases) {
    assert.equal(resolveSuperChatDurationMultiplier(price), expected);
  }
});

test("keeps non-super-chat duration and sequence staggering unchanged", () => {
  for (const kind of ["danmaku", "gift", "guard"] as const) {
    assert.equal(resolveMessageDuration(liveMessage(kind), 12, 2), 14);
  }

  const durations = [0, 1, 2].map((sequence) =>
    resolveMessageDuration(liveMessage("super_chat", 1), 12, sequence),
  );
  durations.forEach((duration, index) => {
    assertDuration(duration, [14.4, 15.6, 16.8][index]);
  });
});

test("increases default super chat duration across all price tiers", () => {
  const durations = [1, 30, 50, 100, 500, 1000, 2000].map((price) =>
    resolveMessageDuration(liveMessage("super_chat", price), 12, 0),
  );

  durations.forEach((duration, index) => {
    assertDuration(
      duration,
      [14.4, 15.6, 16.8, 18.6, 21, 24, 27][index],
    );
  });
  for (let index = 1; index < durations.length; index += 1) {
    assert.ok(durations[index] > durations[index - 1]);
  }
});

test("caps high-price super chat duration at 45 seconds", () => {
  assert.equal(
    resolveMessageDuration(liveMessage("super_chat", 2000), 24, 2),
    45,
  );
});
