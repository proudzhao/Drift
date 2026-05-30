import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ControlPanel } from "./components/control/ControlPanel";
import { DanmakuOverlay } from "./components/DanmakuOverlay";
import {
  DanmakuHistoryDrawer,
  type HistoryMessage,
} from "./components/DanmakuHistoryDrawer";
import { EditModePanel } from "./components/EditModePanel";
import { MockDanmakuPanel } from "./components/MockDanmakuPanel";
import { SendDanmakuWindow } from "./components/SendDanmakuWindow";
import {
  generateMockBatch,
  generateMockMessage,
} from "./data/mockDanmaku";
import {
  DEFAULT_APP_CONFIG,
  defaultShortcutLabel,
  mergeAppConfig,
  type AppConfig,
} from "./types/config";
import { applyFilterConfig } from "./utils/filterRules";
import type {
  DanmakuItem,
  DanmakuStatus,
  LiveMessage,
} from "./types/danmaku";
import "./App.css";
import "./styles/send-window.css";

const DANMAKU_FLUSH_INTERVAL_MS = 500;
const TRACK_HEIGHT = 38;
const MIN_TRACK_COUNT = 3;
const MIN_WINDOW_WIDTH = 720;
const MIN_WINDOW_HEIGHT = 160;
const DEFAULT_SHORTCUT = defaultShortcutLabel();
const MIN_ALIVE_MS = 4000;
const MAX_PENDING_QUEUE = 200;
const ELDER_RATIO = 0.15;
const MIN_LANE_GAP_PX = 120;
const MAX_REQUEUE_ROUNDS = 6;
const MAX_REQUEUE_LATENCY_MS = 3000;
const TERMINAL_DANMAKU_STATUSES: DanmakuStatus["status"][] = [
  "disconnected",
  "not_live",
  "invalid_room",
];

type EditModeChanged = {
  is_edit_mode: boolean;
  is_click_through: boolean;
  shortcut: string;
};

type ResizeDirection = "NorthWest" | "NorthEast" | "SouthEast" | "SouthWest";
type Density = AppConfig["appearance"]["density"];

type QueuedLiveMessage = LiveMessage & {
  attempts: number;
  highlighted?: boolean;
  queuedAt: number;
};

type MockState = {
  active: boolean;
  rate: number;
  totalGenerated: number;
};

const DENSITY_PER_TRACK: Record<
  Density,
  { itemsPerTrack: number; perFlushPerTrack: number }
> = {
  low: { itemsPerTrack: 1.5, perFlushPerTrack: 0.2 },
  medium: { itemsPerTrack: 3.0, perFlushPerTrack: 0.5 },
  high: { itemsPerTrack: 5.0, perFlushPerTrack: 1.0 },
};

function calcDensityLimits(
  density: Density,
  trackCount: number,
): { maxItems: number; perFlush: number } {
  const cfg = DENSITY_PER_TRACK[density];
  return {
    maxItems: Math.max(
      MIN_TRACK_COUNT,
      Math.ceil(cfg.itemsPerTrack * trackCount),
    ),
    perFlush: Math.max(1, Math.ceil(cfg.perFlushPerTrack * trackCount)),
  };
}

function estimateTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((width, character) => {
    return width + (character.charCodeAt(0) <= 0x7f ? fontSize * 0.56 : fontSize);
  }, 0);
}

function estimateMessageWidth(
  message: LiveMessage,
  fontSize: number,
  showUsername: boolean,
) {
  const displayText =
    showUsername && message.user ? `${message.user}: ${message.text}` : message.text;
  return Math.max(80, estimateTextWidth(displayText, fontSize));
}

function laneCooldownMs(width: number, durationSeconds: number) {
  const viewportWidth =
    typeof window === "undefined" ? 1280 : Math.max(1, window.innerWidth);
  const travelDistance = viewportWidth + width + 64;
  const pixelsPerMs = travelDistance / (durationSeconds * 1000);
  return Math.ceil((width + MIN_LANE_GAP_PX) / pixelsPerMs);
}

function ensureLaneAvailability(lanes: number[], trackCount: number) {
  if (lanes.length > trackCount) {
    lanes.length = trackCount;
  }

  while (lanes.length < trackCount) {
    lanes.push(0);
  }
}

function findAvailableTrack(lanes: number[], now: number) {
  let selectedTrack: number | null = null;
  let oldestAvailability = Number.POSITIVE_INFINITY;

  lanes.forEach((availableAt, track) => {
    if (availableAt <= now && availableAt < oldestAvailability) {
      selectedTrack = track;
      oldestAvailability = availableAt;
    }
  });

  return selectedTrack;
}

