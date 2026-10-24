import type { OnlineRankCountItem } from "../hooks/useOnlineRankCounts";

type Props = {
  items: OnlineRankCountItem[];
};

export function OnlineRankCountOverlay({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label="直播间同接数"
      className="online-rank-count-overlay"
    >
      <span className="online-rank-count-heading">同接</span>
      <ul>
        {items.map((item) => (
          <li key={item.sessionId}>
            <span className="online-rank-count-room" title={item.label}>
              {item.label}
            </span>
            <span className="online-rank-count-value">
              {formatOnlineCount(item.count)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function formatOnlineCount(count: number) {
  if (count < 10_000) return String(count);
  const value = Math.round((count / 10_000) * 10) / 10;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}万`;
}
