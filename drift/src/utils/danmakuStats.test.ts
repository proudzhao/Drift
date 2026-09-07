import { expect, test } from "vitest";
import type { LiveMessage } from "../types/danmaku";
import {
  appendScopedStats,
  buildScopedStatsSnapshots,
  createScopedStatsState,
} from "./danmakuStats";

function statsMessage(
  roomId: number,
  user: string,
  text: string,
): LiveMessage & { sourceRoomId: number } {
  return {
    id: `${roomId}-${user}-${text}`,
    roomId,
    kind: "danmaku",
    user,
    text,
    sourceRoomId: roomId,
  };
}

test("builds independent room snapshots without changing the global total", () => {
  const states = createScopedStatsState(1);
  appendScopedStats(
    states,
    [
      statsMessage(6, "甲", "alpha"),
      statsMessage(7, "乙", "beta"),
      statsMessage(6, "甲", "gamma"),
    ],
    2,
  );

  const snapshots = buildScopedStatsSnapshots(states, 3);
  expect(snapshots.all.totalMessages).toBe(3);
  expect(snapshots.byRoom[6]?.totalMessages).toBe(2);
  expect(snapshots.byRoom[7]?.totalMessages).toBe(1);
});
