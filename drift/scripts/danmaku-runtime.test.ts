import assert from "node:assert/strict";
import { test } from "node:test";
import { isProtectedMessage } from "../src/utils/danmakuRuntime.ts";

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

test("keeps special message kinds protected", () => {
  for (const kind of ["super_chat", "guard", "gift"] as const) {
    assert.equal(isProtectedMessage({ kind }), true);
  }
});
