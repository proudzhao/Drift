import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  ALL_SAVED_ROOM_GROUP_ID,
  DEFAULT_APP_CONFIG,
} from "../../types/config";
import {
  EMPTY_DANMAKU_RECORDING_STATUS,
  type DanmakuRecordingStatus,
} from "../../types/recording";
import { RoomSettings } from "./RoomSettings";

afterEach(clearMocks);

function renderRoomSettings(
  isConnected = false,
  recordingStatus: DanmakuRecordingStatus =
    EMPTY_DANMAKU_RECORDING_STATUS,
) {
  const onConnect = vi.fn();
  const onDisconnect = vi.fn();
  const onOpenRecordingDir = vi.fn();
  const onRecordingEnabledChange = vi.fn();
  const onRetryRecording = vi.fn();

  const view = render(
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
      onOpenRecordingDir={onOpenRecordingDir}
      onRecordingEnabledChange={onRecordingEnabledChange}
      onRenameGroup={vi.fn(async () => true)}
      onRetryRecording={onRetryRecording}
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
      recordingCommandError=""
      recordingStatus={recordingStatus}
      status={{ status: "idle", message: "尚未连接直播间" }}
    />,
  );

  return {
    ...view,
    onConnect,
    onDisconnect,
    onOpenRecordingDir,
    onRecordingEnabledChange,
    onRetryRecording,
  };
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

test("renders disabled recording controls and delegates toggle and directory actions", async () => {
  const user = userEvent.setup();
  const { onOpenRecordingDir, onRecordingEnabledChange } =
    renderRoomSettings();

  expect(screen.getByText("关闭")).toBeVisible();
  await user.click(screen.getByRole("switch", { name: "记录弹幕" }));
  await user.click(screen.getByRole("button", { name: "打开记录目录" }));

  expect(onRecordingEnabledChange).toHaveBeenCalledWith(true);
  expect(onOpenRecordingDir).toHaveBeenCalledOnce();
});

test("renders waiting and recording status details", () => {
  const { unmount } = renderRoomSettings(false, {
    enabled: true,
    state: "waiting",
    currentFileName: null,
    errorMessage: null,
  });
  expect(screen.getByText("等待连接")).toBeVisible();
  unmount();

  renderRoomSettings(false, {
    enabled: true,
    state: "recording",
    currentFileName: "2026-08-23-22625025-示例主播.txt",
    errorMessage: null,
  });
  expect(screen.getByText("记录中")).toBeVisible();
  expect(
    screen.getByText("2026-08-23-22625025-示例主播.txt"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "打开记录目录" }),
  ).toBeVisible();
});

test("renders paused recording recovery without implying backfill", async () => {
  const user = userEvent.setup();
  const { onRetryRecording } = renderRoomSettings(false, {
    enabled: true,
    state: "error",
    currentFileName: null,
    errorMessage: "记录目录无访问权限，记录已暂停",
  });

  expect(screen.getAllByText("记录已暂停")).toHaveLength(2);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "暂停期间的消息不会补写",
  );
  await user.click(screen.getByRole("button", { name: "重试记录" }));
  expect(onRetryRecording).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "打开记录目录" }),
  ).toBeVisible();
});
