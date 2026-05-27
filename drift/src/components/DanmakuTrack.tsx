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
  const className = [
    "danmaku",
    `danmaku-${item.kind}`,
    item.highlighted ? "is-highlighted" : "",
    item.exiting ? "is-exiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onAnimationEnd={(event) => {
        if (event.animationName === "drift-across") {
          onDone?.(item.id);
        }
      }}
      onTransitionEnd={(event) => {
        if (event.propertyName === "opacity" && item.exiting) {
          onDone?.(item.id);
        }
      }}
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
