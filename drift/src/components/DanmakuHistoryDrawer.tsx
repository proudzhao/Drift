import { useLayoutEffect, useRef, useState } from "react";
import type { LiveMessageKind } from "../types/danmaku";

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
    <aside className="history-drawer" aria-label="Danmaku history">
      <header className="history-header">
        <strong>弹幕历史</strong>
        <button onClick={onClose} type="button">
          关闭
        </button>
      </header>

      <input
        className="history-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索弹幕或用户名"
        type="text"
        value={query}
      />

      <div className="history-list settings-scroll-list">
        {filtered.length === 0 ? (
          <p className="empty-state">
            {query.trim() ? "没有匹配的弹幕" : "暂无弹幕"}
          </p>
        ) : (
          filtered.map((msg) => (
            <button
              className="history-item"
              key={msg.id}
              onClick={() => copyMessage(msg)}
              type="button"
            >
              <span className="history-user">{msg.user}</span>
              <span className="history-text">{msg.text}</span>
              {copiedId === msg.id ? (
                <span className="history-copied">已复制</span>
              ) : null}
            </button>
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <footer className="history-footer">
        <span>
          {query.trim()
            ? `${filtered.length} 条匹配`
            : `最近 ${messages.length} 条`}
        </span>
      </footer>
    </aside>
  );
}
