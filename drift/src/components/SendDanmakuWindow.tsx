import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  SendDanmakuResult,
  SendDanmakuStatus,
} from "../types/danmaku";
import {
  SendDanmakuView,
  type SendFeedbackTone,
} from "./SendDanmakuView";

const TEXT_LIMIT = 60;

export function SendDanmakuWindow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);
  const latestDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<SendDanmakuStatus | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] =
    useState<SendFeedbackTone>("signal");
  const [isSending, setIsSending] = useState(false);

  const trimmedText = text.trim();
  const remaining = TEXT_LIMIT - Array.from(trimmedText).length;
  const canSend =
    Boolean(status?.canSend) &&
    trimmedText.length > 0 &&
    remaining >= 0 &&
    !isSending;

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await invoke<SendDanmakuStatus>(
        "get_send_danmaku_status",
      );
      setStatus(nextStatus);
      if (!nextStatus.canSend) {
        setFeedback(nextStatus.reason);
        setFeedbackTone("warning");
      } else {
        setFeedback("准备发送");
        setFeedbackTone("signal");
      }
    } catch (error) {
      setFeedback(String(error));
      setFeedbackTone("danger");
    }
  }, []);

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
      setFeedback(`弹幕内容不能超过 ${TEXT_LIMIT} 个字符`);
      setFeedbackTone("danger");
      return;
    }

    setIsSending(true);
    setFeedback("发送中");
    setFeedbackTone("signal");
    try {
      const result = await invoke<SendDanmakuResult>("send_bilibili_danmaku", {
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
      setFeedback(result.message);
      setFeedbackTone("success");
      focusInput();
    } catch (error) {
      const failureMessage = String(error);
      await refreshStatus();
      setFeedback(failureMessage);
      setFeedbackTone("danger");
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
    focusInput();
    void refreshStatus();

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
      refreshVisibleWindow();
    });
    const unlistenStatus = listen("danmaku-status", () => {
      void refreshStatus();
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
      void unlistenStatus.then((unlisten) => unlisten());
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (!status || status.cooldownMs <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshStatus();
    }, Math.min(status.cooldownMs, 1000));

    return () => window.clearTimeout(timer);
  }, [status?.cooldownMs]);

  const targetText = status?.anchorName?.trim()
    ? status.anchorName
    : status?.roomId
      ? "直播间已连接"
      : "未连接";

  return (
    <SendDanmakuView
      canSend={canSend}
      feedback={feedback || status?.reason || "读取发送状态"}
      inputRef={inputRef}
      isSending={isSending}
      onClose={() => void hideWindow()}
      onDragStart={(event) => void startManualDrag(event)}
      onInputKeyDown={handleKeyDown}
      onSend={() => void sendDanmaku()}
      onTextChange={setText}
      remaining={remaining}
      targetText={targetText}
      text={text}
      tone={feedbackTone}
    />
  );
}
