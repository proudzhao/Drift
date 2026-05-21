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
import {
  createMockDanmakuItems,
  generateMockBatch,
  generateMockMessage,
} from "./data/mockDanmaku";
import {
  DEFAULT_APP_CONFIG,
  defaultShortcutLabel,
  mergeAppConfig,
  type AppConfig,
} from "./types/config";
import type {
  DanmakuItem,
  DanmakuStatus,
  LiveDanmakuMessage,
} from "./types/danmaku";
import "./App.css";

const DANMAKU_FLUSH_INTERVAL_MS = 500;
const TRACK_HEIGHT = 38;
const MIN_TRACK_COUNT = 3;
const MIN_WINDOW_WIDTH = 720;
const MIN_WINDOW_HEIGHT = 160;
const DEFAULT_SHORTCUT = defaultShortcutLabel();

type EditModeChanged = {
  is_edit_mode: boolean;
  is_click_through: boolean;
  shortcut: string;
};

type ResizeDirection = "NorthWest" | "NorthEast" | "SouthEast" | "SouthWest";
type Density = AppConfig["appearance"]["density"];

type MockState = {
  active: boolean;
  rate: number;
  totalGenerated: number;
};

const DENSITY_LIMITS: Record<Density, { maxItems: number; perFlush: number }> =
  {
    low: { maxItems: 40, perFlush: 6 },
    medium: { maxItems: 80, perFlush: 15 },
    high: { maxItems: 140, perFlush: 28 },
  };

function App() {
  const windowLabel = getCurrentWindow().label;
  const [isClickThrough, setIsClickThrough] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [trackCount, setTrackCount] = useState(MIN_TRACK_COUNT);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [status, setStatus] = useState<DanmakuStatus>({
    status: "idle",
    message: "尚未连接直播间",
  });
  const mockItems = useMemo(() => createMockDanmakuItems(), []);
  const [liveItems, setLiveItems] = useState<DanmakuItem[]>([]);
  const pendingMessagesRef = useRef<LiveDanmakuMessage[]>([]);
  const sequenceRef = useRef(0);
  const historyRef = useRef<HistoryMessage[]>([]);
  const [historySnapshot, setHistorySnapshot] = useState<HistoryMessage[]>([]);
  const HISTORY_MAX = 300;

  function pushToHistory(messages: LiveDanmakuMessage[]) {
    for (const msg of messages) {
      historyRef.current.push({
        id: msg.id,
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

  const [showHistory, setShowHistory] = useState(false);
  const [mock, setMock] = useState<MockState>({
    active: false,
    rate: 50,
    totalGenerated: 0,
  });
  const densityLimits = DENSITY_LIMITS[config.appearance.density];
  const isConnected =
    status.status === "connecting" ||
    status.status === "connected" ||
    status.status === "reconnecting";
  const items = isConnected || mock.active ? liveItems : mockItems;

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
  }

  function handleMockRateChange(rate: number) {
    setMock((prev) => ({ ...prev, rate }));
  }

  function triggerMockBurst() {
    const batch = generateMockBatch(80);
    pendingMessagesRef.current.push(...batch);
    pushToHistory(batch);
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

    const unlistenMessage = listen<LiveDanmakuMessage[]>(
      "danmaku-messages",
      (event) => {
        if (windowLabel !== "main") {
          return;
        }

        pendingMessagesRef.current.push(...event.payload);
        pushToHistory(event.payload);
      },
    );
    const unlistenStatus = listen<DanmakuStatus>("danmaku-status", (event) => {
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
    if (windowLabel !== "main") {
      return;
    }

    void setEditMode(false);
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

    const interval = window.setInterval(() => {
      const pendingMessages = pendingMessagesRef.current.splice(
        0,
        densityLimits.perFlush,
      );

      if (pendingMessages.length === 0) {
        return;
      }

      const blockedWords = config.filter.blockedWords
        .map((word) => word.trim())
        .filter(Boolean);
      const nextItems: DanmakuItem[] = [];

      for (const message of pendingMessages) {
        const sequence = sequenceRef.current;
        sequenceRef.current += 1;

        if (blockedWords.some((word) => message.text.includes(word))) {
          continue;
        }

        nextItems.push({
          id: `${message.id}-${sequence}`,
          user: message.user,
          text: message.text,
          track: sequence % trackCount,
          duration: config.appearance.scrollDuration + (sequence % 3),
          delay: 0,
        });
      }

      setLiveItems((current) => {
        const combined = [...current, ...nextItems];
        const excess = combined.length - densityLimits.maxItems;

        if (excess <= 0) {
          return combined;
        }

        let alreadyExiting = 0;
        for (const item of combined) {
          if (item.exiting) alreadyExiting++;
        }

        const toMark = Math.max(0, excess - alreadyExiting);
        if (toMark <= 0) {
          return combined;
        }

        let marked = 0;
        return combined.map((item) => {
          if (item.exiting || marked >= toMark) return item;
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
    config.appearance.scrollDuration,
    config.filter.blockedWords,
    densityLimits.maxItems,
    densityLimits.perFlush,
    showHistory,
    trackCount,
    windowLabel,
  ]);

  useEffect(() => {
    if (isConnected && mock.active) {
      setMock((prev) => ({ ...prev, active: false }));
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
      pendingMessagesRef.current.push(message);
      pushToHistory([message]);
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
          <MockDanmakuPanel
            active={mock.active}
            onBurst={triggerMockBurst}
            onRateChange={handleMockRateChange}
            onStart={startMockDanmaku}
            onStop={stopMockDanmaku}
            rate={mock.rate}
            totalGenerated={mock.totalGenerated}
          />
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
