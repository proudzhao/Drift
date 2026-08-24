import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ControlPanel } from "./components/control/ControlPanel";
import { DanmakuOverlay } from "./components/DanmakuOverlay";
import { VerticalChatOverlay } from "./components/VerticalChatOverlay";
import {
  OverlayEditWorkspace,
  type OverlayResizeDirection,
} from "./components/OverlayEditWorkspace";
import { SendDanmakuWindow } from "./components/SendDanmakuWindow";
import { useDanmakuRuntime } from "./hooks/useDanmakuRuntime";
import {
  DEFAULT_APP_CONFIG,
  defaultShortcutLabel,
  mergeAppConfig,
  type AppConfig,
} from "./types/config";
import type { DanmakuStatus, LiveMessage } from "./types/danmaku";
import type { VerticalFlowStatus } from "./types/verticalFlow";
import {
  MIN_TRACK_COUNT,
  TRACK_HEIGHT,
} from "./utils/danmakuRuntime";
import { classNames } from "./utils/classNames";
import {
  applyDocumentUiTheme,
  applyNativeAppTheme,
  readBootstrapUiTheme,
} from "./utils/uiTheme";
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

function selectSafeVerticalFlowStatus(
  status: VerticalFlowStatus,
): VerticalFlowStatus {
  return {
    active: status.active,
    policy: status.policy,
    backlog: status.backlog,
    speedMultiplier: status.speedMultiplier,
    droppedTotal: status.droppedTotal,
  };
}

function sameVerticalFlowStatus(
  previous: VerticalFlowStatus | null,
  next: VerticalFlowStatus,
) {
  return (
    previous !== null &&
    previous.active === next.active &&
    previous.policy === next.policy &&
    previous.backlog === next.backlog &&
    previous.speedMultiplier === next.speedMultiplier &&
    previous.droppedTotal === next.droppedTotal
  );
}

type EditModeChanged = {
  is_edit_mode: boolean;
  is_click_through: boolean;
  shortcut: string;
};

function createInitialConfig(): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    appearance: {
      ...DEFAULT_APP_CONFIG.appearance,
      theme: readBootstrapUiTheme(),
    },
  };
}

