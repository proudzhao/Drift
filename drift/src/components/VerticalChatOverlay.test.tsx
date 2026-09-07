import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import appCss from "../App.css?raw";
import type { VerticalChatItem } from "../types/danmaku";
import { VerticalChatOverlay } from "./VerticalChatOverlay";

const originalScrollTo = HTMLElement.prototype.scrollTo;

function item(patch: Partial<VerticalChatItem> = {}): VerticalChatItem {
  return {
    id: "vertical-1",
    kind: "danmaku",
    user: "Alice",
    text: "这是一条会完整换行的纵向消息",
    createdAt: 1,
    ...patch,
  };
}

function installMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

afterEach(() => {
  if (originalScrollTo) {
    HTMLElement.prototype.scrollTo = originalScrollTo;
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("renders every kind in FIFO DOM order and always shows usernames", () => {
  const { container } = render(
    <VerticalChatOverlay
      items={[
        item({ id: "d", kind: "danmaku" }),
        item({
          id: "sc",
          kind: "super_chat",
          superChatPrice: 100,
          superChatColor: "#e2b52b",
        }),
        item({ id: "g", kind: "gift", text: "Alice 送出 小花 x2" }),
        item({ id: "guard", kind: "guard", text: "Alice 开通 舰长" }),
      ]}
      onItemsPruned={() => undefined}
      showEmotes
    />,
  );

  expect(
    [...container.querySelectorAll(".vertical-chat-message")].map((node) =>
      node.getAttribute("data-message-id"),
    ),
  ).toEqual(["d", "sc", "g", "guard"]);
  expect(screen.getAllByText("Alice:")).toHaveLength(4);
  expect(screen.getByText("SC ¥100")).toBeVisible();
  expect(screen.getByText("送出 小花 x2")).toBeVisible();
  expect(screen.getByText("开通 舰长")).toBeVisible();
  expect(screen.queryByText("Alice 送出 小花 x2")).not.toBeInTheDocument();
  expect(screen.queryByText("Alice 开通 舰长")).not.toBeInTheDocument();
});

test("uses the shared username palette without changing special-message bodies", () => {
  const { container } = render(
    <VerticalChatOverlay
      items={[
        item({ id: "default" }),
        item({ id: "medal", currentRoomFanMedalLevel: 13 }),
        item({
          id: "followed",
          currentRoomFanMedalLevel: 13,
          followedUser: true,
        }),
        item({
          id: "sc",
          kind: "super_chat",
          currentRoomFanMedalLevel: 13,
          superChatPrice: 100,
          superChatColor: "#e2b52b",
        }),
        item({
          id: "gift",
          kind: "gift",
          currentRoomFanMedalLevel: 13,
          text: "Alice 送出 小花 x2",
        }),
        item({
          id: "guard",
          kind: "guard",
          currentRoomFanMedalLevel: 13,
          text: "Alice 开通 舰长",
        }),
      ]}
      onItemsPruned={() => undefined}
      showEmotes
    />,
  );

  expect(
    container.querySelector('[data-message-id="default"]'),
  ).toHaveStyle({ "--username-color": "#c7d0d9" });
  expect(container.querySelector('[data-message-id="medal"]')).toHaveStyle({
    "--username-color": "#bd6686",
  });
  expect(
    container.querySelector('[data-message-id="followed"]'),
  ).toHaveStyle({ "--username-color": "#ff6fbe" });
  for (const id of ["sc", "gift", "guard"]) {
    expect(container.querySelector(`[data-message-id="${id}"]`)).toHaveStyle({
      "--username-color": "#c7d0d9",
    });
  }
  expect(screen.getByText("SC ¥100")).toBeVisible();
  expect(screen.getByText("送出 小花 x2")).toBeVisible();
  expect(screen.getByText("开通 舰长")).toBeVisible();
  expect(screen.queryByText("Alice 送出 小花 x2")).not.toBeInTheDocument();
  expect(screen.queryByText("Alice 开通 舰长")).not.toBeInTheDocument();
});

test("keeps combined semantic classes and full wrapping styles", () => {
  const { container } = render(
    <VerticalChatOverlay
      items={[item({ followedUser: true, highlighted: true, isSelf: true })]}
      onItemsPruned={() => undefined}
      showEmotes
    />,
  );

  expect(container.querySelector(".vertical-chat-message")).toHaveClass(
    "is-followed",
    "is-highlighted",
    "is-self",
  );
  expect(appCss).toContain("overflow-wrap: anywhere");
  expect(appCss).toContain("pointer-events: none");
});

test("uses one full-container background instead of separate message cards", () => {
  expect(appCss).toMatch(
    /\.vertical-chat-overlay\s*\{[^}]*background:\s*rgba\(8, 18, 31, 0\.58\)/s,
  );
  expect(appCss).toMatch(
    /\.vertical-chat-scroll\s*\{[^}]*mask-image:\s*linear-gradient/s,
  );
  expect(appCss).toMatch(
    /\.vertical-chat-message\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent/s,
  );
  expect(appCss).toContain("animation: vertical-chat-row-fade-in");
  expect(appCss).toMatch(
    /@keyframes vertical-chat-row-fade-in\s*\{[^}]*opacity:\s*0;[^}]*}\s*to\s*\{[^}]*opacity:\s*1/s,
  );
  expect(appCss).not.toContain("background: rgba(38, 29, 9, 0.62)");
});

test("scrolls to the bottom and prunes rows above the viewport", async () => {
  installMatchMedia(false);
  const onItemsPruned = vi.fn();
  const scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = scrollTo;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(240);
  vi.spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLElement) {
    const element = this;
    if (element.classList.contains("vertical-chat-scroll")) {
      return {
        top: 10,
        bottom: 170,
        left: 0,
        right: 320,
        width: 320,
        height: 160,
        x: 0,
        y: 10,
        toJSON: () => ({}),
      } as DOMRect;
    }
    if (element.dataset.messageId === "old") {
      return {
        top: -20,
        bottom: 5,
        left: 0,
        right: 320,
        width: 320,
        height: 25,
        x: 0,
        y: -20,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return {
      top: 120,
      bottom: 150,
      left: 0,
      right: 320,
      width: 320,
      height: 30,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    } as DOMRect;
  });
  const { rerender } = render(
    <VerticalChatOverlay
      items={[item({ id: "old" })]}
      onItemsPruned={onItemsPruned}
      showEmotes
    />,
  );

  rerender(
    <VerticalChatOverlay
      items={[item({ id: "old" }), item({ id: "new" })]}
      onItemsPruned={onItemsPruned}
      showEmotes
    />,
  );

  await waitFor(() =>
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "smooth",
      top: 240,
    }),
  );
  window.dispatchEvent(new Event("resize"));
  await waitFor(() => expect(onItemsPruned).toHaveBeenCalledWith(["old"]));
});

