import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  EMPTY_DANMAKU_RECORDING_STATUS,
  type DanmakuRecordingStatus,
} from "../../types/recording";
import { useDanmakuRecordingStatus } from "./useDanmakuRecordingStatus";

const eventMock = vi.hoisted(() => ({
  handler: undefined as
    | ((event: { payload: DanmakuRecordingStatus }) => void)
    | undefined,
  listenError: null as Error | null,
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (
      eventName: string,
      handler: (event: { payload: DanmakuRecordingStatus }) => void,
    ) => {
      expect(eventName).toBe("danmaku-recording-status");
      if (eventMock.listenError) throw eventMock.listenError;
      eventMock.handler = handler;
      return eventMock.unlisten;
    },
  ),
}));

afterEach(() => {
  clearMocks();
  eventMock.handler = undefined;
  eventMock.listenError = null;
  vi.clearAllMocks();
});

test("loads the mount snapshot and follows recording status events", async () => {
  const snapshot: DanmakuRecordingStatus = {
    enabled: true,
    state: "waiting",
    currentFileName: null,
    errorMessage: null,
  };
  mockIPC((command) => {
    expect(command).toBe("get_danmaku_recording_status");
    return snapshot;
  });

  const { result, unmount } = renderHook(() => useDanmakuRecordingStatus());
  await waitFor(() => expect(result.current.status).toEqual(snapshot));

  const eventStatus: DanmakuRecordingStatus = {
    enabled: true,
    state: "recording",
    currentFileName: "2026-08-23-6-示例主播.txt",
    errorMessage: null,
  };
  act(() => eventMock.handler?.({ payload: eventStatus }));
  expect(result.current.status).toEqual(eventStatus);

  unmount();
  await waitFor(() => expect(eventMock.unlisten).toHaveBeenCalledOnce());
});

test("keeps the empty status when snapshot and event listener fail", async () => {
  eventMock.listenError = new Error("event unavailable");
  mockIPC(() => {
    throw new Error("runtime unavailable");
  });

  const { result } = renderHook(() => useDanmakuRecordingStatus());

  await waitFor(() =>
    expect(result.current.status).toEqual(EMPTY_DANMAKU_RECORDING_STATUS),
  );
  expect(result.current.commandError).toBe("");
});

test("does not let a late mount snapshot overwrite a newer event", async () => {
  let resolveSnapshot:
    | ((status: DanmakuRecordingStatus) => void)
    | undefined;
  const snapshotPromise = new Promise<DanmakuRecordingStatus>((resolve) => {
    resolveSnapshot = resolve;
  });
  mockIPC((command) => {
    expect(command).toBe("get_danmaku_recording_status");
    return snapshotPromise;
  });

  const { result } = renderHook(() => useDanmakuRecordingStatus());
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  const eventStatus: DanmakuRecordingStatus = {
    enabled: true,
    state: "recording",
    currentFileName: "2026-08-23-6-示例主播.txt",
    errorMessage: null,
  };
  act(() => eventMock.handler?.({ payload: eventStatus }));

  await act(async () => {
    resolveSnapshot?.(EMPTY_DANMAKU_RECORDING_STATUS);
    await snapshotPromise;
  });
  expect(result.current.status).toEqual(eventStatus);
});

test("runs recording commands without optimistic status changes", async () => {
  const commands: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    commands.push({ command, payload });
    if (command === "get_danmaku_recording_status") {
      return EMPTY_DANMAKU_RECORDING_STATUS;
    }
    if (command === "set_danmaku_recording_enabled") {
      throw new Error("config write failed");
    }
    return null;
  });
  const { result } = renderHook(() => useDanmakuRecordingStatus());
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(result.current.status).toEqual(EMPTY_DANMAKU_RECORDING_STATUS);
  expect(result.current.commandError).toContain("config write failed");

  await act(async () => {
    await result.current.retry();
    await result.current.openDirectory();
  });
  expect(commands).toContainEqual({
    command: "set_danmaku_recording_enabled",
    payload: { enabled: true },
  });
  expect(commands).toContainEqual({
    command: "retry_danmaku_recording",
    payload: {},
  });
  expect(commands).toContainEqual({
    command: "open_danmaku_record_dir",
    payload: {},
  });
  expect(result.current.commandError).toBe("");
});