function App() {
  const windowLabel = getCurrentWindow().label;
  const [isClickThrough, setIsClickThrough] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [trackCount, setTrackCount] = useState(MIN_TRACK_COUNT);
  const [config, setConfig] = useState<AppConfig>(createInitialConfig);
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
    messageFlow,
    mock,
    pruneVerticalItems,
    removeDanmakuItem,
    setShowStats,
    setShowHistory,
    showHistory,
    showStats,
    startMockDanmaku,
    statsSnapshot,
    stopMockDanmaku,
    triggerMockBurst,
    verticalFlowStatus,
    verticalItems,
  } = useDanmakuRuntime({
    config,
    status,
    trackCount,
    windowLabel,
  });
  const verticalFlowStatusRef = useRef(
    selectSafeVerticalFlowStatus(verticalFlowStatus),
  );
  const verticalFlowListenerReadyRef = useRef(false);
  const lastScheduledVerticalFlowStatusRef =
    useRef<VerticalFlowStatus | null>(null);
  const verticalFlowEmitQueueRef = useRef<Promise<void>>(Promise.resolve());
  const verticalFlowWarningLatchedRef = useRef(false);

  const publishVerticalFlowStatus = useCallback((force = false) => {
    const snapshot = selectSafeVerticalFlowStatus(
      verticalFlowStatusRef.current,
    );
    if (
      !force &&
      sameVerticalFlowStatus(
        lastScheduledVerticalFlowStatusRef.current,
        snapshot,
      )
    ) {
      return;
    }
    lastScheduledVerticalFlowStatusRef.current = snapshot;

    verticalFlowEmitQueueRef.current = verticalFlowEmitQueueRef.current.then(
      async () => {
        try {
          await emit("vertical-flow-status", snapshot);
          verticalFlowWarningLatchedRef.current = false;
        } catch {
          if (!verticalFlowWarningLatchedRef.current) {
            verticalFlowWarningLatchedRef.current = true;
            console.warn("Failed to publish vertical flow status.");
          }
        }
      },
    );
  }, []);

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
    direction: OverlayResizeDirection,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0 || !isEditMode) {
      return;
    }

    event.preventDefault();
    await getCurrentWindow().startResizeDragging(direction);
  }

  useLayoutEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    const safeStatus = selectSafeVerticalFlowStatus(verticalFlowStatus);
    verticalFlowStatusRef.current = safeStatus;
    if (verticalFlowListenerReadyRef.current) {
      publishVerticalFlowStatus();
    }
  }, [publishVerticalFlowStatus, verticalFlowStatus, windowLabel]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    let disposed = false;
    let disposeListener: (() => void) | undefined;
    const listener = listen("vertical-flow-status-request", () => {
      publishVerticalFlowStatus(true);
    });
    void listener
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          disposeListener = dispose;
          verticalFlowListenerReadyRef.current = true;
          publishVerticalFlowStatus();
        }
      })
      .catch(() => {
        console.warn("Failed to listen for vertical flow status requests.");
      });

    return () => {
      disposed = true;
      verticalFlowListenerReadyRef.current = false;
      disposeListener?.();
    };
  }, [publishVerticalFlowStatus, windowLabel]);

  useEffect(() => {
    if (windowLabel === "send") {
      return;
    }

    let disposed = false;
    let receivedConfigEvent = false;
    const unlistenConfig = listen<AppConfig>("app-config-changed", (event) => {
      receivedConfigEvent = true;
      if (!disposed) {
        setConfig(mergeAppConfig(event.payload));
      }
    });

    void (async () => {
      await unlistenConfig;
      if (disposed) {
        return;
      }

      const loadedConfig = await invoke<AppConfig>("load_app_config");
      if (!disposed && !receivedConfigEvent) {
        setConfig(mergeAppConfig(loadedConfig));
      }
    })();

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
    return () => {
      disposed = true;
      void unlistenMessage.then((unlisten) => unlisten());
      void unlistenStatus.then((unlisten) => unlisten());
      void unlistenEditMode.then((unlisten) => unlisten());
      void unlistenConfig.then((unlisten) => unlisten());
    };
  }, [windowLabel]);

  useEffect(() => {
    if (windowLabel === "send") {
      return;
    }

    const theme = config.appearance.theme;
    applyDocumentUiTheme(theme);
    void applyNativeAppTheme(theme);
  }, [config.appearance.theme, windowLabel]);

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

  function showMockWorkspace() {
    setShowHistory(false);
    setShowStats(false);
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
          ? "is-edit-mode bg-[var(--drift-ui-edit-backdrop)] [outline:1px_dashed_var(--drift-ui-edit-outline)]"
          : "is-display-mode bg-transparent outline-0",
      )}
      style={
        {
          "--danmaku-font-size": `${config.appearance.fontSize}px`,
          "--danmaku-opacity": config.appearance.opacity,
        } as CSSProperties
      }
    >
      {messageFlow === "vertical" ? (
        <VerticalChatOverlay
          items={verticalItems}
          onItemsPruned={pruneVerticalItems}
          showEmotes={config.messageDisplay.showEmotes}
        />
      ) : (
        <DanmakuOverlay
          items={items}
          onItemDone={
            isConnected || mock.active ? removeDanmakuItem : undefined
          }
          showEmotes={config.messageDisplay.showEmotes}
          showUsername={config.appearance.showUsername}
          trackCount={trackCount}
        />
      )}
      {isEditMode ? (
        <OverlayEditWorkspace
          historyMessages={historySnapshot}
          mock={
            config.mockPanelEnabled
              ? {
                  active: mock.active,
                  onBurst: triggerMockBurst,
                  onRateChange: handleMockRateChange,
                  onStart: startMockDanmaku,
                  onStop: stopMockDanmaku,
                  rate: mock.rate,
                  totalGenerated: mock.totalGenerated,
                }
              : null
          }
          onDragStart={startDragging}
          onExit={() => void exitEditMode()}
          onResizeStart={(direction, event) =>
            void startResizeDragging(direction, event)
          }
          onShowMock={showMockWorkspace}
          onToggleHistory={toggleHistoryDrawer}
          onToggleStats={toggleStatsDrawer}
          shortcut={shortcut}
          showHistory={showHistory}
          showStats={showStats}
          stats={statsSnapshot}
        />
      ) : null}
    </main>
  );
}

export default App;
