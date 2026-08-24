import type { AppearanceConfig, VerticalOverflowPolicy } from "../types/config";
import type { QueuedLiveMessage } from "../types/danmaku";
import type { VerticalSpeedMultiplier } from "../types/verticalFlow";
import { isProtectedMessage } from "./danmakuRuntime";

export const VERTICAL_FLUSH_INTERVAL_MS = 500;
export const VERTICAL_REALTIME_NORMAL_LIMIT = 200;
export const VERTICAL_QUEUE_HARD_LIMIT = 2_000;

const BASE_PER_FLUSH: Record<AppearanceConfig["density"], number> = {
  low: 1,
  medium: 2,
  high: 4,
};

export function verticalSpeedMultiplier(
  queue: QueuedLiveMessage[],
  now: number,
): VerticalSpeedMultiplier {
  const wait = queue.length === 0 ? 0 : Math.max(0, now - queue[0].queuedAt);
  if (wait >= 30_000) return 8;
  if (wait >= 10_000) return 4;
  if (wait >= 2_000) return 2;
  return 1;
}

export function verticalFlushLimit(
  density: AppearanceConfig["density"],
  policy: VerticalOverflowPolicy,
  queue: QueuedLiveMessage[],
  now: number,
) {
  const multiplier =
    policy === "complete" ? verticalSpeedMultiplier(queue, now) : 1;
  return BASE_PER_FLUSH[density] * multiplier;
}

export function takeVerticalMessages(
  queue: QueuedLiveMessage[],
  limit: number,
) {
  return queue.splice(0, Math.max(0, limit));
}

export function enqueueVerticalMessages(
  queue: QueuedLiveMessage[],
  messages: QueuedLiveMessage[],
  policy: VerticalOverflowPolicy,
) {
  queue.push(...messages);

  let dropped = 0;
  if (policy === "realtime") {
    while (
      queue.filter((item) => !isProtectedMessage(item)).length >
      VERTICAL_REALTIME_NORMAL_LIMIT
    ) {
      dropOldest(queue);
      dropped += 1;
    }
  }

  while (queue.length > VERTICAL_QUEUE_HARD_LIMIT) {
    dropOldest(queue);
    dropped += 1;
  }

  return dropped;
}

function dropOldest(queue: QueuedLiveMessage[]) {
  const oldestNormal = queue.findIndex((item) => !isProtectedMessage(item));
  if (oldestNormal === -1) {
    queue.shift();
    return;
  }
  queue.splice(oldestNormal, 1);
}
