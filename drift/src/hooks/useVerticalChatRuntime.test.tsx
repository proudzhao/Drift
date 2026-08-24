import { act, render, renderHook } from "@testing-library/react";
import { Suspense, useLayoutEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { QueuedLiveMessage } from "../types/danmaku";
import { useVerticalChatRuntime } from "./useVerticalChatRuntime";

function queued(
  id: string,
  patch: Partial<QueuedLiveMessage> = {},
): QueuedLiveMessage {
  return {
    id,
    roomId: 6,
    kind: "danmaku",
    user: "观众",
    text: id,
    attempts: 0,
    queuedAt: Date.now(),
    ...patch,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useVerticalChatRuntime", () => {
  test("flushes complete-mode FIFO with the computed multiplier", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useVerticalChatRuntime({
        active: true,
        density: "low",
        policy: "complete",
      }),
    );

    act(() => {
      result.current.enqueue(
        Array.from({ length: 9 }, (_, index) =>
          queued(`message-${index}`, {
            queuedAt: Date.now() - 30_000,
          }),
        ),
      );
      vi.advanceTimersByTime(500);
    });

    expect(result.current.items.map((item) => item.text)).toEqual(
      Array.from({ length: 8 }, (_, index) => `message-${index}`),
    );
    expect(result.current.status.speedMultiplier).toBe(8);
    expect(result.current.status.backlog).toBe(1);
  });

  test("copies the current-room fan-medal level to visible items", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useVerticalChatRuntime({
        active: true,
        density: "high",
        policy: "realtime",
      }),
    );

    act(() => {
      result.current.enqueue([
        queued("medal", { currentRoomFanMedalLevel: 13 }),
      ]);
      vi.advanceTimersByTime(500);
    });

    expect(result.current.items).toEqual([
      expect.objectContaining({ currentRoomFanMedalLevel: 13 }),
    ]);
  });

  test("clears pending, visible, speed and drop state", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useVerticalChatRuntime({
        active: true,
        density: "high",
        policy: "realtime",
      }),
    );

    act(() => {
      result.current.enqueue(
        Array.from({ length: 202 }, (_, index) => queued(String(index))),
      );
    });
    expect(result.current.status.droppedTotal).toBe(2);

    act(() => result.current.clear());

    expect(result.current.items).toEqual([]);
    expect(result.current.status).toMatchObject({
      backlog: 0,
      droppedTotal: 0,
      speedMultiplier: 1,
    });
  });

  test("normalizes a complete backlog when policy changes to realtime", () => {
    vi.useFakeTimers();
    const initialProps: { policy: "complete" | "realtime" } = {
      policy: "complete",
    };
    const { result, rerender } = renderHook(
      ({ policy }: { policy: "complete" | "realtime" }) =>
        useVerticalChatRuntime({
          active: true,
          density: "high",
          policy,
        }),
      { initialProps },
    );

    act(() => {
      result.current.enqueue(
        Array.from({ length: 202 }, (_, index) => queued(String(index))),
      );
    });
    expect(result.current.status).toMatchObject({
      policy: "complete",
      backlog: 202,
      droppedTotal: 0,
    });

    rerender({ policy: "realtime" });

    expect(result.current.status).toMatchObject({
      policy: "realtime",
      backlog: 200,
      droppedTotal: 2,
      speedMultiplier: 1,
    });
  });

  test("resets the published multiplier when a flush empties the queue", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useVerticalChatRuntime({
        active: true,
        density: "low",
        policy: "complete",
      }),
    );

    act(() => {
      result.current.enqueue([
        queued("old-1", { queuedAt: Date.now() - 2_000 }),
        queued("old-2", { queuedAt: Date.now() - 2_000 }),
      ]);
      vi.advanceTimersByTime(500);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.status).toMatchObject({
      backlog: 0,
      speedMultiplier: 1,
    });

    act(() => result.current.enqueue([queued("fresh")]));
    expect(result.current.status).toMatchObject({
      backlog: 1,
      speedMultiplier: 1,
    });
  });

  test("commits active and policy before a same-commit layout callback", () => {
    vi.useFakeTimers();
    let enqueueOnCommit = false;
    const { result, rerender } = renderHook(
      ({ active, policy }: { active: boolean; policy: "complete" | "realtime" }) => {
        const runtime = useVerticalChatRuntime({
          active,
          density: "high",
          policy,
        });
        useLayoutEffect(() => {
          if (enqueueOnCommit) {
            runtime.enqueue(
              Array.from({ length: 202 }, (_, index) => queued(String(index))),
            );
          }
        }, [active, policy]);
        return runtime;
      },
      { initialProps: { active: false, policy: "realtime" } },
    );

    enqueueOnCommit = true;
    rerender({ active: true, policy: "complete" });

    expect(result.current.status).toMatchObject({
      active: true,
      policy: "complete",
      backlog: 202,
      droppedTotal: 0,
    });
  });

  test("does not leak policy from an abandoned render", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    let committedRuntime: ReturnType<typeof useVerticalChatRuntime> | undefined;

    function Harness({
      policy,
      suspend,
    }: {
      policy: "complete" | "realtime";
      suspend: boolean;
    }) {
      const runtime = useVerticalChatRuntime({
        active: true,
        density: "high",
        policy,
      });
      useLayoutEffect(() => {
        committedRuntime = runtime;
      });
      if (suspend) {
        throw never;
      }
      return null;
    }

    const view = render(
      <Suspense fallback={null}>
        <Harness policy="realtime" suspend={false} />
      </Suspense>,
    );
    view.rerender(
      <Suspense fallback={null}>
        <Harness policy="complete" suspend />
      </Suspense>,
    );

    act(() => {
      committedRuntime?.enqueue(
        Array.from({ length: 202 }, (_, index) => queued(String(index))),
      );
    });
    view.rerender(
      <Suspense fallback={null}>
        <Harness policy="realtime" suspend={false} />
      </Suspense>,
    );

    expect(committedRuntime?.status).toMatchObject({
      policy: "realtime",
      backlog: 200,
      droppedTotal: 2,
    });
  });

  test("retains the status object when an interval refresh is unchanged", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useVerticalChatRuntime({
        active: true,
        density: "high",
        policy: "realtime",
      }),
    );
    const previousStatus = result.current.status;

    act(() => vi.advanceTimersByTime(500));

    expect(result.current.status).toBe(previousStatus);
  });
});
