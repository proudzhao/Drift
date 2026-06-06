import { useState } from "react";
import type { DanmakuItem } from "../types/danmaku";
import type { LiveMessageSegment } from "../types/danmaku";
import { TRACK_HEIGHT } from "../utils/danmakuRuntime";

type DanmakuTrackProps = {
  item: DanmakuItem;
  onDone?: (itemId: string) => void;
  showEmotes: boolean;
  showUsername: boolean;
  trackCount: number;
};

export function DanmakuTrack({
  item,
  onDone,
  showEmotes,
  showUsername,
  trackCount,
}: DanmakuTrackProps) {
  const track = item.track % trackCount;
  const hasVisibleSegments =
    showEmotes && item.segments && item.segments.length > 0;
  const fallbackText =
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
        top: `${track * TRACK_HEIGHT + 16}px`,
        animationDuration: `${item.duration}s`,
        animationDelay: `${item.delay}s`,
      }}
    >
      {hasVisibleSegments ? (
        <span className="danmaku-content">
          {showUsername && item.user ? (
            <span className="danmaku-user-prefix">{item.user}: </span>
          ) : null}
          {item.segments?.map((segment, index) => (
            <DanmakuSegment segment={segment} key={`${item.id}-${index}`} />
          ))}
        </span>
      ) : (
        fallbackText
      )}
    </div>
  );
}

type DanmakuSegmentProps = {
  segment: LiveMessageSegment;
};

function DanmakuSegment({ segment }: DanmakuSegmentProps) {
  const [failed, setFailed] = useState(false);

  if (segment.type !== "emote" || !segment.url || failed) {
    return <span className="danmaku-text-segment">{segment.text}</span>;
  }

  return (
    <img
      alt={segment.text}
      className="danmaku-emote"
      draggable={false}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={segment.url}
    />
  );
}
