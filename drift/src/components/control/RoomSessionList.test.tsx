import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { RoomSessionSnapshot } from "../../types/roomSession";
import { RoomSessionList } from "./RoomSessionList";

const SESSIONS: RoomSessionSnapshot[] = [
  {
    sessionId: "connected",
    requestedRoomId: 6,
    roomId: 6,
    anchorName: "主播甲",
    status: "connected",
    message: "已连接直播间 6",
  },
  {
    sessionId: "not-live",
    requestedRoomId: 7,
    status: "not_live",
    message: "直播间未开播",
  },
  {
    sessionId: "error",
    requestedRoomId: 8,
    status: "error",
    message: "连接失败",
  },
];

test("shows disconnect for active sessions and retry only for terminal sessions", async () => {
  const user = userEvent.setup();
  const onDisconnectSession = vi.fn();
  const onRetrySession = vi.fn();
  const onSaveRoom = vi.fn();

  render(
    <RoomSessionList
      commandErrors={{ error: "重试失败" }}
      onDisconnectSession={onDisconnectSession}
      onRetrySession={onRetrySession}
      onSaveRoom={onSaveRoom}
      sessions={SESSIONS}
    />,
  );

  expect(screen.getByRole("button", { name: "断开房间 6" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "重试房间 6" })).toBeNull();
  expect(screen.getByRole("button", { name: "重试房间 7" })).toBeVisible();
  expect(screen.getByRole("button", { name: "重试房间 8" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("重试失败");

  await user.click(screen.getByRole("button", { name: "断开房间 6" }));
  await user.click(screen.getByRole("button", { name: "重试房间 7" }));
  await user.click(screen.getByRole("button", { name: "保存房间 8 为常用" }));

  expect(onDisconnectSession).toHaveBeenCalledWith("connected");
  expect(onRetrySession).toHaveBeenCalledWith(SESSIONS[1]);
  expect(onSaveRoom).toHaveBeenCalledWith(SESSIONS[2]);
});
