import type { AppConfig } from "../types/config";
import type { DanmakuItem, LiveMessage } from "../types/danmaku";

export const DANMAKU_FLUSH_INTERVAL_MS = 500;
export const MIN_TRACK_COUNT = 3;
export const TRACK_HEIGHT = 38;
export const MIN_ALIVE_MS = 4000;
export const MAX_PENDING_QUEUE = 200;
export const ELDER_RATIO = 0.15;
export const MAX_REQUEUE_ROUNDS = 6;
export const MAX_REQUEUE_LATENCY_MS = 3000;

const MIN_LANE_GAP_PX = 120;

type Density = AppConfig["appearance"]["density"];

export type QueuedLiveMessage = LiveMessage & {
  attempts: number;
  highlighted?: boolean;
  queuedAt: number;
};

export type DensityLimits = {
  maxItems: number;
  perFlush: number;
};

const DENSITY_PER_TRACK: Record<
  Density,
  { itemsPerTrack: number; perFlushPerTrack: number }
> = {
  low: { itemsPerTrack: 1.5, perFlushPerTrack: 0.2 },
  medium: { itemsPerTrack: 3.0, perFlushPerTrack: 0.5 },
  high: { itemsPerTrack: 5.0, perFlushPerTrack: 1.0 },
};

export function calcDensityLimits(
  density: Density,
  trackCount: number,
): DensityLimits {
  const cfg = DENSITY_PER_TRACK[density];
  return {
    maxItems: Math.max(
      MIN_TRACK_COUNT,
      Math.ceil(cfg.itemsPerTrack * trackCount),
    ),
    perFlush: Math.max(1, Math.ceil(cfg.perFlushPerTrack * trackCount)),
  };
}

function estimateTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((width, character) => {
    return width + (character.charCodeAt(0) <= 0x7f ? fontSize * 0.56 : fontSize);
  }, 0);
}

export function estimateMessageWidth(
  message: LiveMessage,
  fontSize: number,
  showUsername: boolean,
) {
  const displayText =
    showUsername && message.user ? `${message.user}: ${message.text}` : message.text;
  return Math.max(80, estimateTextWidth(displayText, fontSize));
}

export function laneCooldownMs(width: number, durationSeconds: number) {
  const viewportWidth =
    typeof window === "undefined" ? 1280 : Math.max(1, window.innerWidth);
  const travelDistance = viewportWidth + width + 64;
  const pixelsPerMs = travelDistance / (durationSeconds * 1000);
  return Math.ceil((width + MIN_LANE_GAP_PX) / pixelsPerMs);
}

export function ensureLaneAvailability(lanes: number[], trackCount: number) {
  if (lanes.length > trackCount) {
    lanes.length = trackCount;
  }

  while (lanes.length < trackCount) {
    lanes.push(0);
  }
}

export function findAvailableTrack(lanes: number[], now: number) {
  let selectedTrack: number | null = null;
  let oldestAvailability = Number.POSITIVE_INFINITY;

  lanes.forEach((availableAt, track) => {
    if (availableAt <= now && availableAt < oldestAvailability) {
      selectedTrack = track;
      oldestAvailability = availableAt;
    }
  });

  return selectedTrack;
}

export function isMessageTypeVisible(message: LiveMessage, config: AppConfig) {
  switch (message.kind) {
    case "gift":
      return config.messageDisplay.showGift;
    case "guard":
      return config.messageDisplay.showGuard;
    case "danmaku":
    default:
      return config.messageDisplay.showDanmaku;
  }
}

export function markExitingItems(
  currentItems: DanmakuItem[],
  nextItems: DanmakuItem[],
  densityLimits: DensityLimits,
) {
  let combined = [...currentItems, ...nextItems];

  const elderPoolSize = Math.max(
    1,
    Math.ceil(densityLimits.maxItems * ELDER_RATIO),
  );
  const elderCount = combined.reduce(
    (count, item) => count + (item.elder ? 1 : 0),
    0,
  );
  const openElderSlots = elderPoolSize - elderCount;

  if (openElderSlots > 0) {
    const promoteNow = Date.now();
    let promoted = 0;
    combined = combined.map((item) => {
      if (promoted >= openElderSlots) return item;
      if (item.elder || item.exiting) return item;
      if (promoteNow - item.createdAt < MIN_ALIVE_MS) return item;
      promoted++;
      return { ...item, elder: true };
    });
  }

  const excess = combined.length - densityLimits.maxItems;
  if (excess <= 0) {
    return combined;
  }

  const alreadyExiting = combined.reduce(
    (count, item) => count + (item.exiting ? 1 : 0),
    0,
  );
  const toMark = Math.max(0, excess - alreadyExiting);

  if (toMark <= 0) return combined;

  const markNow = Date.now();
  let marked = 0;
  return combined.map((item) => {
    if (item.exiting || marked >= toMark) return item;
    if (item.elder) return item;
    if (markNow - item.createdAt < MIN_ALIVE_MS) return item;
    marked++;
    return { ...item, exiting: true };
  });
}
