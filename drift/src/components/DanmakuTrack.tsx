import type { DanmakuItem } from "../types/danmaku";

type DanmakuTrackProps = {
  item: DanmakuItem;
  onDone?: (itemId: string) => void;
  showUsername: boolean;
  trackCount: number;
};

export function DanmakuTrack({
  item,
  onDone,
  showUsername,
  trackCount,
}: DanmakuTrackProps) {
  const track = item.track % trackCount;
  const text =
    showUsername && item.user ? `${item.user}: ${item.text}` : item.text;

  return (
    <div
      className="danmaku"
      onAnimationEnd={() => onDone?.(item.id)}
      style={{
        top: `${track * 38 + 16}px`,
        animationDuration: `${item.duration}s`,
        animationDelay: `${item.delay}s`,
      }}
    >
      {text}
    </div>
  );
}
