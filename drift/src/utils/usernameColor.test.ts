import { expect, test } from "vitest";
import type { DisplayMessageItem } from "../types/danmaku";
import {
  FOLLOWED_USERNAME_COLOR,
  resolveUsernameColor,
  USERNAME_DEFAULT_COLOR,
} from "./usernameColor";

function item(
  patch: Partial<DisplayMessageItem> = {},
): DisplayMessageItem {
  return {
    id: "message",
    kind: "danmaku",
    user: "用户",
    text: "正文",
    ...patch,
  };
}

test.each([
  [1, "#5d968f"],
  [4, "#5d968f"],
  [5, "#5d7b9f"],
  [8, "#5d7b9f"],
  [9, "#8d7ca6"],
  [12, "#8d7ca6"],
  [13, "#bd6686"],
  [16, "#bd6686"],
  [17, "#c79d24"],
  [20, "#c79d24"],
  [21, "#499287"],
  [24, "#499287"],
  [25, "#5876d8"],
  [28, "#5876d8"],
  [29, "#705fbb"],
  [32, "#705fbb"],
  [33, "#bc537e"],
  [36, "#bc537e"],
  [37, "#ffa455"],
  [40, "#ffa455"],
  [41, "#ffa455"],
  [99, "#ffa455"],
] as const)("maps fan-medal level %i to %s", (level, color) => {
  expect(resolveUsernameColor(item({ currentRoomFanMedalLevel: level }))).toBe(
    color,
  );
});

test.each([undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "falls back to gray for invalid level %s",
  (currentRoomFanMedalLevel) => {
    expect(
      resolveUsernameColor(item({ currentRoomFanMedalLevel })),
    ).toBe(USERNAME_DEFAULT_COLOR);
  },
);

test("followed pink wins over the fan-medal palette", () => {
  expect(
    resolveUsernameColor(
      item({ followedUser: true, currentRoomFanMedalLevel: 37 }),
    ),
  ).toBe(FOLLOWED_USERNAME_COLOR);
});

test.each(["gift", "guard", "super_chat"] as const)(
  "ignores a stray medal level on %s",
  (kind) => {
    expect(resolveUsernameColor(item({ kind, currentRoomFanMedalLevel: 13 }))).toBe(
      USERNAME_DEFAULT_COLOR,
    );
  },
);
