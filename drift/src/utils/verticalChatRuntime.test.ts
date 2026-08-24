import { describe, expect, it } from "vitest";
import type { QueuedLiveMessage } from "../types/danmaku";
import {
  VERTICAL_QUEUE_HARD_LIMIT,
  VERTICAL_REALTIME_NORMAL_LIMIT,
  enqueueVerticalMessages,
  takeVerticalMessages,
  verticalFlushLimit,
  verticalSpeedMultiplier,
} from "./verticalChatRuntime";

function message(
  id: string,
  patch: Partial<QueuedLiveMessage> = {},
): QueuedLiveMessage {
  return {
    id,
    roomId: 1,
    kind: "danmaku",
    user: "观众",
    text: id,
    attempts: 0,
    queuedAt: 1_000,
    ...patch,
  };
}

describe("vertical FIFO", () => {
  it("takes messages in receive order without promoting protected kinds", () => {
    const queue = [
      message("normal-1"),
      message("sc", { kind: "super_chat" }),
      message("normal-2"),
    ];
    expect(takeVerticalMessages(queue, 3).map((item) => item.id)).toEqual([
      "normal-1",
      "sc",
      "normal-2",
    ]);
  });

  it("drops the oldest normal messages above realtime limit", () => {
    const queue = Array.from(
      { length: VERTICAL_REALTIME_NORMAL_LIMIT },
      (_, index) => message(`normal-${index}`),
    );
    const dropped = enqueueVerticalMessages(
      queue,
      [message("sc", { kind: "super_chat" }), message("new-normal")],
      "realtime",
    );
    expect(dropped).toBe(1);
    expect(queue[0].id).toBe("normal-1");
    expect(queue.some((item) => item.id === "sc")).toBe(true);
  });

  it("uses a final hard limit even for an all-protected queue", () => {
    const queue = Array.from(
      { length: VERTICAL_QUEUE_HARD_LIMIT },
      (_, index) => message(`sc-${index}`, { kind: "super_chat" }),
    );
    expect(
      enqueueVerticalMessages(
        queue,
        [message("latest", { kind: "guard" })],
        "complete",
      ),
    ).toBe(1);
    expect(queue).toHaveLength(VERTICAL_QUEUE_HARD_LIMIT);
    expect(queue[queue.length - 1]?.id).toBe("latest");
  });

  it.each([
    [1_999, 1],
    [2_000, 2],
    [10_000, 4],
    [30_000, 8],
  ] as const)("maps oldest wait %ims to %ix", (wait, expected) => {
    const now = 40_000;
    const queuedAt = now - wait;
    expect(verticalSpeedMultiplier([message("m", { queuedAt })], now)).toBe(expected);
  });

  it.each([
    ["low", 1],
    ["medium", 2],
    ["high", 4],
  ] as const)("uses %s density base %i", (density, base) => {
    expect(verticalFlushLimit(density, "realtime", [], 10_000)).toBe(base);
    expect(
      verticalFlushLimit(
        density,
        "complete",
        [message("old", { queuedAt: -20_000 })],
        10_000,
      ),
    ).toBe(base * 8);
  });
});
