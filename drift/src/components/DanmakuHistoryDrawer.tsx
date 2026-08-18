import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { LiveMessageKind } from "../types/danmaku";
import { IconButton, Input, Tooltip, TooltipProvider } from "./ui";

export type HistoryMessage = {
  id: string;
  kind: LiveMessageKind;
  user: string;
  text: string;
  timestamp: number;
};

type DanmakuHistoryDrawerProps = {
  initialQuery?: string;
  messages: HistoryMessage[];
  onClose: () => void;
};

type CopyFeedback = {
  id: string;
  status: "success" | "error";
} | null;

export function DanmakuHistoryDrawer({
  initialQuery = "",
  messages,
  onClose,
}: DanmakuHistoryDrawerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const copyTimerRef = useRef<number | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? messages.filter(
        (msg) =>
          msg.text.toLowerCase().includes(normalizedQuery) ||
          msg.user.toLowerCase().includes(normalizedQuery),
      )
    : messages;

  useLayoutEffect(() => {
    if (!query.trim()) {
      listEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, query]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  async function copyMessage(msg: HistoryMessage) {
    try {
      await navigator.clipboard.writeText(`${msg.user}: ${msg.text}`);
      setCopyFeedback({ id: msg.id, status: "success" });
    } catch {
      setCopyFeedback({ id: msg.id, status: "error" });
    }
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopyFeedback(null), 1500);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        aria-label="弹幕历史"
        className="overlay-drawer overlay-history-drawer pointer-events-auto absolute bottom-[42px] right-0 top-0 z-[2] box-border grid w-[296px] min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 overflow-hidden border-l border-[#29414a] bg-[rgba(7,16,20,.95)] px-3 py-2.5 text-[#eaf6f7] backdrop-blur-[20px] select-none"
      >
        <header className="overlay-drawer-header flex min-w-0 items-center justify-between">
          <div className="min-w-0">
            <strong className="text-[11px] font-semibold">弹幕历史</strong>
            <span className="drift-data-text ml-2 text-[9px] text-[#789097]">
              最近 {messages.length} 条
            </span>
          </div>
          <Tooltip content="关闭弹幕历史">
            <IconButton
              aria-label="关闭弹幕历史"
              className="text-[#789097] hover:bg-[#14272d] hover:text-[#eaf6f7]"
              onClick={onClose}
              size="sm"
              variant="ghost"
            >
              <X aria-hidden="true" size={14} />
            </IconButton>
          </Tooltip>
        </header>
        <Input
          aria-label="搜索弹幕历史"
          className="overlay-history-search border-[#29414a] bg-[#0e1d22] text-[#eaf6f7] placeholder:text-[#789097] focus:border-[#32c7d9] focus:ring-[#32c7d9]/15"
          inputSize="sm"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="搜索弹幕或用户名"
          role="searchbox"
          value={query}
        />
        <div className="overlay-drawer-scroll min-h-0 overflow-y-auto [scrollbar-color:#36515a_transparent] [scrollbar-width:thin]">
          {filtered.length === 0 ? (
            <p className="overlay-empty-copy m-0 py-6 text-center text-[11px] text-[#789097]">
              {query.trim() ? "没有匹配的弹幕" : "暂无弹幕"}
            </p>
          ) : (
            filtered.map((msg) => (
              <button
                aria-label={`复制 ${msg.user} 的弹幕`}
                className="overlay-history-row grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-1.5 border-0 border-b border-[#14272d] bg-transparent px-1 py-[7px] text-left text-inherit transition-colors hover:bg-[#10252b]"
                key={msg.id}
                onClick={() => void copyMessage(msg)}
                type="button"
              >
                <span className="overlay-history-user overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-[#62d7e4]">
                  {msg.user}
                </span>
                <span className="overlay-history-text overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#c7dadd]">
                  {msg.text}
                </span>
                {copyFeedback?.id === msg.id ? (
                  <span
                    className={
                      copyFeedback.status === "success"
                        ? "text-[9px] font-semibold text-[#65d995]"
                        : "text-[9px] font-semibold text-[#ff7d85]"
                    }
                    data-tone={
                      copyFeedback.status === "success" ? "success" : "danger"
                    }
                  >
                    {copyFeedback.status === "success" ? "已复制" : "复制失败"}
                  </span>
                ) : null}
              </button>
            ))
          )}
          <div ref={listEndRef} />
        </div>
        <footer className="overlay-drawer-footer text-[10px] text-[#789097]">
          {query.trim()
            ? `${filtered.length} 条匹配`
            : `最近 ${messages.length} 条`}
        </footer>
      </aside>
    </TooltipProvider>
  );
}
