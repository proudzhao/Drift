import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import appCss from "../App.css?raw";
import type { DanmakuItem } from "../types/danmaku";
import { DanmakuTrack } from "./DanmakuTrack";

function item(patch: Partial<DanmakuItem> = {}): DanmakuItem {
  return {
    id: "message",
    kind: "danmaku",
    user: "Alice",
    text: "正文",
    track: 0,
    duration: 12,
    delay: 0,
    createdAt: 1,
    ...patch,
  };
}

function renderTrack(message: DanmakuItem, showUsername = false) {
  return render(
    <DanmakuTrack
      item={message}
      showEmotes
      showUsername={showUsername}
      trackCount={3}
    />,
  );
}

function fireAnimationEnd(element: Element, animationName: string) {
  const event = new Event("webkitAnimationEnd", { bubbles: true });
  Object.defineProperty(event, "animationName", { value: animationName });
  fireEvent(element, event);
}

test("forces the followed username while normal messages obey the global setting", () => {
  const followed = renderTrack(item({ followedUser: true }));
  expect(screen.getByText("Alice:")).toHaveClass("danmaku-user-prefix");
  expect(screen.getByText("正文")).toBeVisible();
  followed.unmount();

  renderTrack(item());
  expect(screen.queryByText("Alice:")).not.toBeInTheDocument();
});

test.each([
  [{}, "#c7d0d9"],
  [{ currentRoomFanMedalLevel: 13 }, "#bd6686"],
  [{ currentRoomFanMedalLevel: 13, followedUser: true }, "#ff6fbe"],
] as const)("sets the shared horizontal username color", (patch, color) => {
  const { container } = renderTrack(item(patch), true);
  const root = container.querySelector(".danmaku");
  const username = screen.getByText("Alice:");

  expect(root).toHaveStyle({ "--username-color": color });
  expect(username).toHaveClass("danmaku-user-prefix");
  expect(username.textContent).toBe("Alice: ");
  expect(screen.getByText("正文")).toHaveClass("danmaku-text-segment");
});

test.each([
  ["gift", "Alice 送出 小花 x2", "送出 小花 x2"],
  ["guard", "Alice 开通 舰长", "开通 舰长"],
] as const)(
  "renders one username for production-shaped horizontal %s text",
  (kind, text, content) => {
    const hidden = renderTrack(item({ kind, text }));
    expect(screen.queryByText("Alice:")).not.toBeInTheDocument();
    expect(screen.getByText(text)).toBeVisible();
    hidden.unmount();

    const enabled = renderTrack(item({ kind, text }), true);
    expect(screen.getAllByText("Alice:")).toHaveLength(1);
    expect(screen.getByText(content)).toBeVisible();
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    enabled.unmount();

    renderTrack(item({ kind, text, followedUser: true }));
    expect(screen.getAllByText("Alice:")).toHaveLength(1);
    expect(screen.getByText(content)).toBeVisible();
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  },
);

test("keeps followed SC badge, amount color and username", () => {
  renderTrack(
    item({
      kind: "super_chat",
      followedUser: true,
      superChatPrice: 100,
      superChatColor: "#e2b52b",
    }),
  );

  const root = screen.getByText("SC ¥100").closest(".danmaku");
  expect(root).toHaveClass("danmaku-super_chat", "is-followed");
  expect(root).toHaveStyle({ "--super-chat-color": "#e2b52b" });
  expect(screen.getByText("Alice:")).toBeVisible();
});

test("combines followed, generic highlight and self classes", () => {
  renderTrack(item({ followedUser: true, highlighted: true, isSelf: true }));
  expect(screen.getByText("正文").closest(".danmaku")).toHaveClass(
    "is-followed",
    "is-highlighted",
    "is-self",
  );
});

test("keeps horizontal emote DOM and text fallback behavior", () => {
  const { container } = renderTrack(
    item({
      segments: [
        { type: "text", text: "正文" },
        { type: "emote", text: "[小电视]", url: "https://example.test/emote.png" },
      ],
    }),
  );
  const root = container.querySelector(".danmaku");
  const content = root?.firstElementChild;
  const emote = screen.getByRole("img", { name: "[小电视]" });

  expect(content).toHaveClass("danmaku-content");
  expect(screen.getByText("正文")).toHaveClass("danmaku-text-segment");
  expect(emote).toHaveClass("danmaku-emote");

  fireEvent.error(emote);
  expect(screen.queryByRole("img", { name: "[小电视]" })).not.toBeInTheDocument();
  expect(screen.getByText("[小电视]")).toHaveClass("danmaku-text-segment");
});

