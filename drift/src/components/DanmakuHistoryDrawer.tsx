import { useLayoutEffect, useRef, useState } from "react";
import type { LiveMessageKind } from "../types/danmaku";
import { classNames } from "../utils/classNames";

export type HistoryMessage = {
  id: string;
  kind: LiveMessageKind;
  user: string;
  text: string;
  timestamp: number;
};

type DanmakuHistoryDrawerProps = {
  messages: HistoryMessage[];
  onClose: () => void;
};

const DRAWER_CLASS =
  "absolute bottom-0 right-0 top-0 z-[2] grid w-[280px] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 border-l border-[rgba(126,168,196,0.35)] bg-[rgba(15,17,21,0.82)] px-3 py-2.5 text-[rgba(255,255,255,0.92)] backdrop-blur-md [backdrop-filter:blur(12px)] pointer-events-auto select-none";

const DARK_SCROLL_CLASS =
  "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.2)] [&::-webkit-scrollbar-thumb]:bg-clip-padding";

export function DanmakuHistoryDrawer({
  messages,
  onClose,
}: DanmakuHistoryDrawerProps) {
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  async function copyMessage(msg: HistoryMessage) {
    await navigator.clipboard.writeText(`${msg.user}: ${msg.text}`);
    setCopiedId(msg.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <aside className={DRAWER_CLASS} aria-label="Danmaku history">
      <header className="flex items-center justify-between">
        <strong className="text-[11px] font-semibold">弹幕历史</strong>
        <button
          className="min-h-6 cursor-pointer rounded-[5px] border border-[rgba(126,168,196,0.48)] bg-[rgba(126,168,196,0.2)] px-2 text-[10px] font-semibold text-[rgba(255,255,255,0.84)] transition-colors hover:bg-[rgba(126,168,196,0.32)]"
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </header>

      <input
        className="box-border min-h-7 w-full rounded-md border border-[rgba(126,168,196,0.3)] bg-[rgba(255,255,255,0.08)] px-2 text-[11px] text-white outline-none placeholder:text-[rgba(255,255,255,0.36)] focus:border-[rgba(126,168,196,0.6)]"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索弹幕或用户名"
        type="text"
        value={query}
      />

      <div
        className={classNames(
          "min-h-0 overflow-y-auto pr-1",
          DARK_SCROLL_CLASS,
        )}
      >
        {filtered.length === 0 ? (
          <p className="m-0 py-6 text-center text-[11px] text-[rgba(255,255,255,0.42)]">
            {query.trim() ? "没有匹配的弹幕" : "暂无弹幕"}
          </p>
        ) : (
          filtered.map((msg) => (
            <button
              className="grid w-full cursor-pointer appearance-none grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-1.5 rounded border-0 bg-transparent px-1.5 py-1 text-left text-inherit transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              key={msg.id}
              onClick={() => copyMessage(msg)}
              type="button"
            >
              <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-[rgba(126,168,196,0.88)]">
                {msg.user}
              </span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[rgba(255,255,255,0.84)]">
                {msg.text}
              </span>
              {copiedId === msg.id ? (
                <span className="text-[9px] font-semibold text-[#34c759]">
                  已复制
                </span>
              ) : null}
            </button>
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <footer className="text-[10px] text-[rgba(255,255,255,0.38)]">
        <span>
          {query.trim()
            ? `${filtered.length} 条匹配`
            : `最近 ${messages.length} 条`}
        </span>
      </footer>
    </aside>
  );
}
