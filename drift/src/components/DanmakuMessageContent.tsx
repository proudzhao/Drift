import { useState } from "react";
import type {
  DisplayMessageItem,
  LiveMessageSegment,
} from "../types/danmaku";

type Props = {
  item: DisplayMessageItem;
  showEmotes: boolean;
  showUsername: boolean;
};

export function DanmakuMessageContent({
  item,
  showEmotes,
  showUsername,
}: Props) {
  const hasVisibleSegments =
    showEmotes && item.segments && item.segments.length > 0;
  const shouldShowUsername = showUsername || item.followedUser === true;

  if (item.kind === "super_chat") {
    return (
      <span className="danmaku-super-chat-content">
        <span className="danmaku-super-chat-badge">
          {item.superChatPrice ? `SC ¥${item.superChatPrice}` : "SC"}
        </span>
        {shouldShowUsername && item.user ? (
          <span className="danmaku-user-prefix">{item.user}: </span>
        ) : null}
        <span className="danmaku-super-chat-text">{item.text}</span>
      </span>
    );
  }

  return (
    <span className="danmaku-content">
      {shouldShowUsername && item.user ? (
        <span className="danmaku-user-prefix">{item.user}: </span>
      ) : null}
      {hasVisibleSegments ? (
        item.segments?.map((segment, index) => (
          <DanmakuSegment segment={segment} key={`${item.id}-${index}`} />
        ))
      ) : (
        <span className="danmaku-text-segment">
          {stripRenderedUserPrefix(item, shouldShowUsername)}
        </span>
      )}
    </span>
  );
}

function stripRenderedUserPrefix(
  item: DisplayMessageItem,
  shouldShowUsername: boolean,
) {
  if (
    !shouldShowUsername ||
    !item.user ||
    (item.kind !== "gift" && item.kind !== "guard")
  ) {
    return item.text;
  }

  const prefix = `${item.user} `;
  return item.text.startsWith(prefix)
    ? item.text.slice(prefix.length)
    : item.text;
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
