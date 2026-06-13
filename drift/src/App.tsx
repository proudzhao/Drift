import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ControlPanel } from "./components/control/ControlPanel";
import { DanmakuOverlay } from "./components/DanmakuOverlay";
import { DanmakuHistoryDrawer } from "./components/DanmakuHistoryDrawer";
import { DanmakuStatsDrawer } from "./components/DanmakuStatsDrawer";
import { EditModePanel } from "./components/EditModePanel";
import { MockDanmakuPanel } from "./components/MockDanmakuPanel";
import { SendDanmakuWindow } from "./components/SendDanmakuWindow";
import { useDanmakuRuntime } from "./hooks/useDanmakuRuntime";
import {
  DEFAULT_APP_CONFIG,
  defaultShortcutLabel,
  mergeAppConfig,
  type AppConfig,
} from "./types/config";
import type { DanmakuStatus, LiveMessage } from "./types/danmaku";
import {
  MIN_TRACK_COUNT,
  TRACK_HEIGHT,
} from "./utils/danmakuRuntime";
import { classNames } from "./utils/classNames";
import "./styles/tailwind.css";
import "./App.css";

const MIN_WINDOW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 160;
const DEFAULT_SHORTCUT = defaultShortcutLabel();
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

const RESIZE_HANDLE_BASE_CLASS =
  "pointer-events-auto absolute size-[18px] rounded border border-[rgba(126,168,196,0.8)] bg-[rgba(126,168,196,0.26)] p-0 transition-colors hover:bg-[rgba(126,168,196,0.42)]";

const RESIZE_HANDLE_POSITION_CLASSES: Record<ResizeDirection, string> = {
  NorthWest: "left-2 top-2 cursor-nwse-resize",
  NorthEast: "right-2 top-2 cursor-nesw-resize",
  SouthEast: "bottom-2 right-2 cursor-nwse-resize",
  SouthWest: "bottom-2 left-2 cursor-nesw-resize",
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
  const isConnected =
    status.status === "connecting" ||
    status.status === "connected" ||
    status.status === "reconnecting";
  const {
    activeRoomIdRef,
    clearLiveMessageState,
    enqueueLiveMessages,
    handleMockRateChange,
    historySnapshot,
    items,
    mock,
    removeDanmakuItem,
    setShowStats,
    setShowHistory,
    showHistory,
    showStats,
    startMockDanmaku,
    statsSnapshot,
    stopMockDanmaku,
    triggerMockBurst,
  } = useDanmakuRuntime({
    config,
    status,
    trackCount,
    windowLabel,
  });

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

    const unlistenMessage = listen<LiveMessage[]>(
      "danmaku-messages",
      (event) => {
        if (windowLabel !== "main") {
          return;
        }

        enqueueLiveMessages(event.payload);
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

        if (isNewConnectionStart || isRoomChanged) {
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
    if (!isEditMode) {
      setShowHistory(false);
      setShowStats(false);
    }
  }, [isEditMode, setShowHistory, setShowStats]);

  function toggleHistoryDrawer() {
    setShowHistory((prev) => {
      const next = !prev;
      if (next) {
        setShowStats(false);
      }
      return next;
    });
  }

  function toggleStatsDrawer() {
    setShowStats((prev) => {
      const next = !prev;
      if (next) {
        setShowHistory(false);
      }
      return next;
    });
  }

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
      className={classNames(
        "relative h-screen w-screen min-w-0 overflow-hidden",
        isClickThrough && "is-click-through",
        isEditMode
          ? "is-edit-mode bg-[rgba(9,14,20,0.16)] [outline:1px_dashed_rgba(126,168,196,0.82)]"
          : "is-display-mode bg-transparent outline-0",
      )}
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
        showEmotes={config.messageDisplay.showEmotes}
        showUsername={config.appearance.showUsername}
        trackCount={trackCount}
      />
      {isEditMode ? (
        <>
          <section
            className="pointer-events-auto absolute inset-x-[18px] bottom-14 top-4 grid cursor-move select-none place-items-center rounded-drift border border-dashed border-[rgba(126,168,196,0.35)] text-[11px] leading-none text-[rgba(255,255,255,0.38)]"
            data-tauri-drag-region
            onMouseDown={startDragging}
          >
            <span className="rounded-md bg-[rgba(15,17,21,0.58)] px-2 py-1.5 backdrop-blur-md [backdrop-filter:blur(10px)]">
              拖动调整弹幕区域位置
            </span>
          </section>
          <EditModePanel
            onExitEditMode={exitEditMode}
            onToggleHistory={toggleHistoryDrawer}
            onToggleStats={toggleStatsDrawer}
            showHistory={showHistory}
            showStats={showStats}
            shortcut={shortcut}
          />
          {showHistory ? (
            <DanmakuHistoryDrawer
              messages={historySnapshot}
              onClose={() => setShowHistory(false)}
            />
          ) : null}
          {showStats ? (
            <DanmakuStatsDrawer
              onClose={() => setShowStats(false)}
              stats={statsSnapshot}
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
          ).map(([direction]) => (
            <button
              aria-label={`Resize ${direction}`}
              className={classNames(
                RESIZE_HANDLE_BASE_CLASS,
                RESIZE_HANDLE_POSITION_CLASSES[direction],
              )}
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
