import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DanmakuMessageContent } from "./DanmakuMessageContent";

test("renders a fan medal source before the username", () => {
  render(
    <DanmakuMessageContent
      item={{
        id: "1",
        kind: "danmaku",
        sourceLabel: "补给箱",
        sourceColorIndex: 2,
        user: "观众",
        text: "内容",
      }}
      showEmotes
      showUsername
    />,
  );

  const content = screen.getByText("内容").closest(".danmaku-content");
  expect(content?.textContent).toBe("补给箱观众: 内容");
  expect(screen.getByText("补给箱")).toHaveClass("danmaku-room-source");
  expect(screen.getByText("补给箱")).toHaveAttribute(
    "data-source-color",
    "2",
  );
});

test("renders no source placeholder when the label is absent", () => {
  render(
    <DanmakuMessageContent
      item={{ id: "1", kind: "danmaku", user: "观众", text: "内容" }}
      showEmotes
      showUsername
    />,
  );

  expect(document.querySelector(".danmaku-room-source")).toBeNull();
});

test("renders the same source label first for super chats", () => {
  render(
    <DanmakuMessageContent
      item={{
        id: "1",
        kind: "super_chat",
        sourceLabel: "补给箱",
        user: "观众",
        text: "内容",
        superChatPrice: 30,
      }}
      showEmotes
      showUsername
    />,
  );

  expect(
    screen.getByText("内容").closest(".danmaku-super-chat-content")?.textContent,
  ).toBe("补给箱SC ¥30观众: 内容");
});
