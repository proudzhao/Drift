import type { LiveMessageKind } from "../types/danmaku";
import type { DanmakuStatsSnapshot } from "../utils/danmakuStats";

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

export function DanmakuStatsDrawer({
  onClose,
  stats,
}: DanmakuStatsDrawerProps) {
  return (
    <aside className="history-drawer stats-drawer" aria-label="Danmaku stats">
      <header className="history-header">
        <strong>弹幕统计</strong>
        <button onClick={onClose} type="button">
          关闭
        </button>
      </header>

      <section className="stats-summary" aria-label="消息概览">
        <StatTile label="总消息" value={stats.totalMessages} />
        <StatTile label="近 1 分钟" value={stats.lastMinuteMessages} />
        <StatTile label="近 5 分钟" value={stats.lastFiveMinuteMessages} />
        <StatTile label="每分钟" value={stats.messagesPerMinute} />
      </section>

      <section className="stats-section">
        <h2>消息类型</h2>
        <div className="stats-kind-list">
          {KIND_ORDER.map((kind) => (
            <div className="stats-kind-row" key={kind}>
              <span>{KIND_LABELS[kind]}</span>
              <strong>{stats.kindCounts[kind]}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="stats-lists">
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

      <footer className="history-footer">
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
    <div className="stats-tile">
      <strong>{value}</strong>
      <span>{label}</span>
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
    <section className="stats-section">
      <h2>{title}</h2>
      <ol className="stats-ranking">
        {items.length === 0 ? (
          <li className="stats-empty">{emptyText}</li>
        ) : (
          items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
