import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { VerticalFlowStatus } from "../../types/verticalFlow";
import { EMPTY_VERTICAL_FLOW_STATUS } from "../../types/verticalFlow";
import { useVerticalFlowStatus } from "./useVerticalFlowStatus";

type StatusEvent = { payload: unknown };
type StatusHandler = (event: StatusEvent) => void;

const SAFE_STATUS: VerticalFlowStatus = {
  active: true,
  policy: "complete",
  backlog: 42,
  speedMultiplier: 4,
  droppedTotal: 3,
};

const INVALID_STATUS_PAYLOADS: Array<[string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  [
    "a missing field",
    {
      active: true,
      policy: "complete",
      backlog: 42,
      speedMultiplier: 4,
    },
  ],
  ["a non-boolean active flag", { ...SAFE_STATUS, active: "true" }],
  ["a bogus policy", { ...SAFE_STATUS, policy: "unlimited" }],
  ["a negative backlog", { ...SAFE_STATUS, backlog: -1 }],
  ["a NaN backlog", { ...SAFE_STATUS, backlog: Number.NaN }],
  ["an infinite backlog", { ...SAFE_STATUS, backlog: Number.POSITIVE_INFINITY }],
  ["a fractional backlog", { ...SAFE_STATUS, backlog: 1.5 }],
  ["a negative dropped total", { ...SAFE_STATUS, droppedTotal: -1 }],
  ["a NaN dropped total", { ...SAFE_STATUS, droppedTotal: Number.NaN }],
  [
    "an infinite dropped total",
    { ...SAFE_STATUS, droppedTotal: Number.POSITIVE_INFINITY },
  ],
  ["a fractional dropped total", { ...SAFE_STATUS, droppedTotal: 1.5 }],
  ["an unsupported multiplier", { ...SAFE_STATUS, speedMultiplier: 99 }],
];

const eventMock = vi.hoisted(() => ({
  emit: vi.fn<(...args: unknown[]) => Promise<void>>(),
  handlers: new Map<string, StatusHandler>(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: eventMock.emit,
  listen: eventMock.listen,
}));

beforeEach(() => {
  eventMock.emit.mockResolvedValue(undefined);
  eventMock.listen.mockImplementation(
    async (name: string, callback: StatusHandler) => {
      eventMock.handlers.set(name, callback);
      return vi.fn(() => {
        if (eventMock.handlers.get(name) === callback) {
          eventMock.handlers.delete(name);
        }
      });
    },
  );
});

afterEach(() => {
  vi.clearAllMocks();
  eventMock.handlers.clear();
});

async function emitStatus(payload: unknown) {
  await act(async () => {
    eventMock.handlers.get("vertical-flow-status")?.({ payload });
  });
}

test("listens before requesting a current snapshot", async () => {
  const calls: string[] = [];
  eventMock.listen.mockImplementation(
    async (name: string, callback: StatusHandler) => {
      calls.push(`listen:${name}`);
      eventMock.handlers.set(name, callback);
      return vi.fn();
    },
  );
  eventMock.emit.mockImplementation(async (name) => {
    calls.push(`emit:${name}`);
  });

  renderHook(() => useVerticalFlowStatus());

  await waitFor(() =>
    expect(calls).toEqual([
      "listen:vertical-flow-status",
      "emit:vertical-flow-status-request",
    ]),
  );
});

test("accepts only the safe status shape", async () => {
  const { result } = renderHook(() => useVerticalFlowStatus());
  await waitFor(() =>
    expect(eventMock.handlers.has("vertical-flow-status")).toBe(true),
  );

  await emitStatus({
    active: true,
    policy: "complete",
    backlog: 42,
    speedMultiplier: 4,
    droppedTotal: 3,
    roomId: 6,
    user: "private",
    uid: 7,
    text: "private",
  } as VerticalFlowStatus);

  expect(result.current).toEqual({
    active: true,
    policy: "complete",
    backlog: 42,
    speedMultiplier: 4,
    droppedTotal: 3,
  });
  expect(Object.keys(result.current).sort()).toEqual([
    "active",
    "backlog",
    "droppedTotal",
    "policy",
    "speedMultiplier",
  ]);
});

test.each(INVALID_STATUS_PAYLOADS)(
  "ignores %s and retains the previous safe snapshot",
  async (_label, payload) => {
    const { result } = renderHook(() => useVerticalFlowStatus());
    await waitFor(() =>
      expect(eventMock.handlers.has("vertical-flow-status")).toBe(true),
    );
    await emitStatus(SAFE_STATUS);

    await expect(emitStatus(payload)).resolves.toBeUndefined();

    expect(result.current).toEqual(SAFE_STATUS);
  },
);

test("accepts a valid snapshot after invalid updates", async () => {
  const { result } = renderHook(() => useVerticalFlowStatus());
  await waitFor(() =>
    expect(eventMock.handlers.has("vertical-flow-status")).toBe(true),
  );

  for (const [, payload] of INVALID_STATUS_PAYLOADS) {
    await emitStatus(payload);
    expect(result.current).toEqual(EMPTY_VERTICAL_FLOW_STATUS);
  }
  await emitStatus(SAFE_STATUS);

  expect(result.current).toEqual(SAFE_STATUS);
});

test("disposes a late listener without requesting or setting state", async () => {
  let resolveListen: ((dispose: () => void) => void) | undefined;
  const dispose = vi.fn();
  eventMock.listen.mockImplementation(
    () =>
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
  );

  const { unmount } = renderHook(() => useVerticalFlowStatus());
  unmount();
  await act(async () => {
    resolveListen?.(dispose);
  });

  await waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  expect(eventMock.emit).not.toHaveBeenCalled();
});

test("keeps the safe empty status when event setup fails", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  eventMock.listen.mockRejectedValueOnce(new Error("event unavailable"));

  const { result } = renderHook(() => useVerticalFlowStatus());

  await waitFor(() =>
    expect(warn).toHaveBeenCalledWith(
      "Failed to synchronize vertical flow status.",
    ),
  );
  expect(result.current).toEqual(EMPTY_VERTICAL_FLOW_STATUS);
  expect(eventMock.emit).not.toHaveBeenCalled();
  warn.mockRestore();
});
