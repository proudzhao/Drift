import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type { VerticalChatItem } from "../types/danmaku";
import { resolveUsernameColor } from "../utils/usernameColor";
import { DanmakuMessageContent } from "./DanmakuMessageContent";

type VerticalChatOverlayProps = {
  items: VerticalChatItem[];
  onItemsPruned: (itemIds: string[]) => void;
  showEmotes: boolean;
};

function messageClassName(item: VerticalChatItem) {
  return [
    "vertical-chat-message",
    `vertical-chat-${item.kind}`,
    item.followedUser ? "is-followed" : "",
    item.highlighted ? "is-highlighted" : "",
    item.isSelf ? "is-self" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function VerticalChatOverlay({
  items,
  onItemsPruned,
  showEmotes,
}: VerticalChatOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const onItemsPrunedRef = useRef(onItemsPruned);
  onItemsPrunedRef.current = onItemsPruned;

  const pruneRowsAboveViewport = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const viewportTop = scrollElement.getBoundingClientRect().top;
    const rows = [
      ...scrollElement.querySelectorAll<HTMLElement>("[data-message-id]"),
    ];
    const prunedIds = rows
      .slice(0, -1)
      .filter((element) => element.getBoundingClientRect().bottom <= viewportTop)
      .map((element) => element.dataset.messageId)
      .filter((itemId): itemId is string => itemId !== undefined);

    if (prunedIds.length > 0) {
      onItemsPrunedRef.current(prunedIds);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    scrollElement.scrollTo?.({
      top: scrollElement.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, []);

  useLayoutEffect(() => {
    scrollToBottom();
  }, [items, scrollToBottom]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    let timeoutId: number | undefined;
    const schedulePrune = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(pruneRowsAboveViewport, 80);
    };
    const handleResize = () => {
      scrollToBottom();
      schedulePrune();
    };

    scrollElement.addEventListener("scroll", schedulePrune);
    window.addEventListener("resize", handleResize);
    return () => {
      window.clearTimeout(timeoutId);
      scrollElement.removeEventListener("scroll", schedulePrune);
      window.removeEventListener("resize", handleResize);
    };
  }, [pruneRowsAboveViewport, scrollToBottom]);

  return (
    <section aria-label="Drift vertical chat" className="vertical-chat-overlay">
      <div className="vertical-chat-scroll" ref={scrollRef}>
        <div className="vertical-chat-flow">
          {items.map((item) => (
            <article
              className={messageClassName(item)}
              data-message-id={item.id}
              key={item.id}
              style={
                {
                  "--username-color": resolveUsernameColor(item),
                  ...(item.kind === "super_chat"
                    ? {
                        "--super-chat-color":
                          item.superChatColor ?? "#f5a962",
                      }
                    : {}),
                } as CSSProperties
              }
            >
              <DanmakuMessageContent
                item={item}
                showEmotes={showEmotes}
                showUsername
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
