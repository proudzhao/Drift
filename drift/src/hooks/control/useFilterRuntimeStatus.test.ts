import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  EMPTY_FILTER_RUNTIME_STATUS,
  type FilterRuntimeStatus,
} from "../../types/filterRuntime";
import { useFilterRuntimeStatus } from "./useFilterRuntimeStatus";

const eventMock = vi.hoisted(() => ({
  handler: undefined as
    | ((event: { payload: FilterRuntimeStatus }) => void)
    | undefined,
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (
      eventName: string,
      handler: (event: { payload: FilterRuntimeStatus }) => void,
    ) => {
      expect(eventName).toBe("filter-runtime-status");
      eventMock.handler = handler;
      return eventMock.unlisten;
    },
  ),
}));

afterEach(() => {
  clearMocks();
  eventMock.handler = undefined;
  vi.clearAllMocks();
});

test("loads the mount snapshot and follows runtime status events", async () => {
  const snapshot: FilterRuntimeStatus = {
    roomId: 6,
    pausedFanMedalRuleIds: [],
    pauseReason: null,
  };
  mockIPC((command) => {
    expect(command).toBe("get_filter_runtime_status");
    return snapshot;
  });

  const { result, unmount } = renderHook(() => useFilterRuntimeStatus());
  await waitFor(() => expect(result.current).toEqual(snapshot));

  const eventStatus: FilterRuntimeStatus = {
    ...snapshot,
    pausedFanMedalRuleIds: ["fan-only"],
    pauseReason: "fan_medal_protocol_unknown",
  };
  act(() => eventMock.handler?.({ payload: eventStatus }));
  expect(result.current).toEqual(eventStatus);

  unmount();
  await waitFor(() => expect(eventMock.unlisten).toHaveBeenCalledOnce());
});

test("keeps the empty status when the initial lookup fails", async () => {
  mockIPC(() => {
    throw new Error("runtime unavailable");
  });

  const { result } = renderHook(() => useFilterRuntimeStatus());
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));
  expect(result.current).toEqual(EMPTY_FILTER_RUNTIME_STATUS);
});

test("does not let a late mount snapshot overwrite a newer event", async () => {
  let resolveSnapshot: ((status: FilterRuntimeStatus) => void) | undefined;
  const snapshotPromise = new Promise<FilterRuntimeStatus>((resolve) => {
    resolveSnapshot = resolve;
  });
  mockIPC((command) => {
    expect(command).toBe("get_filter_runtime_status");
    return snapshotPromise;
  });

  const { result } = renderHook(() => useFilterRuntimeStatus());
  await waitFor(() => expect(eventMock.handler).toBeTypeOf("function"));

  const eventStatus: FilterRuntimeStatus = {
    roomId: 6,
    pausedFanMedalRuleIds: ["fan-only"],
    pauseReason: "fan_medal_protocol_unknown",
  };
  act(() => eventMock.handler?.({ payload: eventStatus }));
  expect(result.current).toEqual(eventStatus);

  await act(async () => {
    resolveSnapshot?.({
      roomId: null,
      pausedFanMedalRuleIds: [],
      pauseReason: null,
    });
    await snapshotPromise;
  });
  expect(result.current).toEqual(eventStatus);
});
