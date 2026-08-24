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

test("uses a fixed non-animated followed style", () => {
  expect(appCss).toContain("color: var(--username-color, #c7d0d9)");
  expect(appCss).toContain(".danmaku-user-prefix");
  expect(appCss).toContain("font-weight: 800");
  expect(appCss).toContain(".danmaku.is-followed::before");
  expect(appCss).toContain("width: 3px");
  expect(appCss).toContain("#ff6fbe");
  expect(appCss).toContain("@keyframes drift-across");
  expect(appCss).toContain("@keyframes vertical-chat-fade-in");
  expect(appCss.match(/@keyframes/g)).toHaveLength(2);
});
