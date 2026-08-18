import assert from "node:assert/strict";
import { test } from "node:test";
import { getUpdateErrorMessage } from "../src/utils/updateErrorMessage.ts";

test("returns stable Chinese messages for updater failures", () => {
  assert.equal(
    getUpdateErrorMessage("check"),
    "暂时无法获取更新信息，请稍后重试。",
  );
  assert.equal(
    getUpdateErrorMessage("download_install"),
    "更新下载或安装失败，请重试或前往 GitHub 下载。",
  );
  assert.equal(
    getUpdateErrorMessage("restart"),
    "无法自动重启 Drift，请手动重启应用。",
  );
});

test("does not expose the updater plugin English error", () => {
  for (const stage of ["check", "download_install", "restart"] as const) {
    assert.doesNotMatch(getUpdateErrorMessage(stage), /could not fetch/i);
  }
});
