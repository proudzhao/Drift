import { X } from "lucide-react";
import type { LiveMessageKind } from "../types/danmaku";
import type { DanmakuStatsSnapshot } from "../utils/danmakuStats";
import { classNames } from "../utils/classNames";
import { IconButton, Tooltip, TooltipProvider } from "./ui";

type DanmakuStatsDrawerProps = {
  onClose: () => void;
  stats: DanmakuStatsSnapshot;
};

const KIND_LABELS: Record<LiveMessageKind, string> = {
  danmaku: "弹幕",
  gift: "礼物",
  guard: "上舰",
  super_chat: "SC",
};

const KIND_ORDER: LiveMessageKind[] = ["danmaku", "super_chat", "gift", "guard"];

export function kindSharePercent(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((count / total) * 100)));
}

export function DanmakuStatsDrawer({
  onClose,
  stats,
}: DanmakuStatsDrawerProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <aside
        aria-label="弹幕统计"
        className="drift-theme-transition overlay-drawer overlay-stats-drawer pointer-events-auto absolute bottom-[42px] right-0 top-0 z-[2] box-border grid w-[296px] min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden border-l border-[var(--drift-ui-border)] bg-[var(--drift-ui-overlay-drawer)] px-3 py-2.5 text-[var(--drift-ui-ink)] backdrop-blur-[20px] select-none"
      >
        <header className="overlay-drawer-header flex min-w-0 items-center justify-between">
          <strong className="drift-theme-transition text-[11px] font-semibold">弹幕统计</strong>
          <Tooltip content="关闭弹幕统计">
            <IconButton
              aria-label="关闭弹幕统计"
              className="text-[var(--drift-ui-muted)] hover:bg-[var(--drift-ui-overlay-control-hover)] hover:text-[var(--drift-ui-ink)]"
              onClick={onClose}
              size="sm"
              variant="ghost"
            >
              <X aria-hidden="true" size={14} />
            </IconButton>
          </Tooltip>
        </header>

        <div className="overlay-stats-scroll overlay-drawer-scroll grid min-h-0 content-start gap-2 overflow-y-auto pr-0.5 [scrollbar-color:var(--drift-ui-overlay-scrollbar)_transparent] [scrollbar-width:thin]">
          <section className="grid grid-cols-4 gap-1.5" aria-label="消息概览">
            <StatTile label="总消息" value={stats.totalMessages} />
            <StatTile label="近 1 分钟" value={stats.lastMinuteMessages} />
            <StatTile label="近 5 分钟" value={stats.lastFiveMinuteMessages} />
            <StatTile label="每分钟" value={stats.messagesPerMinute} />
          </section>

          <section
            aria-label="消息类型"
            className="overlay-stats-section grid min-w-0 content-start gap-1.5"
          >
            <h2 className="drift-theme-transition m-0 text-[11px] font-bold text-[var(--drift-ui-signal-text)]">
              消息类型
            </h2>
            <div className="grid gap-1.5">
              {KIND_ORDER.map((kind) => {
                const count = stats.kindCounts[kind];
                const share = kindSharePercent(count, stats.totalMessages);
                return (
                  <div
                    className="overlay-kind-row grid min-w-0 grid-cols-[40px_minmax(0,1fr)_24px] items-center gap-2 text-[10px]"
                    key={kind}
                  >
                    <span className="drift-theme-transition truncate text-[var(--drift-ui-overlay-auxiliary)]">
                      {KIND_LABELS[kind]}
                    </span>
                    <span
                      aria-label={`${KIND_LABELS[kind]}占比`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={share}
                      className="drift-theme-transition overlay-kind-track h-1.5 overflow-hidden rounded-full bg-[var(--drift-ui-overlay-track)]"
                      role="progressbar"
                    >
                      <span
                        className="overlay-kind-fill block h-full rounded-full bg-[var(--drift-ui-signal)]"
                        style={{ width: `${share}%` }}
                      />
                    </span>
                    <strong className="drift-data-text drift-theme-transition text-right text-[var(--drift-ui-ink-soft)]">
                      {count}
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="overlay-stats-rankings grid grid-cols-2 content-start items-start gap-2">
            <StatsRanking
              emptyText="暂无用户"
              items={stats.topUsers.map((item) => ({
                count: item.count,
                label: item.user,
              }))}
              title="活跃用户"
            />
            <StatsRanking
              emptyText="暂无高频词"
              items={stats.topWords.map((item) => ({
                count: item.count,
                label: item.word,
              }))}
              title="高频词"
            />
          </div>

          <footer className="drift-theme-transition overlay-drawer-footer text-[10px] text-[var(--drift-ui-muted)]">
            <span>最近 5 分钟窗口 · 连接新房后清空</span>
          </footer>
        </div>
      </aside>
    </TooltipProvider>
  );
}

type StatTileProps = {
  label: string;
  value: number;
};

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="drift-theme-transition grid min-w-0 gap-1 rounded-md border border-[var(--drift-ui-border)] bg-[var(--drift-ui-overlay-surface)] p-1.5">
      <strong className="drift-data-text drift-theme-transition truncate text-sm font-bold leading-none text-[var(--drift-ui-ink)]">
        {value}
      </strong>
      <span className="drift-theme-transition truncate text-[9px] text-[var(--drift-ui-muted)]">
        {label}
      </span>
    </div>
  );
}

type StatsRankingProps = {
  emptyText: string;
  items: Array<{ count: number; label: string }>;
  title: string;
};

function StatsRanking({ emptyText, items, title }: StatsRankingProps) {
  return (
    <section className="grid min-w-0 content-start gap-1.5">
      <h2 className="drift-theme-transition m-0 text-[11px] font-bold text-[var(--drift-ui-signal-text)]">
        {title}
      </h2>
      <ol className="m-0 grid content-start gap-0.5 p-0">
        {items.length === 0 ? (
          <li className="drift-theme-transition grid grid-cols-1 rounded px-1 py-1 text-[10px] text-[var(--drift-ui-muted)]">
            {emptyText}
          </li>
        ) : (
          items.map((item, index) => (
            <li
              className={classNames(
                "drift-theme-transition grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded px-1 py-1 text-[10px] text-[var(--drift-ui-ink-soft)]",
                index % 2 === 0 && "bg-[var(--drift-ui-overlay-surface)]",
              )}
              key={item.label}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              <strong className="drift-data-text drift-theme-transition text-[var(--drift-ui-signal-text)]">
                {item.count}
              </strong>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
