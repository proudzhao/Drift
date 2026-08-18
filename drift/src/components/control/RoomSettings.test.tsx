import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  ALL_SAVED_ROOM_GROUP_ID,
  DEFAULT_APP_CONFIG,
} from "../../types/config";
import { RoomSettings } from "./RoomSettings";

afterEach(clearMocks);

function renderRoomSettings(isConnected = false) {
  const onConnect = vi.fn();
  const onDisconnect = vi.fn();

  render(
    <RoomSettings
      config={DEFAULT_APP_CONFIG}
      draftRoomId="123456"
      editingSavedRoom={null}
      filteredSavedRooms={[]}
      isConnected={isConnected}
      onCreateGroup={vi.fn(async () => true)}
      onConnect={onConnect}
      onDeleteGroup={vi.fn(async () => true)}
      onDeleteRoom={vi.fn()}
      onDisconnect={onDisconnect}
      onEditRoomChange={vi.fn()}
      onGroupChange={vi.fn()}
      onRenameGroup={vi.fn(async () => true)}
      onRoomIdChange={vi.fn()}
      onSaveCurrentRoom={vi.fn()}
      onSaveEditedRoom={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onSelectRoom={vi.fn()}
      onStartEditRoom={vi.fn()}
      onStopEditRoom={vi.fn()}
      savedRoomError=""
      savedRoomSearchQuery=""
      selectedGroupId={ALL_SAVED_ROOM_GROUP_ID}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  return { onConnect, onDisconnect };
}

test("keeps the help command and connection callbacks", async () => {
  const commands: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    commands.push({ command, payload });
    return null;
  });
  const user = userEvent.setup();
  const { onConnect } = renderRoomSettings();

  await user.click(screen.getByRole("button", { name: "如何获取房间号" }));
  await user.click(screen.getByRole("button", { name: "连接" }));

  expect(commands).toContainEqual({ command: "open_help_window", payload: {} });
  expect(onConnect).toHaveBeenCalledOnce();
  expect(screen.getByRole("region", { name: "连接" })).toBeVisible();
});

test("keeps the disconnect callback", async () => {
  const user = userEvent.setup();
  const { onDisconnect } = renderRoomSettings(true);

  await user.click(screen.getByRole("button", { name: "断开" }));

  expect(onDisconnect).toHaveBeenCalledOnce();
});

test("uses compact metadata only for the three connection rows", () => {
  renderRoomSettings();

  for (const description of [
    "尚未连接直播间",
    "当前直播间主播",
    "连接、重连或房间状态",
  ]) {
    expect(
      screen.getByText(description).closest("[data-description-layout]"),
    ).toHaveAttribute("data-description-layout", "inline");
  }
});
