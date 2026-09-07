import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../types/config";
import type { LiveMessage } from "../types/danmaku";
import type { DanmakuRoomBatch, RoomSessionSnapshot } from "../types/roomSession";
import {
  useDanmakuRuntime,
  type UseDanmakuRuntimeResult,
} from "./useDanmakuRuntime";

const CONNECTED_SESSIONS: RoomSessionSnapshot[] = [
  {
    sessionId: "current",
    requestedRoomId: 6,
    roomId: 6,
    status: "connected",
    message: "connected",
  },
];

function connected(sessionId: string, roomId: number): RoomSessionSnapshot {
  return {
    sessionId,
    requestedRoomId: roomId,
    roomId,
    status: "connected",
    message: "connected",
  };
}

function batch(
  sessionId: string,
  roomId: number,
  fanMedalName: string,
  text: string,
  messagePatch: Partial<LiveMessage> = {},
): DanmakuRoomBatch {
  return {
    sessionId,
    roomId,
    fanMedalName,
    activeSourceCount: 2,
    messages: [
      {
        id: "message",
        roomId,
        kind: "danmaku",
        user: "用户",
        text,
        ...messagePatch,
      },
    ],
  };
}

function enqueueBatch(
  runtime: Pick<UseDanmakuRuntimeResult, "enqueueLiveBatch">,
  messages: LiveMessage[],
  roomId = 6,
) {
  runtime.enqueueLiveBatch({
    sessionId: "current",
    roomId,
    activeSourceCount: 1,
    messages,
  });
}

function configWithRules(
  rules: AppConfig["filter"]["rules"],
  blockedWords: string[] = [],
): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    filter: { blockedWords, rules },
  };
}

function fanRule(id = "fan-only"): AppConfig["filter"]["rules"][number] {
  return {
    id,
    enabled: true,
    name: "只看本房牌",
    target: "currentRoomFanMedal",
    operator: "equals",
    value: "no",
    action: "hide",
  };
}

function uidRule(
  action: "hide" | "highlight",
): AppConfig["filter"]["rules"][number] {
  return {
    id: `uid-${action}`,
    enabled: true,
    name: action === "hide" ? "屏蔽用户" : "关注用户",
    target: "senderUid",
    operator: "equals",
    value: "42",
    action,
  };
}

