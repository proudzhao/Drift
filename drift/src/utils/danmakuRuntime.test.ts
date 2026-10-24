import { expect, test } from "vitest";
import type { LiveMessage } from "../types/danmaku";
import {
  calculateTrackCount,
  estimateMessageWidth,
  ONLINE_RANK_BAR_HEIGHT,
  TRACK_HEIGHT,
} from "./danmakuRuntime";

function emoteMessage(isLarge: boolean, withDimensions = true): LiveMessage {
  return {
    id: isLarge ? "large" : "regular",
    kind: "danmaku",
    user: "",
    text: "表情",
    segments: [
      {
        type: "emote",
        text: "表情一",
        url: "https://example.test/one.png",
        ...(withDimensions ? { width: 162, height: 162 } : {}),
        isLarge,
      },
      {
        type: "emote",
        text: "表情二",
        url: "https://example.test/two.png",
        ...(withDimensions ? { width: 162, height: 162 } : {}),
        isLarge,
      },
    ],
  };
}

test("estimates marked large emotes at 52px without changing track height", () => {
  expect(estimateMessageWidth(emoteMessage(false), 24, false, true)).toBe(80);
  expect(estimateMessageWidth(emoteMessage(true), 24, false, true)).toBe(106);
  expect(estimateMessageWidth(emoteMessage(true, false), 24, false, true)).toBe(
    106,
  );
  expect(TRACK_HEIGHT).toBe(38);
});

test("reserves one status row from horizontal track calculation", () => {
  expect(ONLINE_RANK_BAR_HEIGHT).toBe(22);
  expect(calculateTrackCount(160, false)).toBe(4);
  expect(calculateTrackCount(160, true)).toBe(3);
  expect(calculateTrackCount(220, true)).toBe(5);
});
