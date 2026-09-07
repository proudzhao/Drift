import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
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
  LiveMessage,
  QueuedLiveMessage,
  VerticalChatItem,
} from "../types/danmaku";
import {
  isNetworkSessionActive,
  isSourceActive,
  type DanmakuRoomBatch,
  type RoomSourceOption,
  type RoomSessionSnapshot,
} from "../types/roomSession";
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
  appendScopedStats,
  buildScopedStatsSnapshots,
  createEmptyScopedStatsSnapshots,
  createScopedStatsState,
  type DanmakuStatsSnapshot,
  type ScopedStatsSnapshots,
} from "../utils/danmakuStats";
import { applyFilterConfig } from "../utils/filterRules";
import { useVerticalChatRuntime } from "./useVerticalChatRuntime";

const HISTORY_MAX = 300;
const STATS_REFRESH_INTERVAL_MS = 1000;
const ROOM_SOURCE_COLOR_COUNT = 5;

type SourcedLiveMessage = LiveMessage &
  Pick<
    QueuedLiveMessage,
    | "sourceLabel"
    | "sourceColorIndex"
    | "sourceSessionId"
    | "sourceRoomId"
    | "sourceAnchorName"
    | "sourceFanMedalName"
  >;

function createShuffledSourceColorOrder() {
  const order = Array.from(
    { length: ROOM_SOURCE_COLOR_COUNT },
    (_, index) => index,
  );
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

function syncSourceColorAssignments(
  assignments: Map<string, number>,
  colorOrder: number[],
  sessions: RoomSessionSnapshot[],
) {
  const activeSessions = sessions.filter((session) =>
    isSourceActive(session.status),
  );
  const activeSessionIds = new Set(
    activeSessions.map((session) => session.sessionId),
  );
  for (const sessionId of assignments.keys()) {
    if (!activeSessionIds.has(sessionId)) {
      assignments.delete(sessionId);
    }
  }

  const usedColors = new Set(assignments.values());
  for (const session of activeSessions) {
    if (assignments.has(session.sessionId)) {
      continue;
    }
    const colorIndex = colorOrder.find((color) => !usedColors.has(color));
    if (colorIndex === undefined) {
      continue;
    }
    assignments.set(session.sessionId, colorIndex);
    usedColors.add(colorIndex);
  }
}

export type MockState = {
  active: boolean;
  rate: number;
  totalGenerated: number;
};

type UseDanmakuRuntimeParams = {
  config: AppConfig;
  roomSessions: RoomSessionSnapshot[];
  roomSessionsReady?: boolean;
  trackCount: number;
  windowLabel: string;
};

export type UseDanmakuRuntimeResult = {
  clearLiveMessageState: () => void;
  enqueueLiveBatch: (batch: DanmakuRoomBatch) => void;
  handleMockRateChange: (rate: number) => void;
  historySnapshot: HistoryMessage[];
  items: DanmakuItem[];
  messageFlow: AppConfig["appearance"]["messageFlow"];
  mock: MockState;
  pruneVerticalItems: (itemIds: string[]) => void;
  removeDanmakuItem: (itemId: string) => void;
  roomSources: RoomSourceOption[];
  setShowStats: Dispatch<SetStateAction<boolean>>;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  showHistory: boolean;
  showStats: boolean;
  startMockDanmaku: () => void;
  statsSnapshot: DanmakuStatsSnapshot;
  statsSnapshots: ScopedStatsSnapshots;
  stopMockDanmaku: () => void;
  triggerMockBurst: () => void;
  verticalFlowStatus: VerticalFlowStatus;
  verticalItems: VerticalChatItem[];
};

export function useDanmakuRuntime({
  config,
  roomSessions,
  roomSessionsReady = true,
  trackCount,
  windowLabel,
}: UseDanmakuRuntimeParams): UseDanmakuRuntimeResult {
  const configRef = useRef<AppConfig>(config);
  const [liveItems, setLiveItems] = useState<DanmakuItem[]>([]);
  const liveItemsRef = useRef<DanmakuItem[]>([]);
  const pendingMessagesRef = useRef<QueuedLiveMessage[]>([]);
  const priorityMessagesRef = useRef<QueuedLiveMessage[]>([]);
  const laneAvailableAtRef = useRef<number[]>([]);
  const sessionsRef = useRef(new Map<string, RoomSessionSnapshot>());
  const sourceColorIndexBySessionRef = useRef(new Map<string, number>());
  const sourceColorOrderRef = useRef<number[] | null>(null);
  if (sourceColorOrderRef.current === null) {
    sourceColorOrderRef.current = createShuffledSourceColorOrder();
  }
  const roomSessionsReadyRef = useRef(roomSessionsReady);
  const hadNetworkActiveSessionRef = useRef(false);
  const bufferedBatchesRef = useRef<DanmakuRoomBatch[]>([]);
  const pausedRulesBySessionRef = useRef(new Map<string, Set<string>>());
  const roomSourcesRef = useRef(new Map<number, RoomSourceOption>());
  const displaySequenceRef = useRef(0);
  const sequenceRef = useRef(0);
  const historyRef = useRef<HistoryMessage[]>([]);
  const scopedStatsStateRef = useRef(createScopedStatsState(Date.now()));
  const statsDirtyRef = useRef(false);
  const [historySnapshot, setHistorySnapshot] = useState<HistoryMessage[]>([]);
  const [roomSources, setRoomSources] = useState<RoomSourceOption[]>([]);
  const [statsSnapshots, setStatsSnapshots] = useState(() =>
    createEmptyScopedStatsSnapshots(Date.now()),
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
  const hasLiveSource = roomSessions.some(
    (session) =>
      session.status === "connected" || session.status === "reconnecting",
  );
  const items = liveItems;
  const messageFlow = config.appearance.messageFlow;
  const verticalRuntime = useVerticalChatRuntime({
    active:
      windowLabel === "main" &&
      messageFlow === "vertical" &&
      (hasLiveSource || mock.active),
    density: config.appearance.density,
    policy: config.appearance.verticalOverflowPolicy,
  });
  const verticalItems = verticalRuntime.items;

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
    pausedRulesBySessionRef.current.clear();
    roomSourcesRef.current = new Map();
    historyRef.current = [];
    resetStats();
    setHistorySnapshot([]);
    setRoomSources([]);
  }

  function resetStats() {
    const now = Date.now();
    scopedStatsStateRef.current = createScopedStatsState(now);
    statsDirtyRef.current = false;
    setStatsSnapshots(createEmptyScopedStatsSnapshots(now));
  }

  function filterMessages(messages: SourcedLiveMessage[]) {
    const accepted: QueuedLiveMessage[] = [];
    const newlyPausedRuleIdsBySession = new Map<
      string,
      { roomId: number; ruleIds: Set<string> }
    >();
    const now = Date.now();

    for (const message of messages) {
      const currentConfig = configRef.current;
      if (!isMessageTypeVisible(message, currentConfig)) {
        continue;
      }

      const pausedFanMedalRuleIds = message.sourceSessionId
        ? (pausedRulesBySessionRef.current.get(message.sourceSessionId) ?? new Set())
        : new Set<string>();
      const decision = applyFilterConfig(message, currentConfig.filter, {
        pausedFanMedalRuleIds,
      });
      for (const ruleId of decision.pauseFanMedalRuleIds) {
        if (
          message.sourceSessionId &&
          message.sourceRoomId &&
          !pausedFanMedalRuleIds.has(ruleId)
        ) {
          pausedFanMedalRuleIds.add(ruleId);
          pausedRulesBySessionRef.current.set(
            message.sourceSessionId,
            pausedFanMedalRuleIds,
          );
          const paused = newlyPausedRuleIdsBySession.get(
            message.sourceSessionId,
          ) ?? { roomId: message.sourceRoomId, ruleIds: new Set<string>() };
          paused.ruleIds.add(ruleId);
          newlyPausedRuleIdsBySession.set(
            message.sourceSessionId,
            paused,
          );
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

    for (const [sessionId, { roomId, ruleIds }] of newlyPausedRuleIdsBySession) {
      void invoke("pause_fan_medal_rules_for_session", {
        sessionId,
        roomId,
        ruleIds: [...ruleIds],
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
        sourceAnchorName: msg.sourceAnchorName,
        sourceFanMedalName: msg.sourceFanMedalName,
        sourceRoomId: msg.sourceRoomId,
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

    appendScopedStats(scopedStatsStateRef.current, messages);
    statsDirtyRef.current = true;
  }

  function refreshStatsSnapshot(force = false) {
    if (!force && !statsDirtyRef.current) {
      return;
    }

    setStatsSnapshots(buildScopedStatsSnapshots(scopedStatsStateRef.current));
    statsDirtyRef.current = false;
  }

  function registerRoomSources(messages: QueuedLiveMessage[]) {
    let changed = false;

    for (const message of messages) {
      if (typeof message.sourceRoomId !== "number") {
        continue;
      }

      const anchorName = message.sourceAnchorName?.trim();
      const nextOption = {
        roomId: message.sourceRoomId,
        label: anchorName ? `${anchorName} · ${message.sourceRoomId}` : `${message.sourceRoomId}`,
      };
      const previousOption = roomSourcesRef.current.get(message.sourceRoomId);
      if (previousOption?.label === nextOption.label) {
        continue;
      }

      roomSourcesRef.current.set(message.sourceRoomId, nextOption);
      changed = true;
    }

    if (changed) {
      setRoomSources(
        [...roomSourcesRef.current.values()].sort((left, right) => left.roomId - right.roomId),
      );
    }
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

  function acceptLiveBatch(batch: DanmakuRoomBatch) {
    const session = sessionsRef.current.get(batch.sessionId);
    if (
      !session ||
      session.roomId !== batch.roomId ||
      (session.status !== "connected" && session.status !== "reconnecting") ||
      batch.messages.some((message) => message.roomId !== batch.roomId)
    ) {
      return;
    }

    const sourceFanMedalName = batch.fanMedalName?.trim();
    const sourceLabel =
      batch.activeSourceCount >= 2 && sourceFanMedalName
        ? sourceFanMedalName
        : undefined;
    const sourceColorIndex = sourceLabel
      ? sourceColorIndexBySessionRef.current.get(batch.sessionId)
      : undefined;
    acceptMessages(
      batch.messages.map((message) => ({
        ...message,
        id: `${batch.sessionId}:${message.id}:${displaySequenceRef.current++}`,
        sourceLabel,
        sourceColorIndex,
        sourceSessionId: batch.sessionId,
        sourceRoomId: batch.roomId,
        sourceAnchorName: batch.anchorName,
        sourceFanMedalName: batch.fanMedalName,
      })),
    );
  }

  function enqueueLiveBatch(batch: DanmakuRoomBatch) {
    if (!roomSessionsReadyRef.current) {
      if (bufferedBatchesRef.current.length >= 64) {
        bufferedBatchesRef.current.shift();
      }
      bufferedBatchesRef.current.push(batch);
      return;
    }
    acceptLiveBatch(batch);
  }

  function routeToDisplayScheduler(messages: QueuedLiveMessage[]) {
    if (configRef.current.appearance.messageFlow === "vertical") {
      verticalRuntime.enqueue(messages);
      return;
    }
    enqueueMessages(messages);
  }

  function acceptMessages(messages: SourcedLiveMessage[]) {
    const displayMessages = filterMessages(messages);
    if (displayMessages.length === 0) {
      return;
    }

    registerRoomSources(displayMessages);
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
    acceptMessages(batch);
    setMock((prev) => ({
      ...prev,
      totalGenerated: prev.totalGenerated + batch.length,
    }));
  }

  useLayoutEffect(() => {
    configRef.current = config;
  }, [config]);

  useLayoutEffect(() => {
    const hasNetworkActiveSession = roomSessions.some((session) =>
      isNetworkSessionActive(session.status),
    );
    if (!hadNetworkActiveSessionRef.current && hasNetworkActiveSession) {
      clearLiveMessageState();
      sourceColorIndexBySessionRef.current.clear();
      sourceColorOrderRef.current = createShuffledSourceColorOrder();
    }
    hadNetworkActiveSessionRef.current = hasNetworkActiveSession;
    sessionsRef.current = new Map(
      roomSessions.map((session) => [session.sessionId, session]),
    );
    const sourceColorOrder = sourceColorOrderRef.current;
    if (sourceColorOrder !== null) {
      syncSourceColorAssignments(
        sourceColorIndexBySessionRef.current,
        sourceColorOrder,
        roomSessions,
      );
    }
    roomSessionsReadyRef.current = roomSessionsReady;
    const sessionIds = new Set(sessionsRef.current.keys());
    for (const sessionId of pausedRulesBySessionRef.current.keys()) {
      if (!sessionIds.has(sessionId)) {
        pausedRulesBySessionRef.current.delete(sessionId);
      }
    }
    if (!roomSessionsReady || bufferedBatchesRef.current.length === 0) {
      return;
    }
    const batches = bufferedBatchesRef.current.splice(0);
    for (const batch of batches) {
      acceptLiveBatch(batch);
    }
  }, [roomSessions, roomSessionsReady]);

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
    if (
      windowLabel !== "main" ||
      messageFlow !== "horizontal" ||
      (!hasLiveSource && !mock.active)
    ) {
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
          sourceLabel: message.sourceLabel,
          sourceColorIndex: message.sourceColorIndex,
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
    hasLiveSource,
    mock.active,
  ]);

  useEffect(() => {
    if (hasLiveSource && mock.active) {
      setMock((prev) => ({ ...prev, active: false }));
      clearLiveMessageState();
    }
  }, [hasLiveSource, mock.active]);

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
      acceptMessages([message]);
      setMock((prev) => ({
        ...prev,
        totalGenerated: prev.totalGenerated + 1,
      }));
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [mock.active, mock.rate, windowLabel]);

  return {
    clearLiveMessageState,
    enqueueLiveBatch,
    handleMockRateChange,
    historySnapshot,
    items,
    messageFlow,
    mock,
    pruneVerticalItems: verticalRuntime.prune,
    removeDanmakuItem,
    roomSources,
    setShowStats,
    setShowHistory,
    showHistory,
    showStats,
    startMockDanmaku,
    statsSnapshot: statsSnapshots.all,
    statsSnapshots,
    stopMockDanmaku,
    triggerMockBurst,
    verticalFlowStatus: verticalRuntime.status,
    verticalItems,
  };
}
