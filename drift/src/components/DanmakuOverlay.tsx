import type { DanmakuItem } from "../types/danmaku";
import { DanmakuTrack } from "./DanmakuTrack";

type DanmakuOverlayProps = {
  items: DanmakuItem[];
  onItemDone?: (itemId: string) => void;
  showEmotes: boolean;
  topOffset?: number;
  trackCount: number;
  showUsername: boolean;
};

export function DanmakuOverlay({
  items,
  onItemDone,
  showEmotes,
  showUsername,
  topOffset,
  trackCount,
}: DanmakuOverlayProps) {
  return (
    <section
      className="pointer-events-none absolute inset-0"
      aria-label="Drift danmaku preview"
    >
      {items.map((item) => (
        <DanmakuTrack
          item={item}
          key={item.id}
          onDone={onItemDone}
          showEmotes={showEmotes}
          showUsername={showUsername}
          topOffset={topOffset}
          trackCount={trackCount}
        />
      ))}
    </section>
  );
}
