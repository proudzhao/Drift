import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HistoryMessage } from "../components/DanmakuHistoryDrawer";
import {
  generateMockBatch,
  generateMockMessage,
} from "../data/mockDanmaku";
import type { AppConfig } from "../types/config";
import type {
  DanmakuItem,
  DanmakuStatus,
  LiveMessage,
  QueuedLiveMessage,
  VerticalChatItem,
} from "../types/danmaku";
import type { VerticalFlowStatus } from "../types/verticalFlow";
import {
  calcDensityLimits,
  DANMAKU_FLUSH_INTERVAL_MS,
  ensureLaneAvailability,
  estimateMessageWidth,
  findAvailableTrack,
  isProtectedMessage,
  isMessageTypeVisible,
  laneCooldownMs,
  MAX_PENDING_QUEUE,
  MAX_REQUEUE_LATENCY_MS,
  MAX_REQUEUE_ROUNDS,
  resolveMessageDuration,
} from "../utils/danmakuRuntime";
import {
  appendStatsEntries,
  buildStatsSnapshot,
  createEmptyStatsSnapshot,
  createKindCounts,
  type DanmakuStatsEntry,
  type DanmakuStatsSnapshot,
} from "../utils/danmakuStats";
import { applyFilterConfig } from "../utils/filterRules";
import { useVerticalChatRuntime } from "./useVerticalChatRuntime";

const HISTORY_MAX = 300;
const STATS_REFRESH_INTERVAL_MS = 1000;

export type MockState = {
  active: boolean;
  rate: number;
  totalGenerated: number;
};

type UseDanmakuRuntimeParams = {
  config: AppConfig;
  status: DanmakuStatus;
  trackCount: number;
  windowLabel: string;
};

export type UseDanmakuRuntimeResult = {
  activeRoomIdRef: MutableRefObject<number | null>;
  clearLiveMessageState: () => void;
  enqueueLiveMessages: (messages: LiveMessage[]) => void;
  handleMockRateChange: (rate: number) => void;
  historySnapshot: HistoryMessage[];
  items: DanmakuItem[];
  messageFlow: AppConfig["appearance"]["messageFlow"];
  mock: MockState;
  pruneVerticalItems: (itemIds: string[]) => void;
  removeDanmakuItem: (itemId: string) => void;
  setShowStats: Dispatch<SetStateAction<boolean>>;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  showHistory: boolean;
  showStats: boolean;
  startMockDanmaku: () => void;
  statsSnapshot: DanmakuStatsSnapshot;
  stopMockDanmaku: () => void;
  triggerMockBurst: () => void;
  verticalFlowStatus: VerticalFlowStatus;
  verticalItems: VerticalChatItem[];
};

