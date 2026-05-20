import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ControlPanel } from "./components/ControlPanel";
import { DanmakuOverlay } from "./components/DanmakuOverlay";
import { EditModePanel } from "./components/EditModePanel";
import { createMockDanmakuItems } from "./data/mockDanmaku";
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
  const densityLimits = DENSITY_LIMITS[config.appearance.density];
  const items = liveItems.length > 0 ? liveItems : mockItems;
  const isConnected =
    status.status === "connecting" ||
    status.status === "connected" ||
    status.status === "reconnecting";

  async function setEditMode(enabled: boolean) {
    const result = await invoke<EditModeChanged>("set_edit_mode", { enabled });
    setIsEditMode(result.is_edit_mode);
    setIsClickThrough(result.is_click_through);
    setShortcut(result.shortcut);
  }

  async function exitEditMode() {
    await setEditMode(false);
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

    const unlistenMessage = listen<LiveDanmakuMessage>(
      "danmaku-message",
      (event) => {
        if (windowLabel !== "main") {
          return;
        }

        pendingMessagesRef.current.push(event.payload);
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
      const blockedUsers = config.filter.blockedUsers
        .map((user) => user.trim())
        .filter(Boolean);
      const nextItems: DanmakuItem[] = [];

      for (const message of pendingMessages) {
        const sequence = sequenceRef.current;
        sequenceRef.current += 1;

        if (
          blockedUsers.includes(message.user) ||
          blockedWords.some((word) => message.text.includes(word))
        ) {
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

      setLiveItems((current) =>
        [...current, ...nextItems].slice(-densityLimits.maxItems),
      );
    }, DANMAKU_FLUSH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [
    config.appearance.scrollDuration,
    config.filter.blockedUsers,
    config.filter.blockedWords,
    densityLimits.maxItems,
    densityLimits.perFlush,
    trackCount,
    windowLabel,
  ]);

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
          <EditModePanel onExitEditMode={exitEditMode} shortcut={shortcut} />
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
