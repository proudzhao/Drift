import { type CSSProperties } from "react";
import type { DanmakuItem } from "../types/danmaku";
import { TRACK_HEIGHT } from "../utils/danmakuRuntime";
import { resolveUsernameColor } from "../utils/usernameColor";
import { DanmakuMessageContent } from "./DanmakuMessageContent";

type DanmakuTrackProps = {
  item: DanmakuItem;
  onDone?: (itemId: string) => void;
  showEmotes: boolean;
  showUsername: boolean;
  topOffset?: number;
  trackCount: number;
};

export function DanmakuTrack({
  item,
  onDone,
  showEmotes,
  showUsername,
  topOffset = 16,
  trackCount,
}: DanmakuTrackProps) {
  const track = item.track % trackCount;
  const isSuperChat = item.kind === "super_chat";
  const hasVisibleLargeEmote = Boolean(
    showEmotes &&
      item.segments?.some(
        (segment) =>
          segment.type === "emote" && Boolean(segment.url) && segment.isLarge,
      ),
  );
  const anchorToBottom = hasVisibleLargeEmote && track === trackCount - 1;
  const superChatColor = item.superChatColor ?? "#F5A962";
  const className = [
    "danmaku",
    `danmaku-${item.kind}`,
    item.followedUser ? "is-followed" : "",
    item.highlighted ? "is-highlighted" : "",
    item.isSelf ? "is-self" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const positionStyle: CSSProperties = anchorToBottom
    ? { bottom: "0px" }
    : { top: `${track * TRACK_HEIGHT + topOffset}px` };
  const style: CSSProperties & {
    "--username-color": string;
    "--super-chat-color"?: string;
  } = {
    ...positionStyle,
    animationDuration: `${item.duration}s`,
    animationDelay: `${item.delay}s`,
    "--username-color": resolveUsernameColor(item),
    ...(isSuperChat ? { "--super-chat-color": superChatColor } : {}),
  };

  return (
    <div
      className={className}
      onAnimationEnd={(event) => {
        if (event.animationName === "drift-across") {
          onDone?.(item.id);
        }
      }}
      style={style}
    >
      <DanmakuMessageContent
        item={item}
        showEmotes={showEmotes}
        showUsername={showUsername}
      />
    </div>
  );
}
