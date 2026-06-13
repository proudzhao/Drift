import type { LiveMessageKind } from "../types/danmaku";
import type { DanmakuStatsSnapshot } from "../utils/danmakuStats";
import { classNames } from "../utils/classNames";

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

const DRAWER_CLASS =
  "absolute bottom-0 right-0 top-0 z-[2] grid w-[280px] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-1.5 overflow-hidden border-l border-[rgba(126,168,196,0.35)] bg-[rgba(15,17,21,0.82)] px-2.5 py-2 text-[rgba(255,255,255,0.92)] backdrop-blur-md [backdrop-filter:blur(12px)] pointer-events-auto select-none";

const DARK_SCROLL_CLASS =
  "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.2)] [&::-webkit-scrollbar-thumb]:bg-clip-padding";

export function DanmakuStatsDrawer({
  onClose,
  stats,
}: DanmakuStatsDrawerProps) {
  return (
    <aside className={DRAWER_CLASS} aria-label="Danmaku stats">
      <header className="flex items-center justify-between">
        <strong className="text-[11px] font-semibold">弹幕统计</strong>
        <button
          className="min-h-6 cursor-pointer rounded-[5px] border border-[rgba(126,168,196,0.48)] bg-[rgba(126,168,196,0.2)] px-2 text-[10px] font-semibold text-[rgba(255,255,255,0.84)] transition-colors hover:bg-[rgba(126,168,196,0.32)]"
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </header>

      <section
        className="grid grid-cols-4 gap-[5px]"
        aria-label="消息概览"
      >
        <StatTile label="总消息" value={stats.totalMessages} />
        <StatTile label="近 1 分钟" value={stats.lastMinuteMessages} />
        <StatTile label="近 5 分钟" value={stats.lastFiveMinuteMessages} />
        <StatTile label="每分钟" value={stats.messagesPerMinute} />
      </section>

      <section className="grid min-w-0 content-start gap-[5px]">
        <h2 className="m-0 text-[11px] font-bold text-[rgba(126,168,196,0.88)]">
          消息类型
        </h2>
        <div className="grid grid-cols-4 gap-[5px]">
          {KIND_ORDER.map((kind) => (
            <div
              className="grid min-w-0 gap-px rounded-[5px] bg-[rgba(255,255,255,0.05)] p-[5px]"
              key={kind}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[rgba(255,255,255,0.5)]">
                {KIND_LABELS[kind]}
              </span>
              <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold text-[rgba(255,255,255,0.9)]">
                {stats.kindCounts[kind]}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <div
        className={classNames(
          "grid min-h-0 grid-cols-2 content-start items-start gap-2 overflow-y-auto pr-0.5",
          DARK_SCROLL_CLASS,
        )}
      >
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

      <footer className="text-[10px] text-[rgba(255,255,255,0.38)]">
        <span>最近 5 分钟窗口 · 连接新房后清空</span>
      </footer>
    </aside>
  );
}

type StatTileProps = {
  label: string;
  value: number;
};

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="grid min-w-0 gap-px rounded-[5px] border border-[rgba(126,168,196,0.26)] bg-[rgba(255,255,255,0.06)] p-1.5">
      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold leading-none text-white">
        {value}
      </strong>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[rgba(255,255,255,0.48)]">
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
    <section className="grid min-w-0 content-start gap-[5px]">
      <h2 className="m-0 text-[11px] font-bold text-[rgba(126,168,196,0.88)]">
        {title}
      </h2>
      <ol className="m-0 grid content-start gap-px p-0">
        {items.length === 0 ? (
          <li className="grid grid-cols-1 rounded px-1 py-[3px] text-[10px] text-[rgba(255,255,255,0.42)]">
            {emptyText}
          </li>
        ) : (
          items.map((item, index) => (
            <li
              className={classNames(
                "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[5px] rounded px-1 py-[3px]",
                index % 2 === 0 && "bg-[rgba(255,255,255,0.04)]",
              )}
              key={item.label}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[rgba(255,255,255,0.82)]">
                {item.label}
              </span>
              <strong className="text-[10px] font-bold text-[rgba(101,214,173,0.92)]">
                {item.count}
              </strong>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