export function useDanmakuRuntime({
  config,
  status,
  trackCount,
  windowLabel,
}: UseDanmakuRuntimeParams): UseDanmakuRuntimeResult {
  const configRef = useRef<AppConfig>(config);
  const [liveItems, setLiveItems] = useState<DanmakuItem[]>([]);
  const liveItemsRef = useRef<DanmakuItem[]>([]);
  const pendingMessagesRef = useRef<QueuedLiveMessage[]>([]);
  const priorityMessagesRef = useRef<QueuedLiveMessage[]>([]);
  const laneAvailableAtRef = useRef<number[]>([]);
  const activeRoomIdRef = useRef<number | null>(null);
  const pausedFanMedalRuleIdsRef = useRef(new Set<string>());
  const sequenceRef = useRef(0);
  const historyRef = useRef<HistoryMessage[]>([]);
  const statsStartedAtRef = useRef(Date.now());
  const statsEntriesRef = useRef<DanmakuStatsEntry[]>([]);
  const statsKindCountsRef = useRef(createKindCounts());
  const statsTotalMessagesRef = useRef(0);
  const statsDirtyRef = useRef(false);
  const [historySnapshot, setHistorySnapshot] = useState<HistoryMessage[]>([]);
  const [statsSnapshot, setStatsSnapshot] = useState(() =>
    createEmptyStatsSnapshot(statsStartedAtRef.current),
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const showHistoryRef = useRef(showHistory);
  const [mock, setMock] = useState<MockState>({
    active: false,
    rate: 50,
    totalGenerated: 0,
  });
  showHistoryRef.current = showHistory;

  const densityLimits = useMemo(
    () => calcDensityLimits(config.appearance.density, trackCount),
    [config.appearance.density, trackCount],
  );
  const isConnected =
    status.status === "connecting" ||
    status.status === "connected" ||
    status.status === "reconnecting";
  const items = isConnected || mock.active ? liveItems : [];
  const messageFlow = config.appearance.messageFlow;
  const verticalRuntime = useVerticalChatRuntime({
    active:
      windowLabel === "main" &&
      messageFlow === "vertical" &&
      (isConnected || mock.active),
    density: config.appearance.density,
    policy: config.appearance.verticalOverflowPolicy,
  });
  const verticalItems = isConnected || mock.active ? verticalRuntime.items : [];

  function clearHorizontalDisplayState() {
    pendingMessagesRef.current = [];
    priorityMessagesRef.current = [];
    laneAvailableAtRef.current = [];
    sequenceRef.current = 0;
    liveItemsRef.current = [];
    setLiveItems([]);
  }

  function clearLiveMessageState() {
    clearHorizontalDisplayState();
    verticalRuntime.clear();
    pausedFanMedalRuleIdsRef.current.clear();
    historyRef.current = [];
    resetStats();
    setHistorySnapshot([]);
  }

  function resetStats() {
    const now = Date.now();
    statsStartedAtRef.current = now;
    statsEntriesRef.current = [];
    statsKindCountsRef.current = createKindCounts();
    statsTotalMessagesRef.current = 0;
    statsDirtyRef.current = false;
    setStatsSnapshot(createEmptyStatsSnapshot(now));
  }

  function acceptsCurrentRoomMessage(message: LiveMessage) {
    const activeRoomId = activeRoomIdRef.current;
    return activeRoomId !== null && message.roomId === activeRoomId;
  }

  function filterMessages(messages: LiveMessage[]) {
    const accepted: QueuedLiveMessage[] = [];
    const newlyPausedRuleIds = new Set<string>();
    const now = Date.now();

    for (const message of messages) {
      const currentConfig = configRef.current;
      if (!isMessageTypeVisible(message, currentConfig)) {
        continue;
      }

      const decision = applyFilterConfig(message, currentConfig.filter, {
        pausedFanMedalRuleIds: pausedFanMedalRuleIdsRef.current,
      });
      for (const ruleId of decision.pauseFanMedalRuleIds) {
        if (!pausedFanMedalRuleIdsRef.current.has(ruleId)) {
          pausedFanMedalRuleIdsRef.current.add(ruleId);
          newlyPausedRuleIds.add(ruleId);
        }
      }
      if (!decision.visible) {
        continue;
      }

      accepted.push({
        ...message,
        attempts: 0,
        followedUser: decision.followedUser,
        highlighted: decision.highlighted,
        queuedAt: now,
      });
    }

    const activeRoomId = activeRoomIdRef.current;
    if (
      Number.isInteger(activeRoomId) &&
      (activeRoomId ?? 0) > 0 &&
      newlyPausedRuleIds.size > 0
    ) {
      void invoke("pause_fan_medal_rules_for_session", {
        roomId: activeRoomId,
        ruleIds: [...newlyPausedRuleIds],
      }).catch(() => {
        console.warn("Failed to report paused fan medal filter rules.");
      });
    }

    return accepted;
  }

  function pushToHistory(messages: QueuedLiveMessage[]) {
    for (const msg of messages) {
      historyRef.current.push({
        id: msg.id,
        kind: msg.kind,
        user: msg.user,
        text: msg.text,
        timestamp: Date.now(),
      });
    }
    if (historyRef.current.length > HISTORY_MAX) {
      historyRef.current.splice(
        0,
        historyRef.current.length - HISTORY_MAX,
      );
    }
    if (showHistoryRef.current) {
      setHistorySnapshot([...historyRef.current]);
    }
  }

  function pushToStats(messages: QueuedLiveMessage[]) {
    if (messages.length === 0) {
      return;
    }

    appendStatsEntries(
      statsEntriesRef.current,
      statsKindCountsRef.current,
      messages,
    );
    statsTotalMessagesRef.current += messages.length;
    statsDirtyRef.current = true;
  }

  function refreshStatsSnapshot(force = false) {
    if (!force && !statsDirtyRef.current) {
      return;
    }

    const nextSnapshot = buildStatsSnapshot(
      statsEntriesRef.current,
      statsKindCountsRef.current,
      statsTotalMessagesRef.current,
      statsStartedAtRef.current,
    );
    setStatsSnapshot(nextSnapshot);
    statsDirtyRef.current = false;
  }

  function enqueueMessages(messages: QueuedLiveMessage[]) {
    for (const message of messages) {
      if (isProtectedMessage(message)) {
        priorityMessagesRef.current.push(message);
      } else {
        pendingMessagesRef.current.push(message);
      }
    }
    trimPendingMessages();
  }

  function trimPendingMessages() {
    const excess = pendingMessagesRef.current.length - MAX_PENDING_QUEUE;
    if (excess > 0) {
      pendingMessagesRef.current.splice(0, excess);
    }
  }

  function dropExpiredPendingMessages(now: number) {
    pendingMessagesRef.current = pendingMessagesRef.current.filter(
      (message) => now - message.queuedAt < MAX_REQUEUE_LATENCY_MS,
    );
  }

  function takePendingMessages(limit: number) {
    const priorityMessages = priorityMessagesRef.current.splice(0, limit);
    if (priorityMessages.length >= limit) {
      return priorityMessages;
    }

    return priorityMessages.concat(
      pendingMessagesRef.current.splice(0, limit - priorityMessages.length),
    );
  }

  function requeueDelayedMessages(messages: QueuedLiveMessage[]) {
    const delayedPriorityMessages: QueuedLiveMessage[] = [];
    const delayedNormalMessages: QueuedLiveMessage[] = [];

    for (const message of messages) {
      if (isProtectedMessage(message)) {
        delayedPriorityMessages.push(message);
      } else {
        delayedNormalMessages.push(message);
      }
    }

    if (delayedPriorityMessages.length > 0) {
      priorityMessagesRef.current.unshift(...delayedPriorityMessages);
    }
    if (delayedNormalMessages.length > 0) {
      pendingMessagesRef.current.unshift(...delayedNormalMessages);
      trimPendingMessages();
    }
  }

  function enqueueLiveMessages(messages: LiveMessage[]) {
    acceptMessages(messages, true);
  }

  function routeToDisplayScheduler(messages: QueuedLiveMessage[]) {
    if (configRef.current.appearance.messageFlow === "vertical") {
      verticalRuntime.enqueue(messages);
      return;
    }
    enqueueMessages(messages);
  }

  function acceptMessages(messages: LiveMessage[], requireCurrentRoom: boolean) {
    const currentRoomMessages = requireCurrentRoom
      ? messages.filter(acceptsCurrentRoomMessage)
      : messages;
    const displayMessages = filterMessages(currentRoomMessages);
    if (displayMessages.length === 0) {
      return;
    }

    pushToHistory(displayMessages);
    pushToStats(displayMessages);
    routeToDisplayScheduler(displayMessages);
  }

  function removeDanmakuItem(itemId: string) {
    const nextItems = liveItemsRef.current.filter((item) => item.id !== itemId);
    liveItemsRef.current = nextItems;
    setLiveItems(nextItems);
  }

  function startMockDanmaku() {
    setMock((prev) => ({ ...prev, active: true }));
  }

  function stopMockDanmaku() {
    setMock((prev) => ({ ...prev, active: false }));
    clearLiveMessageState();
  }

  function handleMockRateChange(rate: number) {
    setMock((prev) => ({ ...prev, rate }));
  }

  function triggerMockBurst() {
    const batch = generateMockBatch(80);
    acceptMessages(batch, false);
    setMock((prev) => ({
      ...prev,
      totalGenerated: prev.totalGenerated + batch.length,
    }));
  }

  useLayoutEffect(() => {
    configRef.current = config;
  }, [config]);

  const previousMessageFlowRef = useRef(messageFlow);
  useLayoutEffect(() => {
    if (previousMessageFlowRef.current === messageFlow) {
      return;
    }

    previousMessageFlowRef.current = messageFlow;
    clearHorizontalDisplayState();
    verticalRuntime.clear();
  }, [messageFlow]);

  useEffect(() => {
    if (windowLabel !== "main" || messageFlow !== "horizontal") {
      return;
    }

    ensureLaneAvailability(laneAvailableAtRef.current, trackCount);

    const interval = window.setInterval(() => {
      ensureLaneAvailability(laneAvailableAtRef.current, trackCount);
      const now = Date.now();
      dropExpiredPendingMessages(now);

      const openItemSlots = Math.max(
        0,
        densityLimits.maxItems - liveItemsRef.current.length,
      );
      if (openItemSlots === 0) {
        return;
      }

      const pendingMessages = takePendingMessages(
        Math.min(densityLimits.perFlush, openItemSlots),
      );

      if (pendingMessages.length === 0) {
        return;
      }

      const nextItems: DanmakuItem[] = [];
      const delayedMessages: QueuedLiveMessage[] = [];

      for (const message of pendingMessages) {
        const sequence = sequenceRef.current;

        const duration = resolveMessageDuration(
          message,
          config.appearance.scrollDuration,
          sequence,
        );
        const messageNow = Date.now();
        const track = findAvailableTrack(laneAvailableAtRef.current, messageNow);
        if (track === null) {
          if (
            isProtectedMessage(message) ||
            (message.attempts < MAX_REQUEUE_ROUNDS &&
              messageNow - message.queuedAt < MAX_REQUEUE_LATENCY_MS)
          ) {
            delayedMessages.push({
              ...message,
              attempts: message.attempts + 1,
            });
          }
          continue;
        }

        sequenceRef.current += 1;
        const width = estimateMessageWidth(
          message,
          config.appearance.fontSize,
          config.appearance.showUsername,
          config.messageDisplay.showEmotes,
        );
        laneAvailableAtRef.current[track] =
          messageNow + laneCooldownMs(width, duration);

        nextItems.push({
          id: `${message.id}-${sequence}`,
          kind: message.kind,
          user: message.user,
          text: message.text,
          segments: message.segments,
          currentRoomFanMedalLevel: message.currentRoomFanMedalLevel,
          track,
          duration,
          delay: 0,
          createdAt: messageNow,
          followedUser: message.followedUser,
          highlighted: message.highlighted,
          isSelf: message.isSelf,
          superChatPrice: message.superChatPrice,
          superChatDuration: message.superChatDuration,
          superChatColor: message.superChatColor,
        });
      }

      if (delayedMessages.length > 0) {
        requeueDelayedMessages(delayedMessages);
      }

      if (nextItems.length === 0) {
        if (showHistory) {
          setHistorySnapshot([...historyRef.current]);
        }
        return;
      }

      const nextLiveItems = liveItemsRef.current.concat(nextItems);
      liveItemsRef.current = nextLiveItems;
      setLiveItems(nextLiveItems);

      if (showHistory) {
        setHistorySnapshot([...historyRef.current]);
      }
    }, DANMAKU_FLUSH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [
    config.appearance.fontSize,
    config.appearance.scrollDuration,
    config.appearance.showUsername,
    config.messageDisplay.showEmotes,
    densityLimits,
    showHistory,
    trackCount,
    windowLabel,
    messageFlow,
  ]);

  useEffect(() => {
    if (isConnected && mock.active) {
      setMock((prev) => ({ ...prev, active: false }));
      clearLiveMessageState();
    }
  }, [isConnected, mock.active]);

  useEffect(() => {
    if (showHistory) {
      setHistorySnapshot([...historyRef.current]);
    }
  }, [showHistory]);

  useEffect(() => {
    if (showStats) {
      refreshStatsSnapshot(true);
    }
  }, [showStats]);

  useEffect(() => {
    if (windowLabel !== "main" || !showStats) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshStatsSnapshot(true);
    }, STATS_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [showStats, windowLabel]);

  useEffect(() => {
    if (windowLabel !== "main" || !mock.active) {
      return;
    }

    const intervalMs = Math.max(5, Math.floor(1000 / mock.rate));
    const timer = window.setInterval(() => {
      const message = generateMockMessage();
      acceptMessages([message], false);
      setMock((prev) => ({
        ...prev,
        totalGenerated: prev.totalGenerated + 1,
      }));
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [mock.active, mock.rate, windowLabel]);

  return {
    activeRoomIdRef,
    clearLiveMessageState,
    enqueueLiveMessages,
    handleMockRateChange,
    historySnapshot,
    items,
    messageFlow,
    mock,
    pruneVerticalItems: verticalRuntime.prune,
    removeDanmakuItem,
    setShowStats,
    setShowHistory,
    showHistory,
    showStats,
    startMockDanmaku,
    statsSnapshot,
    stopMockDanmaku,
    triggerMockBurst,
    verticalFlowStatus: verticalRuntime.status,
    verticalItems,
  };
}
