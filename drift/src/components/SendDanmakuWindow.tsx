import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  SendDanmakuResult,
  SendDanmakuStatus,
} from "../types/danmaku";
import { classNames } from "../utils/classNames";

const TEXT_LIMIT = 60;
const NO_DRAG_CLASS = "[-webkit-app-region:no-drag]";

export function SendDanmakuWindow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);
  const latestDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<SendDanmakuStatus | null>(null);
  const [feedback, setFeedback] = useState("");
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
      } else {
        setFeedback("准备发送");
      }
    } catch (error) {
      setFeedback(String(error));
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
      await refreshStatus();
      focusInput();
      return;
    }
    if (!trimmedText) {
      setFeedback("请输入弹幕内容");
      return;
    }
    if (remaining < 0) {
      setFeedback(`弹幕内容不能超过 ${TEXT_LIMIT} 个字符`);
      return;
    }

    setIsSending(true);
    setFeedback("发送中");
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
      focusInput();
    } catch (error) {
      setFeedback(String(error));
      await refreshStatus();
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
    <main className="box-border h-screen w-screen overflow-hidden rounded-xl border border-[rgba(195,221,214,0.28)] bg-[linear-gradient(145deg,rgba(13,18,19,0.58),rgba(28,36,35,0.52)),rgba(12,14,15,0.44)] px-3 py-2 text-sm text-[#eef8f4] shadow-[0_18px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <header
        className="mb-1.5 flex min-h-[26px] cursor-move select-none items-center justify-between gap-3"
        onMouseDown={(event) => void startManualDrag(event)}
      >
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="block whitespace-nowrap text-[11px] leading-none text-[#9fb2ac]">
            发送到直播间
          </span>
          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold leading-tight text-white">
            {targetText}
          </span>
        </div>
        <button
          aria-label="关闭发送窗口"
          className={classNames(
            NO_DRAG_CLASS,
            "relative z-[2] size-[26px] shrink-0 cursor-pointer rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.08)] p-0 text-[#c9d8d2] transition-colors hover:bg-[rgba(255,255,255,0.14)] hover:text-white",
          )}
          onClick={() => void hideWindow()}
          type="button"
        >
          ×
        </button>
      </header>

      <div className={classNames(NO_DRAG_CLASS, "flex items-center gap-[7px]")}>
        <input
          className={classNames(
            NO_DRAG_CLASS,
            "box-border h-[34px] min-w-0 flex-1 rounded-drift border border-[rgba(196,221,214,0.28)] bg-[rgba(255,255,255,0.13)] px-[11px] text-white outline-none placeholder:text-[rgba(223,234,230,0.45)] focus:border-[rgba(96,214,180,0.68)] focus:shadow-[0_0_0_3px_rgba(96,214,180,0.16)]",
          )}
          ref={inputRef}
          maxLength={TEXT_LIMIT + 8}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入弹幕内容"
          value={text}
        />
        <button
          className={classNames(
            NO_DRAG_CLASS,
            "h-[34px] w-[60px] cursor-pointer rounded-drift border-0 bg-[#76e0b7] font-bold text-[#092017] transition-colors hover:bg-[#8ef0ca] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.1)] disabled:text-[rgba(210,220,216,0.52)]",
          )}
          disabled={!canSend}
          onClick={() => void sendDanmaku()}
          type="button"
        >
          发送
        </button>
      </div>

      <footer className="mt-1.5 flex items-center justify-between gap-3 text-[11px] leading-tight text-[#9fb2ac]">
        <span
          className={status?.canSend ? "text-[#8feac4]" : "text-[#ffd37a]"}
        >
          {feedback || status?.reason || "读取发送状态"}
        </span>
        <span className={remaining < 0 ? "text-[#ffd37a]" : ""}>
          {Math.max(0, remaining)}
        </span>
      </footer>
    </main>
  );
}