function unknownDanmaku(id: string, text = "正文"): LiveMessage {
  return {
    id,
    roomId: 6,
    kind: "danmaku",
    user: "用户",
    text,
    currentRoomFanMedal: "unknown",
  };
}

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useDanmakuRuntime room batches", () => {
  test("keeps room sources and scoped stats until the next connection cycle", () => {
    vi.useFakeTimers();
    let roomSessions: RoomSessionSnapshot[] = [
      connected("s1", 6),
      connected("s2", 7),
    ];
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      result.current.setShowStats(true);
      result.current.enqueueLiveBatch({
        sessionId: "s1",
        roomId: 6,
        anchorName: " 主播甲 ",
        activeSourceCount: 2,
        messages: [{ ...unknownDanmaku("room-6", "甲消息"), roomId: 6 }],
      });
      result.current.enqueueLiveBatch({
        sessionId: "s2",
        roomId: 7,
        activeSourceCount: 2,
        messages: [{ ...unknownDanmaku("room-7", "乙消息"), roomId: 7 }],
      });
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current.roomSources).toEqual([
      { roomId: 6, label: "主播甲 · 6" },
      { roomId: 7, label: "7" },
    ]);
    expect(result.current.historySnapshot.map((item) => item.sourceRoomId)).toEqual([
      6,
      7,
    ]);
    expect(result.current.statsSnapshots.all.totalMessages).toBe(2);
    expect(result.current.statsSnapshots.byRoom[6]?.totalMessages).toBe(1);
    expect(result.current.statsSnapshots.byRoom[7]?.totalMessages).toBe(1);

    roomSessions = [];
    rerender();

    expect(result.current.roomSources).toEqual([
      { roomId: 6, label: "主播甲 · 6" },
      { roomId: 7, label: "7" },
    ]);
    expect(result.current.statsSnapshots.all.totalMessages).toBe(2);

    roomSessions = [connected("s3", 8)];
    rerender();

    expect(result.current.roomSources).toEqual([]);
    expect(result.current.historySnapshot).toEqual([]);
    expect(result.current.statsSnapshots.all.totalMessages).toBe(0);
  });

  test("replays a valid batch that arrived before initial sessions are ready", () => {
    let roomSessions: RoomSessionSnapshot[] = [];
    let roomSessionsReady = false;
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        roomSessionsReady,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      result.current.enqueueLiveBatch(batch("s1", 6, "牌甲", "early"));
    });
    expect(result.current.historySnapshot).toEqual([]);

    roomSessions = [connected("s1", 6)];
    roomSessionsReady = true;
    rerender();

    expect(result.current.historySnapshot.map((item) => item.text)).toEqual([
      "early",
    ]);
    rerender();
    expect(result.current.historySnapshot.map((item) => item.text)).toEqual([
      "early",
    ]);
  });

  test("accepts through an enqueue function retained before readiness", () => {
    let roomSessions: RoomSessionSnapshot[] = [];
    let roomSessionsReady = false;
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        roomSessionsReady,
        trackCount: 3,
        windowLabel: "main",
      }),
    );
    const appListenerEnqueue = result.current.enqueueLiveBatch;

    act(() => result.current.setShowHistory(true));
    roomSessions = [connected("s1", 6)];
    roomSessionsReady = true;
    rerender();
    act(() => appListenerEnqueue(batch("s1", 6, "牌甲", "after-ready")));

    expect(result.current.historySnapshot.map((item) => item.text)).toEqual([
      "after-ready",
    ]);
  });

  test("rejects a stale batch that was buffered before initial readiness", () => {
    let roomSessions: RoomSessionSnapshot[] = [];
    let roomSessionsReady = false;
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        roomSessionsReady,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => result.current.enqueueLiveBatch(batch("stale", 6, "牌", "ignored")));
    roomSessions = [connected("current", 6)];
    roomSessionsReady = true;
    rerender();

    expect(result.current.historySnapshot).toEqual([]);
  });

  test("keeps only the newest 64 batches before initial readiness", () => {
    let roomSessions: RoomSessionSnapshot[] = [];
    let roomSessionsReady = false;
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        roomSessionsReady,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      for (let index = 0; index < 65; index += 1) {
        result.current.enqueueLiveBatch(batch("s1", 6, "牌", `message-${index}`));
      }
    });
    roomSessions = [connected("s1", 6)];
    roomSessionsReady = true;
    rerender();

    expect(result.current.historySnapshot).toHaveLength(64);
    expect(result.current.historySnapshot[0]?.text).toBe("message-1");
    expect(
      result.current.historySnapshot[
        result.current.historySnapshot.length - 1
      ]?.text,
    ).toBe("message-64");
  });

  test("accepts two current room batches in arrival order", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions: [connected("s1", 6), connected("s2", 7)],
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      result.current.enqueueLiveBatch(batch("s1", 6, "牌甲", "left"));
      result.current.enqueueLiveBatch(batch("s2", 7, "牌乙", "right"));
    });

    expect(result.current.historySnapshot.map((item) => item.text)).toEqual([
      "left",
      "right",
    ]);
  });

  test("rejects a stale batch before filter pause and history side effects", () => {
    const invokeCalls: string[] = [];
    mockIPC((command) => {
      invokeCalls.push(command);
      return null;
    });
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config: configWithRules([fanRule()]),
        roomSessions: [connected("current", 6)],
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() =>
      result.current.enqueueLiveBatch(
        batch("stale", 6, "牌", "ignored", {
          currentRoomFanMedal: "unknown",
        }),
      ),
    );

    expect(result.current.historySnapshot).toEqual([]);
    expect(invokeCalls).not.toContain("pause_fan_medal_rules_for_session");
  });

  test("rejects messages whose embedded room differs from the batch", () => {
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions: [connected("current", 6)],
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() =>
      result.current.enqueueLiveBatch(
        batch("current", 6, "牌", "ignored", { roomId: 7 }),
      ),
    );

    expect(result.current.historySnapshot).toEqual([]);
  });

  test("same upstream id from two rooms receives unique display ids", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions: [connected("s1", 6), connected("s2", 7)],
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.enqueueLiveBatch(batch("s1", 6, "牌甲", "one", { id: "same" }));
      result.current.enqueueLiveBatch(batch("s2", 7, "牌乙", "two", { id: "same" }));
      vi.advanceTimersByTime(500);
    });

    const ids = [...result.current.items, ...result.current.verticalItems].map(
      (item) => item.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("keeps a trimmed source label on queued items and omits single-source labels", () => {
    vi.useFakeTimers();
    let roomSessions = [connected("s1", 6), connected("s2", 7)];
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.enqueueLiveBatch(batch("s1", 6, "  牌甲  ", "first"));
      vi.advanceTimersByTime(500);
    });
    expect(result.current.items).toEqual([
      expect.objectContaining({ sourceLabel: "牌甲" }),
    ]);

    roomSessions = [connected("s1", 6)];
    rerender();
    expect(result.current.items).toEqual([
      expect.objectContaining({ sourceLabel: "牌甲" }),
    ]);

    act(() => {
      result.current.enqueueLiveBatch({
        ...batch("s1", 6, "不显示", "second"),
        activeSourceCount: 1,
      });
      vi.advanceTimersByTime(500);
    });
    expect(result.current.items[result.current.items.length - 1]).toEqual(
      expect.not.objectContaining({ sourceLabel: expect.any(String) }),
    );
  });

  test("assigns five unique stable source colors to active room sessions", () => {
    vi.useFakeTimers();
    const roomSessions = [
      connected("s1", 6),
      connected("s2", 7),
      connected("s3", 8),
      connected("s4", 9),
      connected("s5", 10),
    ];
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        trackCount: 5,
        windowLabel: "main",
      }),
    );

    act(() => {
      roomSessions.forEach((session, index) => {
        result.current.enqueueLiveBatch(
          batch(
            session.sessionId,
            session.roomId as number,
            `牌${index + 1}`,
            `room-${index + 1}`,
          ),
        );
      });
      vi.advanceTimersByTime(500);
    });

    const sourceColors = result.current.items.map(
      (item) => item.sourceColorIndex,
    );
    expect(sourceColors).toHaveLength(5);
    expect(sourceColors.every((color) => typeof color === "number")).toBe(true);
    expect(new Set(sourceColors).size).toBe(5);

    const firstColor = result.current.items.find(
      (item) => item.text === "room-1",
    )?.sourceColorIndex;
    act(() => {
      vi.advanceTimersByTime(20_000);
      result.current.enqueueLiveBatch(batch("s1", 6, "牌1", "room-1-again"));
      vi.advanceTimersByTime(500);
    });
    expect(
      result.current.items.find((item) => item.text === "room-1-again")
        ?.sourceColorIndex,
    ).toBe(firstColor);
  });

  test("keeps paused fan medal rules isolated by batch room", () => {
    const calls: Array<{ command: string; payload: unknown }> = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      return null;
    });
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config: configWithRules([fanRule()]),
        roomSessions: [connected("s1", 6), connected("s2", 7)],
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.enqueueLiveBatch(
        batch("s1", 6, "牌甲", "one", { currentRoomFanMedal: "unknown" }),
      );
      result.current.enqueueLiveBatch(
        batch("s2", 7, "牌乙", "two", { currentRoomFanMedal: "unknown" }),
      );
    });

    expect(calls).toEqual([
      {
        command: "pause_fan_medal_rules_for_session",
        payload: { sessionId: "s1", roomId: 6, ruleIds: ["fan-only"] },
      },
      {
        command: "pause_fan_medal_rules_for_session",
        payload: { sessionId: "s2", roomId: 7, ruleIds: ["fan-only"] },
      },
    ]);
  });

  test("re-pauses an unknown medal after the same room receives a new lease", () => {
    const calls: Array<{ command: string; payload: unknown }> = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      return null;
    });
    let roomSessions = [connected("old", 6), connected("other", 7)];
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: configWithRules([fanRule()]),
        roomSessions,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() =>
      result.current.enqueueLiveBatch(
        batch("old", 6, "牌", "old", { currentRoomFanMedal: "unknown" }),
      ),
    );
    roomSessions = [connected("new", 6), connected("other", 7)];
    rerender();
    act(() =>
      result.current.enqueueLiveBatch(
        batch("new", 6, "牌", "new", { currentRoomFanMedal: "unknown" }),
      ),
    );

    expect(calls).toEqual([
      {
        command: "pause_fan_medal_rules_for_session",
        payload: { sessionId: "old", roomId: 6, ruleIds: ["fan-only"] },
      },
      {
        command: "pause_fan_medal_rules_for_session",
        payload: { sessionId: "new", roomId: 6, ruleIds: ["fan-only"] },
      },
    ]);
  });

  test("retains horizontal items, history, and stats after all sessions disconnect", () => {
    vi.useFakeTimers();
    let roomSessions = [connected("s1", 6)];
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      result.current.setShowStats(true);
      result.current.enqueueLiveBatch(batch("s1", 6, "牌", "flying"));
      vi.advanceTimersByTime(500);
    });
    roomSessions = [];
    rerender();

    expect(result.current.items).toHaveLength(1);
    expect(result.current.historySnapshot).toHaveLength(1);
    expect(result.current.statsSnapshot.totalMessages).toBe(1);
  });

  test("retains vertical items after all sessions disconnect", () => {
    vi.useFakeTimers();
    let roomSessions = [connected("s1", 6)];
    const config: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      appearance: { ...DEFAULT_APP_CONFIG.appearance, messageFlow: "vertical" },
    };
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.enqueueLiveBatch(batch("s1", 6, "牌", "row"));
      vi.advanceTimersByTime(500);
    });
    roomSessions = [];
    rerender();

    expect(result.current.verticalItems).toHaveLength(1);
  });

  test("clears retained live state when the next connection cycle begins", () => {
    vi.useFakeTimers();
    let roomSessions = [connected("s1", 6)];
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config: DEFAULT_APP_CONFIG,
        roomSessions,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      result.current.setShowStats(true);
      result.current.enqueueLiveBatch(batch("s1", 6, "牌", "first-cycle"));
      vi.advanceTimersByTime(500);
    });
    roomSessions = [];
    rerender();
    expect(result.current.items).toHaveLength(1);

    roomSessions = [connected("s2", 7)];
    rerender();

    expect(result.current.items).toEqual([]);
    expect(result.current.historySnapshot).toEqual([]);
    expect(result.current.statsSnapshot.totalMessages).toBe(0);
  });
});

