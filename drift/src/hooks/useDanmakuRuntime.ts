import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
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
} from "../types/danmaku";
import {
  calcDensityLimits,
  DANMAKU_FLUSH_INTERVAL_MS,
  ensureLaneAvailability,
  estimateMessageWidth,
  findAvailableTrack,
  isMessageTypeVisible,
  laneCooldownMs,
  markExitingItems,
  MAX_PENDING_QUEUE,
  MAX_REQUEUE_LATENCY_MS,
  MAX_REQUEUE_ROUNDS,
  type QueuedLiveMessage,
} from "../utils/danmakuRuntime";
import { applyFilterConfig } from "../utils/filterRules";

const HISTORY_MAX = 300;

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
  mock: MockState;
  removeDanmakuItem: (itemId: string) => void;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  showHistory: boolean;
  startMockDanmaku: () => void;
  stopMockDanmaku: () => void;
  triggerMockBurst: () => void;
};

export function useDanmakuRuntime({
  config,
  status,
  trackCount,
  windowLabel,
}: UseDanmakuRuntimeParams): UseDanmakuRuntimeResult {
  const configRef = useRef<AppConfig>(config);
  const [liveItems, setLiveItems] = useState<DanmakuItem[]>([]);
  const pendingMessagesRef = useRef<QueuedLiveMessage[]>([]);
  const laneAvailableAtRef = useRef<number[]>([]);
  const activeRoomIdRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const historyRef = useRef<HistoryMessage[]>([]);
  const [historySnapshot, setHistorySnapshot] = useState<HistoryMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [mock, setMock] = useState<MockState>({
    active: false,
    rate: 50,
    totalGenerated: 0,
  });

  const densityLimits = useMemo(
    () => calcDensityLimits(config.appearance.density, trackCount),
    [config.appearance.density, trackCount],
  );
  const isConnected =
    status.status === "connecting" ||
    status.status === "connected" ||
    status.status === "reconnecting";
  const items = isConnected || mock.active ? liveItems : [];

  function clearLiveMessageState() {
    pendingMessagesRef.current = [];
    laneAvailableAtRef.current = [];
    sequenceRef.current = 0;
    historyRef.current = [];
    setHistorySnapshot([]);
    setLiveItems([]);
  }

  function acceptsCurrentRoomMessage(message: LiveMessage) {
    const activeRoomId = activeRoomIdRef.current;
    return activeRoomId !== null && message.roomId === activeRoomId;
  }

  function filterMessages(messages: LiveMessage[]) {
    const accepted: QueuedLiveMessage[] = [];
    const now = Date.now();

    for (const message of messages) {
      const currentConfig = configRef.current;
      if (!isMessageTypeVisible(message, currentConfig)) {
        continue;
      }

      const decision = applyFilterConfig(message, currentConfig.filter);
      if (!decision.visible) {
        continue;
      }

      accepted.push({
        ...message,
        attempts: 0,
        highlighted: decision.highlighted,
        queuedAt: now,
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
  }

  function enqueueMessages(messages: QueuedLiveMessage[]) {
    pendingMessagesRef.current.push(...messages);
    const excess = pendingMessagesRef.current.length - MAX_PENDING_QUEUE;
    if (excess > 0) {
      pendingMessagesRef.current.splice(0, excess);
    }
  }

  function enqueueLiveMessages(messages: LiveMessage[]) {
    const acceptedMessages = filterMessages(messages);
    const currentRoomMessages = acceptedMessages.filter(
      acceptsCurrentRoomMessage,
    );
    if (currentRoomMessages.length === 0) {
      return;
    }

    enqueueMessages(currentRoomMessages);
    pushToHistory(currentRoomMessages);
  }

  function removeDanmakuItem(itemId: string) {
    setLiveItems((current) => current.filter((item) => item.id !== itemId));
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
    const acceptedMessages = filterMessages(batch);
    enqueueMessages(acceptedMessages);
    pushToHistory(acceptedMessages);
    setMock((prev) => ({
      ...prev,
      totalGenerated: prev.totalGenerated + batch.length,
    }));
  }

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    ensureLaneAvailability(laneAvailableAtRef.current, trackCount);

    const interval = window.setInterval(() => {
      ensureLaneAvailability(laneAvailableAtRef.current, trackCount);
      const pendingMessages = pendingMessagesRef.current.splice(
        0,
        densityLimits.perFlush,
      );

      if (pendingMessages.length === 0) {
        return;
      }

      const nextItems: DanmakuItem[] = [];
      const delayedMessages: QueuedLiveMessage[] = [];

      for (const message of pendingMessages) {
        const sequence = sequenceRef.current;

        const duration = config.appearance.scrollDuration + (sequence % 3);
        const now = Date.now();
        const track = findAvailableTrack(laneAvailableAtRef.current, now);
        if (track === null) {
          if (
            message.attempts < MAX_REQUEUE_ROUNDS &&
            now - message.queuedAt < MAX_REQUEUE_LATENCY_MS
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
          now + laneCooldownMs(width, duration);

        nextItems.push({
          id: `${message.id}-${sequence}`,
          kind: message.kind,
          user: message.user,
          text: message.text,
          segments: message.segments,
          track,
          duration,
          delay: 0,
          createdAt: now,
          highlighted: message.highlighted,
          isSelf: message.isSelf,
        });
      }

      if (delayedMessages.length > 0) {
        pendingMessagesRef.current.unshift(...delayedMessages);
      }

      if (nextItems.length === 0) {
        if (showHistory) {
          setHistorySnapshot([...historyRef.current]);
        }
        return;
      }

      setLiveItems((current) =>
        markExitingItems(current, nextItems, densityLimits),
      );

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
    if (windowLabel !== "main" || !mock.active) {
      return;
    }

    const intervalMs = Math.max(5, Math.floor(1000 / mock.rate));
    const timer = window.setInterval(() => {
      const message = generateMockMessage();
      const acceptedMessages = filterMessages([message]);
      enqueueMessages(acceptedMessages);
      pushToHistory(acceptedMessages);
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
    mock,
    removeDanmakuItem,
    setShowHistory,
    showHistory,
    startMockDanmaku,
    stopMockDanmaku,
    triggerMockBurst,
  };
}
