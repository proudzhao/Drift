import type { AppConfig } from "../types/config";
import type { LiveMessage, LiveMessageSegment } from "../types/danmaku";

export const DANMAKU_FLUSH_INTERVAL_MS = 500;
export const MIN_TRACK_COUNT = 3;
export const TRACK_HEIGHT = 38;
export const MAX_PENDING_QUEUE = 200;
export const MAX_REQUEUE_ROUNDS = 6;
export const MAX_REQUEUE_LATENCY_MS = 3000;
export const SUPER_CHAT_SCROLL_DURATION_RATIO = 1.2;

const MIN_LANE_GAP_PX = 120;
const EMOTE_RENDER_HEIGHT_RATIO = 1.55;
const EMOTE_RENDER_MAX_HEIGHT = 34;
const EMOTE_FALLBACK_WIDTH_RATIO = 1.8;
const SEGMENT_GAP_PX = 2;
const SUPER_CHAT_HORIZONTAL_CHROME_PX = 44;
const SUPER_CHAT_BADGE_GAP_PX = 6;

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
  showEmotes: boolean,
) {
  if (message.kind === "super_chat") {
    return estimateSuperChatWidth(message, fontSize, showUsername);
  }

  const usernameWidth =
    showUsername && message.user
      ? estimateTextWidth(`${message.user}: `, fontSize)
      : 0;
  const contentWidth =
    showEmotes && message.segments && message.segments.length > 0
      ? estimateSegmentsWidth(message.segments, fontSize)
      : estimateTextWidth(message.text, fontSize);
  return Math.max(80, usernameWidth + contentWidth);
}

function estimateSuperChatWidth(
  message: LiveMessage,
  fontSize: number,
  showUsername: boolean,
) {
  const badgeText = message.superChatPrice
    ? `SC ¥${message.superChatPrice}`
    : "SC";
  const badgeWidth = estimateTextWidth(badgeText, fontSize * 0.72) + 12;
  const usernameWidth =
    showUsername && message.user
      ? estimateTextWidth(`${message.user}: `, fontSize)
      : 0;
  const textWidth = estimateTextWidth(message.text, fontSize);

  return Math.max(
    120,
    SUPER_CHAT_HORIZONTAL_CHROME_PX +
      badgeWidth +
      SUPER_CHAT_BADGE_GAP_PX +
      usernameWidth +
      textWidth,
  );
}

function estimateSegmentsWidth(segments: LiveMessageSegment[], fontSize: number) {
  return segments.reduce((width, segment, index) => {
    const gap = index > 0 ? SEGMENT_GAP_PX : 0;
    return width + gap + estimateSegmentWidth(segment, fontSize);
  }, 0);
}

function estimateSegmentWidth(segment: LiveMessageSegment, fontSize: number) {
  if (segment.type === "text" || !segment.url) {
    return estimateTextWidth(segment.text, fontSize);
  }

  const renderedHeight = Math.min(
    fontSize * EMOTE_RENDER_HEIGHT_RATIO,
    EMOTE_RENDER_MAX_HEIGHT,
  );
  if (segment.width && segment.height && segment.height > 0) {
    return (segment.width / segment.height) * renderedHeight;
  }
  return fontSize * EMOTE_FALLBACK_WIDTH_RATIO;
}

export function laneCooldownMs(width: number, durationSeconds: number) {
  const viewportWidth =
    typeof window === "undefined" ? 1280 : Math.max(1, window.innerWidth);
  const travelDistance = viewportWidth + width + 64;
  const pixelsPerMs = travelDistance / (durationSeconds * 1000);
  return Math.ceil((width + MIN_LANE_GAP_PX) / pixelsPerMs);
}

export function resolveMessageDuration(
  message: LiveMessage,
  scrollDuration: number,
  sequence: number,
) {
  const baseDuration = scrollDuration + (sequence % 3);
  if (message.kind !== "super_chat") {
    return baseDuration;
  }

  return baseDuration * SUPER_CHAT_SCROLL_DURATION_RATIO;
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
    case "super_chat":
      return config.messageDisplay.showSuperChat;
    case "danmaku":
    default:
      return config.messageDisplay.showDanmaku;
  }
}

export function isPriorityMessage(message: Pick<LiveMessage, "kind">) {
  return (
    message.kind === "super_chat" ||
    message.kind === "guard" ||
    message.kind === "gift"
  );
}
