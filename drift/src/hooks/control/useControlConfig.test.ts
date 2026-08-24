import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../../types/config";
import { useControlConfig } from "./useControlConfig";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let reject: Deferred<T>["reject"] = () => undefined;
  let resolve: Deferred<T>["resolve"] = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
});

test("serializes rapid flow and density saves against the first success", async () => {
  const saves: AppConfig[] = [];
  const first = deferred<AppConfig>();
  const second = deferred<AppConfig>();
  mockIPC((command, payload) => {
    if (command !== "save_app_config") {
      throw new Error(`Unexpected command: ${command}`);
    }
    saves.push((payload as { config: AppConfig }).config);
    return saves.length === 1 ? first.promise : second.promise;
  });
  const onConfigChange = vi.fn();
  const { result } = renderHook(() =>
    useControlConfig({ config: DEFAULT_APP_CONFIG, onConfigChange }),
  );

  let flowSave: Promise<void> | undefined;
  let densitySave: Promise<void> | undefined;
  act(() => {
    flowSave = result.current.updateAppearance({ messageFlow: "vertical" });
    densitySave = result.current.updateAppearance({ density: "low" });
  });

  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0].appearance.messageFlow).toBe("vertical");
  first.resolve(saves[0]);
  await waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1].appearance).toMatchObject({
    density: "low",
    messageFlow: "vertical",
  });

  second.resolve(saves[1]);
  await act(async () => {
    await Promise.all([flowSave, densitySave]);
  });
  expect(onConfigChange).toHaveBeenNthCalledWith(1, saves[0]);
  expect(onConfigChange).toHaveBeenNthCalledWith(2, saves[1]);
});

test("merges a queued message-display save with a committed theme", async () => {
  const saves: AppConfig[] = [];
  const first = deferred<AppConfig>();
  const second = deferred<AppConfig>();
  mockIPC((command, payload) => {
    if (command !== "save_app_config") {
      throw new Error(`Unexpected command: ${command}`);
    }
    saves.push((payload as { config: AppConfig }).config);
    return saves.length === 1 ? first.promise : second.promise;
  });
  const { result } = renderHook(() =>
    useControlConfig({ config: DEFAULT_APP_CONFIG, onConfigChange: vi.fn() }),
  );

  let themeSave: Promise<void> | undefined;
  let displaySave: Promise<void> | undefined;
  act(() => {
    themeSave = result.current.updateAppearance({ theme: "light" });
    displaySave = result.current.updateMessageDisplay({ showGift: false });
  });

  await waitFor(() => expect(saves).toHaveLength(1));
  first.resolve(saves[0]);
  await waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1].appearance.theme).toBe("light");
  expect(saves[1].messageDisplay.showGift).toBe(false);

  second.resolve(saves[1]);
  await act(async () => {
    await Promise.all([themeSave, displaySave]);
  });
});

test("continues the queue after a rejected save without committing it", async () => {
  const saves: AppConfig[] = [];
  const first = deferred<AppConfig>();
  mockIPC((command, payload) => {
    if (command !== "save_app_config") {
      throw new Error(`Unexpected command: ${command}`);
    }
    const nextConfig = (payload as { config: AppConfig }).config;
    saves.push(nextConfig);
    return saves.length === 1 ? first.promise : nextConfig;
  });
  const onConfigChange = vi.fn();
  const { result } = renderHook(() =>
    useControlConfig({ config: DEFAULT_APP_CONFIG, onConfigChange }),
  );

  let failedSave: Promise<void> | undefined;
  let nextSave: Promise<void> | undefined;
  act(() => {
    failedSave = result.current.updateAppearance({ messageFlow: "vertical" });
    void failedSave.catch(() => undefined);
    nextSave = result.current.updateAppearance({ density: "medium" });
  });

  await waitFor(() => expect(saves).toHaveLength(1));
  first.reject(new Error("write failed"));
  await act(async () => {
    await expect(failedSave).rejects.toThrow("write failed");
  });
  await waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1].appearance).toMatchObject({
    density: "medium",
    messageFlow: "horizontal",
  });
  await act(async () => {
    await nextSave;
  });
  expect(onConfigChange).toHaveBeenCalledOnce();
  expect(onConfigChange).toHaveBeenCalledWith(saves[1]);
});
