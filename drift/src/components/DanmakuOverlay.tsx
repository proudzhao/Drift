import type { DanmakuItem } from "../types/danmaku";
import { DanmakuTrack } from "./DanmakuTrack";

type DanmakuOverlayProps = {
  items: DanmakuItem[];
  trackCount: number;
  showUsername: boolean;
};

export function DanmakuOverlay({
  items,
  showUsername,
  trackCount,
}: DanmakuOverlayProps) {
  return (
    <section className="danmaku-stage" aria-label="Drift danmaku preview">
      {items.map((item) => (
        <DanmakuTrack
          item={item}
          key={item.id}
          showUsername={showUsername}
          trackCount={trackCount}
        />
      ))}
    </section>
  );
}
