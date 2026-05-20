import type { DanmakuItem } from "../types/danmaku";
import { DanmakuTrack } from "./DanmakuTrack";

type DanmakuOverlayProps = {
  items: DanmakuItem[];
  onItemDone?: (itemId: string) => void;
  trackCount: number;
  showUsername: boolean;
};

export function DanmakuOverlay({
  items,
  onItemDone,
  showUsername,
  trackCount,
}: DanmakuOverlayProps) {
  return (
    <section className="danmaku-stage" aria-label="Drift danmaku preview">
      {items.map((item) => (
        <DanmakuTrack
          item={item}
          key={item.id}
          onDone={onItemDone}
          showUsername={showUsername}
          trackCount={trackCount}
        />
      ))}
    </section>
  );
}