test("reanchors to the bottom on resize before pruning after scrolling settles", async () => {
  installMatchMedia(false);
  const onItemsPruned = vi.fn();
  const scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = scrollTo;
  let scrollHeight = 240;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    () => scrollHeight,
  );
  vi.spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("vertical-chat-scroll")) {
      return { top: 10 } as DOMRect;
    }
    return {
      bottom: this.dataset.messageId === "new" ? 150 : 5,
    } as DOMRect;
  });
  render(
    <VerticalChatOverlay
      items={[item({ id: "old" }), item({ id: "new" })]}
      onItemsPruned={onItemsPruned}
      showEmotes
    />,
  );
  scrollTo.mockClear();
  scrollHeight = 360;

  window.dispatchEvent(new Event("resize"));

  expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 360 });
  expect(onItemsPruned).not.toHaveBeenCalled();
  await waitFor(() => expect(onItemsPruned).toHaveBeenCalledWith(["old"]));
  expect(scrollTo.mock.invocationCallOrder[0]).toBeLessThan(
    onItemsPruned.mock.invocationCallOrder[0],
  );
});

test("batches departed rows after programmatic scrolling settles", async () => {
  installMatchMedia(false);
  const onItemsPruned = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("vertical-chat-scroll")) {
      return { top: 10 } as DOMRect;
    }
    return {
      bottom: this.dataset.messageId === "new" ? 150 : 5,
    } as DOMRect;
  });
  const { container } = render(
    <VerticalChatOverlay
      items={[
        item({ id: "older" }),
        item({ id: "old" }),
        item({ id: "new" }),
      ]}
      onItemsPruned={onItemsPruned}
      showEmotes
    />,
  );
  const scrollElement = container.querySelector(".vertical-chat-scroll");

  fireEvent.scroll(scrollElement as Element);
  fireEvent.scroll(scrollElement as Element);

  await waitFor(() => {
    expect(onItemsPruned).toHaveBeenCalledTimes(1);
    expect(onItemsPruned).toHaveBeenCalledWith(["older", "old"]);
  });
});

test("never prunes the newest FIFO row when every rectangle is zero-sized", async () => {
  installMatchMedia(false);
  const onItemsPruned = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 0,
  } as DOMRect);
  const { container } = render(
    <VerticalChatOverlay
      items={[item({ id: "old" }), item({ id: "new" })]}
      onItemsPruned={onItemsPruned}
      showEmotes
    />,
  );

  fireEvent.scroll(
    container.querySelector(".vertical-chat-scroll") as Element,
  );

  await waitFor(() => expect(onItemsPruned).toHaveBeenCalledWith(["old"]));
  expect(onItemsPruned).not.toHaveBeenCalledWith(["old", "new"]);
});

test("scrolls immediately when reduced motion is enabled", async () => {
  installMatchMedia(true);
  const scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = scrollTo;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(240);

  render(
    <VerticalChatOverlay
      items={[item()]}
      onItemsPruned={() => undefined}
      showEmotes
    />,
  );

  await waitFor(() =>
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "auto",
      top: 240,
    }),
  );
});
