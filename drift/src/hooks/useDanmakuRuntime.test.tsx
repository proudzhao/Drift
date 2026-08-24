import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../types/config";
import type { DanmakuStatus, LiveMessage } from "../types/danmaku";
import { useDanmakuRuntime } from "./useDanmakuRuntime";

const CONNECTED_STATUS: DanmakuStatus = {
  status: "connected",
  message: "connected",
  roomId: 6,
};

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

describe("useDanmakuRuntime flow routing", () => {
  test("routes after the config is committed before a same-commit layout callback", () => {
    vi.useFakeTimers();
    let config: AppConfig = DEFAULT_APP_CONFIG;
    let enqueueOnCommit = false;
    const { result, rerender } = renderHook(() => {
      const runtime = useDanmakuRuntime({
        config,
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      });
      useLayoutEffect(() => {
        if (!enqueueOnCommit) {
          return;
        }
        runtime.activeRoomIdRef.current = 6;
        runtime.enqueueLiveMessages([unknownDanmaku("same-render")]);
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
      expect.objectContaining({ id: "same-render" }),
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.setShowHistory(true);
      result.current.enqueueLiveMessages([unknownDanmaku("vertical")]);
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.setShowHistory(true);
      result.current.setShowStats(true);
      result.current.enqueueLiveMessages([unknownDanmaku("before-switch")]);
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
        status: CONNECTED_STATUS,
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.enqueueLiveMessages([
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
        id: "followed-0",
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.setShowHistory(true);
      result.current.enqueueLiveMessages([
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.setShowHistory(true);
      result.current.setShowStats(true);
    });
    act(() => {
      result.current.enqueueLiveMessages([
        { ...unknownDanmaku("wrong-room"), roomId: 7 },
      ]);
      vi.advanceTimersByTime(1_000);
    });

    expect(calls).toEqual([]);
    expect(result.current.historySnapshot).toEqual([]);
    expect(result.current.statsSnapshot.totalMessages).toBe(0);
    expect(result.current.items).toEqual([]);

    act(() => {
      result.current.enqueueLiveMessages([unknownDanmaku("current-room")]);
      vi.advanceTimersByTime(1_000);
    });

    expect(calls).toEqual([
      {
        command: "pause_fan_medal_rules_for_session",
        payload: { roomId: 6, ruleIds: ["fan-only"] },
      },
    ]);
    expect(result.current.historySnapshot).toEqual([
      expect.objectContaining({ id: "current-room" }),
    ]);
    expect(result.current.statsSnapshot.totalMessages).toBe(1);
    expect(result.current.items).toEqual([
      expect.objectContaining({ id: "current-room-0" }),
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.enqueueLiveMessages([unknownDanmaku("u1")]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(calls).toContainEqual({
      command: "pause_fan_medal_rules_for_session",
      payload: { roomId: 6, ruleIds: ["fan-only"] },
    });
    expect(result.current.items).toHaveLength(1);

    act(() => {
      result.current.enqueueLiveMessages([unknownDanmaku("u2")]);
    });
    expect(
      calls.filter(
        ({ command }) => command === "pause_fan_medal_rules_for_session",
      ),
    ).toHaveLength(1);

    act(() => {
      result.current.clearLiveMessageState();
      result.current.activeRoomIdRef.current = 6;
      result.current.enqueueLiveMessages([unknownDanmaku("u3")]);
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.setShowHistory(true);
      result.current.enqueueLiveMessages([
        unknownDanmaku("blocked-word", "命中屏蔽词"),
        { ...unknownDanmaku("blocked-user"), senderUid: 42 },
        unknownDanmaku("blocked-comment", "含有剧透内容"),
        unknownDanmaku("visible"),
      ]);
    });

    expect(calls).toContainEqual({
      command: "pause_fan_medal_rules_for_session",
      payload: {
        roomId: 6,
        ruleIds: ["fan-first", "fan-second"],
      },
    });
    expect(result.current.historySnapshot).toEqual([
      expect.objectContaining({ id: "visible" }),
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.items).toEqual([
      expect.objectContaining({ id: "visible-0", text: "正文" }),
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
        status: CONNECTED_STATUS,
        trackCount: 3,
        windowLabel: "main",
      }),
    );

    act(() => {
      result.current.activeRoomIdRef.current = 6;
      result.current.enqueueLiveMessages([unknownDanmaku("u1")]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.enqueueLiveMessages([unknownDanmaku("u2")]);
    });

    expect(
      calls.filter(
        (command) => command === "pause_fan_medal_rules_for_session",
      ),
    ).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });
});
