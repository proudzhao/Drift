import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  ALL_SAVED_ROOM_GROUP_ID,
  DEFAULT_APP_CONFIG,
} from "../../types/config";
import type { RoomSessionSnapshot } from "../../types/roomSession";
import {
  EMPTY_DANMAKU_RECORDING_STATUS,
  type DanmakuRecordingStatus,
} from "../../types/recording";
import { RoomSettings } from "./RoomSettings";

afterEach(clearMocks);

function renderRoomSettings({
  recordingStatus = EMPTY_DANMAKU_RECORDING_STATUS,
  sessions = [],
  temporarySessions = [],
}: {
  recordingStatus?: DanmakuRecordingStatus;
  sessions?: RoomSessionSnapshot[];
  temporarySessions?: RoomSessionSnapshot[];
} = {}) {
  const callbacks = {
    onConnectDraftRoom: vi.fn(),
    onConnectSavedRoom: vi.fn(),
    onConnectSelectedRooms: vi.fn(),
    onCreateGroup: vi.fn(async () => true),
    onDeleteGroup: vi.fn(async () => true),
    onDeleteRoom: vi.fn(),
    onDisconnectAllRooms: vi.fn(),
    onDisconnectSession: vi.fn(),
    onEditRoomChange: vi.fn(),
    onGroupChange: vi.fn(),
    onOpenRecordingDir: vi.fn(),
    onRecordingEnabledChange: vi.fn(),
    onRenameGroup: vi.fn(async () => true),
    onRetryRecording: vi.fn(),
    onRetrySession: vi.fn(),
    onRoomIdChange: vi.fn(),
    onRoomSelected: vi.fn(),
    onSaveCurrentRoom: vi.fn(),
    onSaveEditedRoom: vi.fn(),
    onSaveTemporaryRoom: vi.fn(),
    onSearchQueryChange: vi.fn(),
    onStartEditRoom: vi.fn(),
    onStopEditRoom: vi.fn(),
  };

  const view = render(
    <RoomSettings
      commandErrors={{}}
      config={DEFAULT_APP_CONFIG}
      draftRoomId="123456"
      editingSavedRoom={null}
      filteredSavedRooms={[]}
      recordingCommandError=""
      recordingStatus={recordingStatus}
      savedRoomError=""
      savedRoomSearchQuery=""
      selectedGroupId={ALL_SAVED_ROOM_GROUP_ID}
      selectedSavedRoomIds={new Set(["room-1"])}
      selectionError=""
      sessions={sessions}
      snapshotError=""
      temporarySessions={temporarySessions}
      {...callbacks}
    />,
  );

  return { ...view, ...callbacks };
}

test("keeps the help command and always-available temporary connection", async () => {
  const commands: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    commands.push({ command, payload });
    return null;
  });
  const user = userEvent.setup();
  const { onConnectDraftRoom } = renderRoomSettings({
    sessions: [
      {
        sessionId: "s-1",
        requestedRoomId: 6,
        roomId: 6,
        status: "connected",
        message: "已连接",
      },
    ],
  });

  expect(screen.getByPlaceholderText("输入房间号")).toBeEnabled();
  expect(
    screen.queryByText("输入房间只连接本次运行，不自动保存或加入已选集合"),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "如何获取房间号" }));
  await user.click(screen.getByRole("button", { name: "连接" }));

  expect(commands).toContainEqual({ command: "open_help_window", payload: {} });
  expect(onConnectDraftRoom).toHaveBeenCalledOnce();
});

test("provides explicit selected and all-room actions with a status summary", async () => {
  const user = userEvent.setup();
  const { onConnectSelectedRooms, onDisconnectAllRooms } = renderRoomSettings({
    sessions: [
      {
        sessionId: "s-1",
        requestedRoomId: 6,
        roomId: 6,
        status: "connected",
        message: "已连接",
      },
      {
        sessionId: "s-2",
        requestedRoomId: 7,
        status: "not_live",
        message: "未开播",
      },
    ],
  });

  expect(screen.getByText("已连接 1 · 未开播 1")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "连接已选房间" }));
  await user.click(screen.getByRole("button", { name: "全部断开" }));
  expect(onConnectSelectedRooms).toHaveBeenCalledOnce();
  expect(onDisconnectAllRooms).toHaveBeenCalledOnce();
});

test("renders temporary sessions only when present", () => {
  const temporary: RoomSessionSnapshot = {
    sessionId: "temp-9",
    requestedRoomId: 9,
    roomId: 9,
    status: "connected",
    message: "已连接",
  };
  const { unmount } = renderRoomSettings();
  expect(screen.queryByRole("region", { name: "临时连接" })).toBeNull();
  unmount();

  renderRoomSettings({ sessions: [temporary], temporarySessions: [temporary] });
  expect(screen.getByRole("region", { name: "临时连接" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "保存房间 9 为常用" }),
  ).toBeVisible();
});

test("renders disabled recording controls and delegates toggle and directory actions", async () => {
  const user = userEvent.setup();
  const { onOpenRecordingDir, onRecordingEnabledChange } = renderRoomSettings();

  expect(screen.getByText("关闭")).toBeVisible();
  await user.click(screen.getByRole("switch", { name: "记录弹幕" }));
  await user.click(screen.getByRole("button", { name: "打开记录目录" }));

  expect(onRecordingEnabledChange).toHaveBeenCalledWith(true);
  expect(onOpenRecordingDir).toHaveBeenCalledOnce();
});

test("renders waiting and zero, single, or multiple recording file details", () => {
  const { unmount } = renderRoomSettings({
    recordingStatus: {
      enabled: true,
      state: "waiting",
      activeFiles: [],
      errorMessage: null,
    },
  });
  expect(screen.getByText("等待连接")).toBeVisible();
  unmount();

  const single = renderRoomSettings({
    recordingStatus: {
      enabled: true,
      state: "recording",
      activeFiles: [{ roomId: 6, fileName: "2026-08-27-6-主播甲.txt" }],
      errorMessage: null,
    },
  });
  expect(screen.getByText("记录中")).toBeVisible();
  expect(screen.getByText("2026-08-27-6-主播甲.txt")).toBeVisible();
  single.unmount();

  renderRoomSettings({
    recordingStatus: {
      enabled: true,
      state: "recording",
      activeFiles: [
        { roomId: 6, fileName: "2026-08-27-6-主播甲.txt" },
        { roomId: 7, fileName: "2026-08-27-7-主播乙.txt" },
      ],
      errorMessage: null,
    },
  });
  expect(screen.getByText("记录中 · 2 个房间")).toBeVisible();
  expect(screen.getByText("2026-08-27-6-主播甲.txt")).toBeVisible();
  expect(screen.getByText("2026-08-27-7-主播乙.txt")).toBeVisible();
});

test("renders paused recording recovery without implying backfill", async () => {
  const user = userEvent.setup();
  const { onRetryRecording } = renderRoomSettings({
    recordingStatus: {
      enabled: true,
      state: "error",
      activeFiles: [],
      errorMessage: "记录目录无访问权限，记录已暂停",
    },
  });

  expect(screen.getAllByText("记录已暂停")).toHaveLength(2);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "暂停期间的消息不会补写",
  );
  await user.click(screen.getByRole("button", { name: "重试记录" }));
  expect(onRetryRecording).toHaveBeenCalledOnce();
});
