import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { SavedRoom, SavedRoomGroup } from "../../types/config";
import type { RoomSessionSnapshot } from "../../types/roomSession";
import { SavedRoomList, type EditingSavedRoom } from "./SavedRoomList";

const GROUPS: SavedRoomGroup[] = [
  {
    id: "chat",
    name: "聊天",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  },
];

const ROOM: SavedRoom = {
  id: "room-1",
  roomId: "123456",
  displayName: "深夜电台",
  anchorName: "示例主播",
  groupId: "chat",
  updatedAt: "2026-08-17T00:00:00.000Z",
};

function renderSavedRoomList(
  rooms: SavedRoom[],
  editingSavedRoom: EditingSavedRoom | null = null,
  sessions: RoomSessionSnapshot[] = [],
) {
  const callbacks = {
    onConnectRoom: vi.fn(),
    onDeleteRoom: vi.fn(),
    onDisconnectSession: vi.fn(),
    onEditRoomChange: vi.fn(),
    onRetrySession: vi.fn(),
    onRoomSelected: vi.fn(),
    onSaveEditedRoom: vi.fn(),
    onStartEditRoom: vi.fn(),
    onStopEditRoom: vi.fn(),
  };

  render(
    <SavedRoomList
      editingSavedRoom={editingSavedRoom}
      groups={GROUPS}
      commandErrors={{}}
      rooms={rooms}
      selectedSavedRoomIds={new Set()}
      sessions={sessions}
      {...callbacks}
    />,
  );

  return callbacks;
}

test("renders the migrated empty state", () => {
  renderSavedRoomList([]);

  expect(screen.getByText("暂无常用直播间")).toBeVisible();
  expect(screen.getByText("输入房间号后可保存到这里。")).toBeVisible();
});

test("selects without connecting and keeps connect, edit, and delete callbacks", async () => {
  const user = userEvent.setup();
  const callbacks = renderSavedRoomList([ROOM]);

  expect(screen.getByText("深夜电台").closest(".rounded-lg")).toHaveClass(
    "drift-theme-transition",
    "bg-[var(--drift-ui-surface)]",
  );

  await user.click(
    screen.getByRole("switch", { name: "加入多房间 深夜电台" }),
  );
  await user.click(screen.getByRole("button", { name: "连接房间 123456" }));
  await user.click(screen.getByRole("button", { name: "修改" }));
  await user.click(screen.getByRole("button", { name: "删除" }));

  expect(callbacks.onRoomSelected).toHaveBeenCalledWith("room-1", true);
  expect(callbacks.onConnectRoom).toHaveBeenCalledWith(ROOM);
  expect(callbacks.onStartEditRoom).toHaveBeenCalledWith(ROOM);
  expect(callbacks.onDeleteRoom).toHaveBeenCalledWith("room-1");
});

test("shows matching session state and the appropriate row action", async () => {
  const user = userEvent.setup();
  const connected: RoomSessionSnapshot = {
    sessionId: "s-1",
    requestedRoomId: 123456,
    roomId: 123456,
    status: "connected",
    message: "已连接",
  };
  const callbacks = renderSavedRoomList([ROOM], null, [connected]);

  expect(screen.getByText("已连接")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "连接房间 123456" }),
  ).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "断开房间 123456" }),
  );

  expect(callbacks.onDisconnectSession).toHaveBeenCalledWith("s-1");
});

test("keeps edited room fields and save or cancel actions", async () => {
  const user = userEvent.setup();
  const editingSavedRoom: EditingSavedRoom = {
    displayName: "深夜电台",
    groupId: "chat",
    id: "room-1",
    roomId: "123456",
  };
  const callbacks = renderSavedRoomList([ROOM], editingSavedRoom);

  fireEvent.change(screen.getByRole("textbox", { name: "直播间名称" }), {
    target: { value: "午夜电台" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "房间号" }), {
    target: { value: "654321" },
  });
  await user.click(screen.getByRole("button", { name: "保存" }));
  await user.click(screen.getByRole("button", { name: "取消" }));

  expect(callbacks.onEditRoomChange).toHaveBeenCalledWith({
    ...editingSavedRoom,
    displayName: "午夜电台",
  });
  expect(callbacks.onEditRoomChange).toHaveBeenCalledWith({
    ...editingSavedRoom,
    roomId: "654321",
  });
  expect(callbacks.onSaveEditedRoom).toHaveBeenCalledOnce();
  expect(callbacks.onStopEditRoom).toHaveBeenCalledOnce();
});
