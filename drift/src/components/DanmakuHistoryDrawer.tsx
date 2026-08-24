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
        className="drift-theme-transition overlay-drawer overlay-history-drawer pointer-events-auto absolute bottom-[42px] right-0 top-0 z-[2] box-border grid w-[296px] min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 overflow-hidden border-l border-[var(--drift-ui-border)] bg-[var(--drift-ui-overlay-drawer)] px-3 py-2.5 text-[var(--drift-ui-ink)] backdrop-blur-[20px] select-none"
      >
        <header className="overlay-drawer-header flex min-w-0 items-center justify-between">
          <div className="min-w-0">
            <strong className="drift-theme-transition text-[11px] font-semibold">弹幕历史</strong>
            <span className="drift-data-text drift-theme-transition ml-2 text-[9px] text-[var(--drift-ui-muted)]">
              最近 {messages.length} 条
            </span>
          </div>
          <Tooltip content="关闭弹幕历史">
            <IconButton
              aria-label="关闭弹幕历史"
              className="text-[var(--drift-ui-muted)] hover:bg-[var(--drift-ui-overlay-control-hover)] hover:text-[var(--drift-ui-ink)]"
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
          className="overlay-history-search border-[var(--drift-ui-border)] bg-[var(--drift-ui-overlay-surface)] text-[var(--drift-ui-ink)] placeholder:text-[var(--drift-ui-muted)] focus:border-[var(--drift-ui-signal)] focus:ring-[color-mix(in_srgb,var(--drift-ui-signal)_15%,transparent)]"
          inputSize="sm"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="搜索弹幕或用户名"
          role="searchbox"
          value={query}
        />
        <div className="overlay-drawer-scroll min-h-0 overflow-y-auto [scrollbar-color:var(--drift-ui-overlay-scrollbar)_transparent] [scrollbar-width:thin]">
          {filtered.length === 0 ? (
            <p className="drift-theme-transition overlay-empty-copy m-0 py-6 text-center text-[11px] text-[var(--drift-ui-muted)]">
              {query.trim() ? "没有匹配的弹幕" : "暂无弹幕"}
            </p>
          ) : (
            filtered.map((msg) => (
              <button
                aria-label={`复制 ${msg.user} 的弹幕`}
                className="drift-theme-transition overlay-history-row grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-1.5 border-0 border-b border-[var(--drift-ui-overlay-divider)] bg-transparent px-1 py-[7px] text-left text-inherit hover:bg-[var(--drift-ui-overlay-row-hover)]"
                key={msg.id}
                onClick={() => void copyMessage(msg)}
                type="button"
              >
                <span className="drift-theme-transition overlay-history-user overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-[var(--drift-ui-signal-text)]">
                  {msg.user}
                </span>
                <span className="drift-theme-transition overlay-history-text overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--drift-ui-ink-soft)]">
                  {msg.text}
                </span>
                {copyFeedback?.id === msg.id ? (
                  <span
                    className={
                      copyFeedback.status === "success"
                        ? "drift-theme-transition text-[9px] font-semibold text-[var(--drift-ui-overlay-copy-success)]"
                        : "drift-theme-transition text-[9px] font-semibold text-[var(--drift-ui-overlay-copy-danger)]"
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
        <footer className="drift-theme-transition overlay-drawer-footer text-[10px] text-[var(--drift-ui-muted)]">
          {query.trim()
            ? `${filtered.length} 条匹配`
            : `最近 ${messages.length} 条`}
        </footer>
      </aside>
    </TooltipProvider>
  );
}