describe("useDanmakuRuntime flow routing", () => {
  test("routes after the config is committed before a same-commit layout callback", () => {
    vi.useFakeTimers();
    let config: AppConfig = DEFAULT_APP_CONFIG;
    let enqueueOnCommit = false;
    const { result, rerender } = renderHook(() => {
      const runtime = useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      });
      useLayoutEffect(() => {
        if (!enqueueOnCommit) {
          return;
        }
        enqueueBatch(runtime, [unknownDanmaku("same-render")]);
      }, [runtime.messageFlow]);
      return runtime;
    });

    config = {
      ...DEFAULT_APP_CONFIG,
      appearance: {
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "vertical",
      },
    };
    enqueueOnCommit = true;
    rerender();
    act(() => vi.advanceTimersByTime(500));

    expect(result.current.items).toEqual([]);
    expect(result.current.verticalItems).toEqual([
      expect.objectContaining({ text: "正文" }),
    ]);
    expect(result.current.historySnapshot).toEqual([]);
    act(() => result.current.setShowHistory(true));
    expect(result.current.historySnapshot).toEqual([
      expect.objectContaining({ id: "current:same-render:0" }),
    ]);
  });

  test("routes one accepted message only to vertical mode and counts history once", () => {
    vi.useFakeTimers();
    const config: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      appearance: {
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "vertical",
      },
    };
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      enqueueBatch(result.current, [unknownDanmaku("vertical")]);
      vi.advanceTimersByTime(500);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.verticalItems).toHaveLength(1);
    expect(result.current.historySnapshot).toHaveLength(1);
  });

  test("mode change clears displays but preserves history and stats", () => {
    vi.useFakeTimers();
    let config: AppConfig = DEFAULT_APP_CONFIG;
    const { result, rerender } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      result.current.setShowStats(true);
      enqueueBatch(result.current, [unknownDanmaku("before-switch")]);
      vi.advanceTimersByTime(500);
    });

    config = {
      ...DEFAULT_APP_CONFIG,
      appearance: {
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "vertical",
      },
    };
    rerender();

    expect(result.current.items).toEqual([]);
    expect(result.current.verticalItems).toEqual([]);
    expect(result.current.historySnapshot).toHaveLength(1);
    expect(result.current.statsSnapshot.totalMessages).toBe(1);
  });

  test("keeps open history synchronized when a mock burst routes vertically", () => {
    vi.useFakeTimers();
    const config: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      appearance: {
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "vertical",
      },
    };
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => result.current.setShowHistory(true));
    act(() => {
      result.current.triggerMockBurst();
      vi.advanceTimersByTime(500);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.verticalItems).toHaveLength(4);
    expect(result.current.historySnapshot).toHaveLength(80);
  });
});

