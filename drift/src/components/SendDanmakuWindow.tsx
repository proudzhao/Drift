import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SendDanmakuResult, SendDanmakuStatus } from "../types/danmaku";
import type { RoomSessionSnapshot } from "../types/roomSession";
import { useRoomSessions } from "../hooks/useRoomSessions";
import { applyDocumentUiTheme, normalizeUiTheme } from "../utils/uiTheme";
import { SendDanmakuView, type SendFeedbackTone } from "./SendDanmakuView";

const TEXT_LIMIT = 60;

type ThemeConfigSnapshot = {
  appearance?: {
    theme?: unknown;
  };
  send?: {
    lastRoomId?: unknown;
  };
};

function normalizeConfiguredRoomId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

function isConnectedTarget(session: RoomSessionSnapshot) {
  return session.status === "connected" && typeof session.roomId === "number";
}

function buildTargetLabel(session: RoomSessionSnapshot) {
  const roomId = session.roomId;
  if (typeof roomId !== "number") {
    return "";
  }

  return `${session.anchorName?.trim() || "房间"} · ${roomId}`;
}

export function SendDanmakuWindow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);
  const latestDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const persistedTargetRoomIdRef = useRef<number | null>(null);
  const selectionVersionRef = useRef(0);
  const targetWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingTargetWriteCountRef = useRef(0);
  const statusRequestVersionRef = useRef(0);
  const feedbackVersionRef = useRef(0);
  const targetsRef = useRef<Array<{ roomId: number; label: string }>>([]);
  const disposedRef = useRef(false);
  const themeSyncVersionRef = useRef(0);
  const { isInitialReady, sessions } = useRoomSessions({ enabled: true });
  const [text, setText] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [status, setStatus] = useState<SendDanmakuStatus | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<SendFeedbackTone>("signal");
  const [isSending, setIsSending] = useState(false);

  const targets = sessions
    .filter(isConnectedTarget)
    .map((session) => ({
      roomId: session.roomId as number,
      label: buildTargetLabel(session),
    }));
  targetsRef.current = targets;

  const hasSelectedTarget =
    selectedRoomId !== null &&
    targets.some((target) => target.roomId === selectedRoomId);
  const effectiveSelectedRoomId = hasSelectedTarget ? selectedRoomId : null;
  const effectiveFeedback =
    effectiveSelectedRoomId === null
      ? "请选择发送目标"
      : feedback || status?.reason || "读取发送状态";
  const effectiveFeedbackTone =
    effectiveSelectedRoomId === null ? "warning" : feedbackTone;

  selectedRoomIdRef.current = effectiveSelectedRoomId;

  const trimmedText = text.trim();
  const remaining = TEXT_LIMIT - Array.from(trimmedText).length;
  const canSend =
    effectiveSelectedRoomId !== null &&
    Boolean(status?.canSend) &&
    trimmedText.length > 0 &&
    remaining >= 0 &&
    !isSending;

  function setManualFeedback(message: string, tone: SendFeedbackTone) {
    feedbackVersionRef.current += 1;
    setFeedback(message);
    setFeedbackTone(tone);
  }

  function invalidateStatusRequests() {
    statusRequestVersionRef.current += 1;
  }

  function setCurrentSelectedRoomId(roomId: number | null) {
    selectedRoomIdRef.current = roomId;
    setSelectedRoomId(roomId);
  }

  const refreshStatus = useCallback(async (
    roomId = selectedRoomIdRef.current,
    options?: { syncFeedback?: boolean },
  ) => {
    const requestVersion = statusRequestVersionRef.current + 1;
    const requestFeedbackVersion = feedbackVersionRef.current;
    statusRequestVersionRef.current = requestVersion;

    try {
      const nextStatus = await invoke<SendDanmakuStatus>(
        "get_send_danmaku_status",
        roomId === null ? {} : { roomId },
      );
      if (
        disposedRef.current ||
        requestVersion !== statusRequestVersionRef.current ||
        roomId !== selectedRoomIdRef.current
      ) {
        return null;
      }

      setStatus(nextStatus);
      if (
        options?.syncFeedback !== false &&
        requestFeedbackVersion === feedbackVersionRef.current
      ) {
        if (!nextStatus.canSend) {
          setFeedback(nextStatus.reason);
          setFeedbackTone("warning");
        } else {
          setFeedback("准备发送");
          setFeedbackTone("signal");
        }
      }
      return nextStatus;
    } catch (error) {
      if (
        disposedRef.current ||
        requestVersion !== statusRequestVersionRef.current ||
        roomId !== selectedRoomIdRef.current
      ) {
        return null;
      }

      if (
        options?.syncFeedback !== false &&
        requestFeedbackVersion === feedbackVersionRef.current
      ) {
        setFeedback(String(error));
        setFeedbackTone("danger");
      }
      return null;
    }
  }, []);

  const refreshThemeAndSelectionFromAuthority = useCallback(async () => {
    const requestVersion = ++themeSyncVersionRef.current;
    const selectionVersionAtStart = selectionVersionRef.current;
    const targetWriteWasPendingAtStart =
      pendingTargetWriteCountRef.current > 0;

    try {
      const loadedConfig = await invoke<ThemeConfigSnapshot>("load_app_config");
      if (
        disposedRef.current ||
        requestVersion !== themeSyncVersionRef.current
      ) {
        return;
      }

      applyDocumentUiTheme(normalizeUiTheme(loadedConfig.appearance?.theme));

      if (
        targetWriteWasPendingAtStart ||
        pendingTargetWriteCountRef.current > 0 ||
        selectionVersionAtStart !== selectionVersionRef.current
      ) {
        return;
      }

      const restoredRoomId = normalizeConfiguredRoomId(
        loadedConfig.send?.lastRoomId,
      );

      const nextRoomId =
        restoredRoomId !== null &&
        targetsRef.current.some((target) => target.roomId === restoredRoomId)
          ? restoredRoomId
          : null;

      persistedTargetRoomIdRef.current = nextRoomId;

      if (selectedRoomIdRef.current !== nextRoomId) {
        selectionVersionRef.current += 1;
        setCurrentSelectedRoomId(nextRoomId);
      }

      await refreshStatus(nextRoomId);
    } catch {
      // A theme refresh is best effort; status and send behavior remain usable.
    }
  }, [refreshStatus]);

  function focusInput() {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
  }

  async function hideWindow() {
    await invoke("hide_send_danmaku_window");
  }

  async function startManualDrag(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    isDraggingRef.current = true;
    latestDragPointRef.current = { x: event.screenX, y: event.screenY };
    try {
      await invoke("begin_send_danmaku_window_drag", {
        screenX: event.screenX,
        screenY: event.screenY,
      });
    } catch (error) {
      isDraggingRef.current = false;
      latestDragPointRef.current = null;
      setFeedback(`拖动失败：${String(error)}`);
      setFeedbackTone("danger");
    }
  }

  function updateManualDrag(screenX: number, screenY: number) {
    latestDragPointRef.current = { x: screenX, y: screenY };
    if (dragFrameRef.current !== null) {
      return;
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const point = latestDragPointRef.current;
      if (!isDraggingRef.current || !point) {
        return;
      }

      void invoke("drag_send_danmaku_window", {
        screenX: point.x,
        screenY: point.y,
      });
    });
  }

  function stopManualDrag() {
    if (isDraggingRef.current) {
      void invoke("end_send_danmaku_window_drag");
    }
    isDraggingRef.current = false;
    latestDragPointRef.current = null;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }

  function handleTargetChange(nextRoomId: number | null) {
    invalidateStatusRequests();
    const selectionVersion = selectionVersionRef.current + 1;
    selectionVersionRef.current = selectionVersion;
    setCurrentSelectedRoomId(nextRoomId);
    pendingTargetWriteCountRef.current += 1;

    const write = targetWriteQueueRef.current.then(async () => {
      try {
        await invoke("set_last_send_room_id", {
          roomId: nextRoomId,
        });
        persistedTargetRoomIdRef.current = nextRoomId;
        if (
          disposedRef.current ||
          selectionVersion !== selectionVersionRef.current
        ) {
          return;
        }
        await refreshStatus(nextRoomId);
      } catch (error) {
        if (
          disposedRef.current ||
          selectionVersion !== selectionVersionRef.current
        ) {
          return;
        }
        invalidateStatusRequests();
        const persistedRoomId = persistedTargetRoomIdRef.current;
        const rollbackRoomId =
          persistedRoomId !== null &&
          targetsRef.current.some((target) => target.roomId === persistedRoomId)
            ? persistedRoomId
            : null;
        const rollbackVersion = selectionVersionRef.current + 1;
        selectionVersionRef.current = rollbackVersion;
        setCurrentSelectedRoomId(rollbackRoomId);
        await refreshStatus(rollbackRoomId, { syncFeedback: false });
        if (
          disposedRef.current ||
          rollbackVersion !== selectionVersionRef.current
        ) {
          return;
        }
        setManualFeedback(String(error), "danger");
      } finally {
        pendingTargetWriteCountRef.current -= 1;
      }
    });
    targetWriteQueueRef.current = write.catch(() => undefined);
  }

  async function sendDanmaku() {
    if (isSending) {
      return;
    }
    if (!status?.canSend) {
      setFeedback(status?.reason || "当前不可发送");
      setFeedbackTone("warning");
      await refreshStatus();
      focusInput();
      return;
    }
    if (!trimmedText) {
      setFeedback("请输入弹幕内容");
      setFeedbackTone("warning");
      return;
    }
    if (remaining < 0) {
      setManualFeedback(`弹幕内容不能超过 ${TEXT_LIMIT} 个字符`, "danger");
      return;
    }
    if (selectedRoomIdRef.current === null) {
      setManualFeedback("请选择发送目标", "warning");
      return;
    }

    invalidateStatusRequests();
    setIsSending(true);
    setManualFeedback("发送中", "signal");
    try {
      const result = await invoke<SendDanmakuResult>("send_bilibili_danmaku", {
        roomId: selectedRoomIdRef.current,
        text: trimmedText,
      });
      setText("");
      setStatus((current) =>
        current
          ? {
              ...current,
              canSend: false,
              cooldownMs: result.cooldownMs,
              reason: "已发送，稍后可继续发送",
            }
          : current,
      );
      setManualFeedback(result.message, "success");
      focusInput();
    } catch (error) {
      const failureMessage = String(error);
      await refreshStatus(selectedRoomIdRef.current, { syncFeedback: false });
      setManualFeedback(failureMessage, "danger");
      focusInput();
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      void hideWindow();
      return;
    }

    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendDanmaku();
    }
  }

  useEffect(() => {
    disposedRef.current = false;

    return () => {
      disposedRef.current = true;
      themeSyncVersionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!isInitialReady) {
      return;
    }

    if (selectedRoomId === null || hasSelectedTarget) {
      return;
    }

    invalidateStatusRequests();
    selectionVersionRef.current += 1;
    setCurrentSelectedRoomId(null);
    void refreshStatus(null);
  }, [hasSelectedTarget, isInitialReady, refreshStatus, selectedRoomId]);

  useEffect(() => {
    if (!isInitialReady || selectedRoomIdRef.current === null) {
      return;
    }

    void refreshStatus(selectedRoomIdRef.current);
  }, [isInitialReady, refreshStatus, sessions]);

  useEffect(() => {
    if (!isInitialReady) {
      return;
    }

    focusInput();
    void refreshThemeAndSelectionFromAuthority();

    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void hideWindow();
      }
    }

    function refreshVisibleWindow() {
      focusInput();
      void refreshStatus();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshVisibleWindow();
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    window.addEventListener("focus", refreshVisibleWindow);
    window.addEventListener("pageshow", refreshVisibleWindow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    function handleMouseMove(event: globalThis.MouseEvent) {
      if (!isDraggingRef.current) {
        return;
      }
      updateManualDrag(event.screenX, event.screenY);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopManualDrag);
    window.addEventListener("mouseleave", stopManualDrag);
    const unlistenOpened = listen("send-window-opened", () => {
      focusInput();
      void refreshThemeAndSelectionFromAuthority();
    });

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
      window.removeEventListener("focus", refreshVisibleWindow);
      window.removeEventListener("pageshow", refreshVisibleWindow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopManualDrag);
      window.removeEventListener("mouseleave", stopManualDrag);
      stopManualDrag();
      void unlistenOpened.then((unlisten) => unlisten());
    };
  }, [isInitialReady, refreshStatus, refreshThemeAndSelectionFromAuthority]);

  useEffect(() => {
    if (!status || status.cooldownMs <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshStatus();
    }, Math.min(status.cooldownMs, 1000));

    return () => window.clearTimeout(timer);
  }, [refreshStatus, status?.cooldownMs]);

  return (
    <SendDanmakuView
      canSend={canSend}
      feedback={effectiveFeedback}
      inputRef={inputRef}
      isSending={isSending}
      onClose={() => void hideWindow()}
      onDragStart={(event) => void startManualDrag(event)}
      onInputKeyDown={handleKeyDown}
      onSend={() => void sendDanmaku()}
      onTargetChange={handleTargetChange}
      onTextChange={setText}
      remaining={remaining}
      selectedRoomId={effectiveSelectedRoomId}
      text={text}
      tone={effectiveFeedbackTone}
      targets={targets}
    />
  );
}
