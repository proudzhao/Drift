import type { DisplayMessageItem } from "../types/danmaku";

export const USERNAME_DEFAULT_COLOR = "#c7d0d9";
export const FOLLOWED_USERNAME_COLOR = "#ff6fbe";

export const FAN_MEDAL_USERNAME_COLORS = [
  "#5d968f",
  "#5d7b9f",
  "#8d7ca6",
  "#bd6686",
  "#c79d24",
  "#499287",
  "#5876d8",
  "#705fbb",
  "#bc537e",
  "#ffa455",
] as const;

type UsernameColorItem = Pick<
  DisplayMessageItem,
  "kind" | "followedUser" | "currentRoomFanMedalLevel"
>;

export function resolveUsernameColor(item: UsernameColorItem) {
  if (item.followedUser) {
    return FOLLOWED_USERNAME_COLOR;
  }
  if (item.kind !== "danmaku") {
    return USERNAME_DEFAULT_COLOR;
  }

  const level = item.currentRoomFanMedalLevel;
  if (typeof level !== "number" || !Number.isInteger(level) || level <= 0) {
    return USERNAME_DEFAULT_COLOR;
  }

  const colorIndex = Math.min(
    Math.floor((level - 1) / 4),
    FAN_MEDAL_USERNAME_COLORS.length - 1,
  );
  return FAN_MEDAL_USERNAME_COLORS[colorIndex];
}