describe("useDanmakuRuntime followed users", () => {
  test("propagates followed user decisions to visible items", async () => {
    vi.useFakeTimers();
    const config = configWithRules([uidRule("highlight")]);
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      enqueueBatch(result.current, [
        {
          id: "followed",
          roomId: 6,
          senderUid: 42,
          currentRoomFanMedalLevel: 13,
          kind: "danmaku",
          user: "关注用户",
          text: "正文",
        },
      ]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.items).toEqual([
      expect.objectContaining({
        id: "current:followed:0-0",
        followedUser: true,
        highlighted: false,
        currentRoomFanMedalLevel: 13,
      }),
    ]);
  });

  test("keeps hidden followed uid messages out of items and history", async () => {
    vi.useFakeTimers();
    const config = configWithRules([uidRule("hide")]);
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      enqueueBatch(result.current, [
        {
          id: "hidden",
          roomId: 6,
          senderUid: 42,
          kind: "danmaku",
          user: "屏蔽用户",
          text: "正文",
        },
      ]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.historySnapshot).toEqual([]);
  });
});

describe("useDanmakuRuntime fan medal pauses", () => {
  test("rejects wrong-room unknown medals before filter side effects", async () => {
    vi.useFakeTimers();
    const calls: Array<{ command: string; payload: unknown }> = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      return null;
    });
    const config = configWithRules([fanRule()]);
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      result.current.setShowStats(true);
    });
    act(() => {
      enqueueBatch(result.current, [
        { ...unknownDanmaku("wrong-room"), roomId: 7 },
      ]);
      vi.advanceTimersByTime(1_000);
    });

    expect(calls).toEqual([]);
    expect(result.current.historySnapshot).toEqual([]);
    expect(result.current.statsSnapshot.totalMessages).toBe(0);
    expect(result.current.items).toEqual([]);

    act(() => {
      enqueueBatch(result.current, [unknownDanmaku("current-room")]);
      vi.advanceTimersByTime(1_000);
    });

    expect(calls).toEqual([
      {
        command: "pause_fan_medal_rules_for_session",
        payload: { sessionId: "current", roomId: 6, ruleIds: ["fan-only"] },
      },
    ]);
    expect(result.current.historySnapshot).toEqual([
      expect.objectContaining({ id: "current:current-room:0" }),
    ]);
    expect(result.current.statsSnapshot.totalMessages).toBe(1);
    expect(result.current.items).toEqual([
      expect.objectContaining({ id: "current:current-room:0-0" }),
    ]);
  });

  test("reports each uncertain rule once per connection and resets on clear", async () => {
    vi.useFakeTimers();
    const calls: Array<{ command: string; payload: unknown }> = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      return null;
    });
    const config = configWithRules([fanRule()]);
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      enqueueBatch(result.current, [unknownDanmaku("u1")]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(calls).toContainEqual({
      command: "pause_fan_medal_rules_for_session",
      payload: { sessionId: "current", roomId: 6, ruleIds: ["fan-only"] },
    });
    expect(result.current.items).toHaveLength(1);

    act(() => {
      enqueueBatch(result.current, [unknownDanmaku("u2")]);
    });
    expect(
      calls.filter(
        ({ command }) => command === "pause_fan_medal_rules_for_session",
      ),
    ).toHaveLength(1);

    act(() => {
      result.current.clearLiveMessageState();
      enqueueBatch(result.current, [unknownDanmaku("u3")]);
    });
    expect(
      calls.filter(
        ({ command }) => command === "pause_fan_medal_rules_for_session",
      ),
    ).toHaveLength(2);
  });

  test("pauses immediately within a batch while other filters still hide", async () => {
    vi.useFakeTimers();
    const calls: Array<{ command: string; payload: unknown }> = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      return null;
    });
    const config = configWithRules(
      [
        fanRule("fan-first"),
        fanRule("fan-second"),
        {
          id: "uid-hide",
          enabled: true,
          name: "屏蔽用户",
          target: "senderUid",
          operator: "equals",
          value: "42",
          action: "hide",
        },
        {
          id: "comment-hide",
          enabled: true,
          name: "屏蔽正文",
          target: "text",
          operator: "contains",
          value: "剧透",
          action: "hide",
        },
      ],
      ["屏蔽"],
    );
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.setShowHistory(true);
      enqueueBatch(result.current, [
        unknownDanmaku("blocked-word", "命中屏蔽词"),
        { ...unknownDanmaku("blocked-user"), senderUid: 42 },
        unknownDanmaku("blocked-comment", "含有剧透内容"),
        unknownDanmaku("visible"),
      ]);
    });

    expect(calls).toContainEqual({
      command: "pause_fan_medal_rules_for_session",
      payload: {
        sessionId: "current",
        roomId: 6,
        ruleIds: ["fan-first", "fan-second"],
      },
    });
    expect(result.current.historySnapshot).toEqual([
      expect.objectContaining({ id: "current:visible:3" }),
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.items).toEqual([
      expect.objectContaining({ id: "current:visible:3-0", text: "正文" }),
    ]);
  });

  test("keeps local pauses after the warning command fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const calls: string[] = [];
    mockIPC((command) => {
      calls.push(command);
      if (command === "pause_fan_medal_rules_for_session") {
        throw new Error("ipc unavailable");
      }
      return null;
    });
    const config = configWithRules([fanRule()]);
    const { result } = renderHook(() =>
      useDanmakuRuntime({
        config,
        roomSessions: CONNECTED_SESSIONS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      enqueueBatch(result.current, [unknownDanmaku("u1")]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      enqueueBatch(result.current, [unknownDanmaku("u2")]);
    });

    expect(
      calls.filter(
        (command) => command === "pause_fan_medal_rules_for_session",
      ),
    ).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });
});