test("renders only marked room emotes with the large visual treatment", () => {
  const { container } = renderTrack(
    item({
      segments: [
        {
          type: "emote",
          text: "无辜啾",
          url: "https://example.test/room.png",
          isLarge: true,
        },
        {
          type: "emote",
          text: "[妙]",
          url: "https://example.test/emoji.png",
        },
      ],
    }),
  );
  const emotes = container.querySelectorAll(".danmaku-emote");

  expect(emotes[0]).toHaveClass("is-large");
  expect(emotes[1]).not.toHaveClass("is-large");
  expect(appCss).toMatch(
    /\.danmaku-emote\.is-large\s*\{[^}]*height:\s*2\.4em;[^}]*max-height:\s*52px;/s,
  );
});

test("bottom-aligns a large emote only on the final horizontal track", () => {
  const largeEmote = {
    segments: [
      {
        type: "emote" as const,
        text: "无辜啾",
        url: "https://example.test/room.png",
        isLarge: true,
      },
    ],
  };
  const finalTrack = renderTrack(item({ ...largeEmote, track: 2 }));
  const finalRoot = finalTrack.container.querySelector(".danmaku");

  expect(finalRoot).toHaveStyle({ bottom: "0px" });
  expect(finalRoot).not.toHaveStyle({ top: "92px" });
  finalTrack.unmount();

  const upperTrack = renderTrack(item({ ...largeEmote, track: 1 }));
  expect(upperTrack.container.querySelector(".danmaku")).toHaveStyle({
    top: "54px",
  });
  upperTrack.unmount();

  const regularFinalTrack = renderTrack(item({ track: 2 }));
  expect(regularFinalTrack.container.querySelector(".danmaku")).toHaveStyle({
    top: "92px",
  });
  regularFinalTrack.unmount();

  const hiddenEmotes = render(
    <DanmakuTrack
      item={item({ ...largeEmote, track: 2 })}
      showEmotes={false}
      showUsername={false}
      trackCount={3}
    />,
  );
  expect(hiddenEmotes.container.querySelector(".danmaku")).toHaveStyle({
    top: "92px",
  });
});

test("keeps horizontal positioning, timing and drift completion behavior", () => {
  const onDone = vi.fn();
  const { container } = render(
    <DanmakuTrack
      item={item({ track: 1, duration: 15, delay: 0.5 })}
      onDone={onDone}
      showEmotes
      showUsername={false}
      trackCount={3}
    />,
  );
  const root = container.querySelector(".danmaku");

  expect(root).toHaveStyle({
    top: "54px",
    animationDuration: "15s",
    animationDelay: "0.5s",
  });
  fireAnimationEnd(root as Element, "other");
  expect(onDone).not.toHaveBeenCalled();
  fireAnimationEnd(root as Element, "drift-across");
  expect(onDone).toHaveBeenCalledWith("message");
});

test("uses a compact first-track offset below online counts", () => {
  const { container } = render(
    <DanmakuTrack
      item={item({ track: 0 })}
      showEmotes
      showUsername={false}
      topOffset={4}
      trackCount={3}
    />,
  );

  expect(container.querySelector(".danmaku")).toHaveStyle({ top: "4px" });
});

test("uses a fixed non-animated followed style", () => {
  expect(appCss).toContain("color: var(--username-color, #c7d0d9)");
  expect(appCss).toContain(".danmaku-user-prefix");
  expect(appCss).toContain("font-weight: 800");
  expect(appCss).toContain(".danmaku.is-followed::before");
  expect(appCss).toContain("width: 3px");
  expect(appCss).toContain("#ff6fbe");
  expect(appCss).toContain("@keyframes drift-across");
  expect(appCss).toContain("@keyframes vertical-chat-fade-in");
  expect(appCss).toContain("@keyframes vertical-chat-row-fade-in");
  expect(appCss.match(/@keyframes/g)).toHaveLength(3);
});