function isMessageTypeVisible(message: LiveMessage, config: AppConfig) {
  switch (message.kind) {
    case "gift":
      return config.messageDisplay.showGift;
    case "guard":
      return config.messageDisplay.showGuard;
    case "danmaku":
    default:
      return config.messageDisplay.showDanmaku;
  }
}

function App() {
  const windowLabel = getCurrentWindow().label;
  const [isClickThrough, setIsClickThrough] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [trackCount, setTrackCount] = useState(MIN_TRACK_COUNT);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const configRef = useRef<AppConfig>(DEFAULT_APP_CONFIG);
  const [status, setStatus] = useState<DanmakuStatus>({
    status: "idle",
    message: "尚未连接直播间",
  });
  const [liveItems, setLiveItems] = useState<DanmakuItem[]>([]);
  const pendingMessagesRef = useRef<QueuedLiveMessage[]>([]);
  const laneAvailableAtRef = useRef<number[]>([]);
  const activeRoomIdRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const historyRef = useRef<HistoryMessage[]>([]);
  const [historySnapshot, setHistorySnapshot] = useState<HistoryMessage[]>([]);
  const HISTORY_MAX = 300;

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

  async function setEditMode(enabled: boolean) {
    const result = await invoke<EditModeChanged>("set_edit_mode", { enabled });
    setIsEditMode(result.is_edit_mode);
    setIsClickThrough(result.is_click_through);
    setShortcut(result.shortcut);
  }

  async function exitEditMode() {
    await setEditMode(false);
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

  async function startDragging(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0 || !isEditMode) {
      return;
    }

    event.preventDefault();
    await getCurrentWindow().startDragging();
  }

  async function startResizeDragging(
    direction: ResizeDirection,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0 || !isEditMode) {
      return;
    }

    event.preventDefault();
    await getCurrentWindow().startResizeDragging(direction);
  }

  useEffect(() => {
    void invoke<AppConfig>("load_app_config").then((loadedConfig) => {
      setConfig(mergeAppConfig(loadedConfig));
    });

    const unlistenMessage = listen<LiveMessage[]>(
      "danmaku-messages",
      (event) => {
        if (windowLabel !== "main") {
          return;
        }

        const acceptedMessages = filterMessages(event.payload);
        const currentRoomMessages = acceptedMessages.filter(
          acceptsCurrentRoomMessage,
        );
        if (currentRoomMessages.length === 0) {
          return;
        }

        enqueueMessages(currentRoomMessages);
        pushToHistory(currentRoomMessages);
      },
    );
    const unlistenStatus = listen<DanmakuStatus>("danmaku-status", (event) => {
      if (windowLabel === "main") {
        const nextRoomId = event.payload.roomId ?? null;
        const isNewConnectionStart =
          event.payload.status === "connecting" && nextRoomId === null;
        const isRoomChanged =
          nextRoomId !== null && nextRoomId !== activeRoomIdRef.current;
        const isTerminalStatus = TERMINAL_DANMAKU_STATUSES.includes(
          event.payload.status,
        );

        if (isNewConnectionStart || isRoomChanged || isTerminalStatus) {
          clearLiveMessageState();
        }

        if (isTerminalStatus || isNewConnectionStart) {
          activeRoomIdRef.current = null;
        } else if (nextRoomId !== null) {
          activeRoomIdRef.current = nextRoomId;
        }
      }

      setStatus((current) => ({
        ...current,
        ...event.payload,
        anchorName: event.payload.anchorName ?? current.anchorName,
        roomId: event.payload.roomId ?? current.roomId,
        liveStatus: event.payload.liveStatus ?? current.liveStatus,
      }));
    });
    const unlistenEditMode = listen<EditModeChanged>(
      "edit-mode-changed",
      (event) => {
        setIsEditMode(event.payload.is_edit_mode);
        setIsClickThrough(event.payload.is_click_through);
        setShortcut(event.payload.shortcut);
      },
    );
    const unlistenConfig = listen<AppConfig>("app-config-changed", (event) => {
      setConfig(mergeAppConfig(event.payload));
    });

    return () => {
      void unlistenMessage.then((unlisten) => unlisten());
      void unlistenStatus.then((unlisten) => unlisten());
      void unlistenEditMode.then((unlisten) => unlisten());
      void unlistenConfig.then((unlisten) => unlisten());
    };
  }, [windowLabel]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    void setEditMode(true);
    void getCurrentWindow().setSizeConstraints({
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
    });
  }, [windowLabel]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    function updateTrackCount() {
      setTrackCount(
        Math.max(MIN_TRACK_COUNT, Math.floor(window.innerHeight / TRACK_HEIGHT)),
      );
    }

    updateTrackCount();
    window.addEventListener("resize", updateTrackCount);
    return () => window.removeEventListener("resize", updateTrackCount);
  }, [windowLabel]);

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
        );
        laneAvailableAtRef.current[track] =
          now + laneCooldownMs(width, duration);

        nextItems.push({
          id: `${message.id}-${sequence}`,
          kind: message.kind,
          user: message.user,
          text: message.text,
          track,
          duration,
          delay: 0,
          createdAt: now,
          highlighted: message.highlighted,
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

      setLiveItems((current) => {
        let combined = [...current, ...nextItems];

        // —— Elder promotion ——
        const elderPoolSize = Math.max(
          1,
          Math.ceil(densityLimits.maxItems * ELDER_RATIO),
        );
        const elderCount = combined.reduce(
          (count, item) => count + (item.elder ? 1 : 0),
          0,
        );
        const openElderSlots = elderPoolSize - elderCount;

        if (openElderSlots > 0) {
          const promoteNow = Date.now();
          let promoted = 0;
          combined = combined.map((item) => {
            if (promoted >= openElderSlots) return item;
            if (item.elder || item.exiting) return item;
            if (promoteNow - item.createdAt < MIN_ALIVE_MS) return item;
            promoted++;
            return { ...item, elder: true };
          });
        }

        // —— Exit marking ——
        const excess = combined.length - densityLimits.maxItems;
        if (excess <= 0) {
          return combined;
        }

        const alreadyExiting = combined.reduce(
          (count, item) => count + (item.exiting ? 1 : 0),
          0,
        );
        const toMark = Math.max(0, excess - alreadyExiting);

        if (toMark <= 0) return combined;

        const markNow = Date.now();
        let marked = 0;
        return combined.map((item) => {
          if (item.exiting || marked >= toMark) return item;
          if (item.elder) return item;
          if (markNow - item.createdAt < MIN_ALIVE_MS) return item;
          marked++;
          return { ...item, exiting: true };
        });
      });

      if (showHistory) {
        setHistorySnapshot([...historyRef.current]);
      }
    }, DANMAKU_FLUSH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [
    config.appearance.fontSize,
    config.appearance.scrollDuration,
    config.appearance.showUsername,
    densityLimits.maxItems,
    densityLimits.perFlush,
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

  const overlayClassName = [
    "overlay",
    isClickThrough ? "is-click-through" : "",
    isEditMode ? "is-edit-mode" : "is-display-mode",
  ]
    .filter(Boolean)
    .join(" ");

  if (windowLabel === "control") {
    return (
      <ControlPanel
        config={config}
        isConnected={isConnected}
        onConfigChange={(nextConfig) => setConfig(mergeAppConfig(nextConfig))}
        onStatusChange={setStatus}
        status={status}
      />
    );
  }

  if (windowLabel === "send") {
    return <SendDanmakuWindow />;
  }

  return (
    <main
      className={overlayClassName}
      style={
        {
          "--danmaku-font-size": `${config.appearance.fontSize}px`,
          "--danmaku-opacity": config.appearance.opacity,
        } as CSSProperties
      }
    >
      <DanmakuOverlay
        items={items}
        onItemDone={isConnected || mock.active ? removeDanmakuItem : undefined}
        showUsername={config.appearance.showUsername}
        trackCount={trackCount}
      />
      {isEditMode ? (
        <>
          <section
            className="edit-drag-region"
            data-tauri-drag-region
            onMouseDown={startDragging}
          >
            <span>拖动调整弹幕区域位置</span>
          </section>
          <EditModePanel
            onExitEditMode={exitEditMode}
            onToggleHistory={() =>
              setShowHistory((prev) => !prev)
            }
            shortcut={shortcut}
          />
          {showHistory ? (
            <DanmakuHistoryDrawer
              messages={historySnapshot}
              onClose={() => setShowHistory(false)}
            />
          ) : null}
          {config.mockPanelEnabled ? (
            <MockDanmakuPanel
              active={mock.active}
              onBurst={triggerMockBurst}
              onRateChange={handleMockRateChange}
              onStart={startMockDanmaku}
              onStop={stopMockDanmaku}
              rate={mock.rate}
              totalGenerated={mock.totalGenerated}
            />
          ) : null}
          {(
            [
              ["NorthWest", "nw"],
              ["NorthEast", "ne"],
              ["SouthEast", "se"],
              ["SouthWest", "sw"],
            ] as const
          ).map(([direction, className]) => (
            <button
              aria-label={`Resize ${direction}`}
              className={`resize-handle resize-handle-${className}`}
              key={direction}
              onMouseDown={(event) => startResizeDragging(direction, event)}
              title="拖拽调整窗口大小"
              type="button"
            />
          ))}
        </>
      ) : null}
    </main>
  );
}

export default App;
