import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const DEFAULT_RELEASE_URL = "https://github.com/proudzhao/Drift/releases/latest";

type AppVersion = {
  version: string;
};

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not_available"
  | "downloading"
  | "installing"
  | "installed"
  | "error";

export type AppUpdateState = {
  status: AppUpdateStatus;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  notes: string;
  downloadedBytes: number;
  totalBytes?: number;
  error: string;
  checkedAt?: number;
};

export const INITIAL_APP_UPDATE_STATE: AppUpdateState = {
  status: "idle",
  currentVersion: "",
  latestVersion: "",
  releaseUrl: DEFAULT_RELEASE_URL,
  notes: "",
  downloadedBytes: 0,
  error: "",
};

type UseAppUpdateOptions = {
  checkOnStartup?: boolean;
  fallbackReleaseUrl?: string;
};

export function useAppUpdate({
  checkOnStartup = false,
  fallbackReleaseUrl = DEFAULT_RELEASE_URL,
}: UseAppUpdateOptions = {}) {
  const pendingUpdateRef = useRef<Update | null>(null);
  const startupCheckStartedRef = useRef(false);
  const [state, setState] = useState<AppUpdateState>({
    ...INITIAL_APP_UPDATE_STATE,
    releaseUrl: fallbackReleaseUrl,
  });

  const closePendingUpdate = useCallback(async () => {
    const pendingUpdate = pendingUpdateRef.current;
    pendingUpdateRef.current = null;
    if (!pendingUpdate) return;

    try {
      await pendingUpdate.close();
    } catch {
      // The resource may already be consumed by the install path.
    }
  }, []);

  const loadCurrentVersion = useCallback(async () => {
    try {
      const result = await invoke<AppVersion>("get_app_version");
      setState((current) => ({
        ...current,
        currentVersion: result.version,
      }));
      return result.version;
    } catch {
      return "";
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    await closePendingUpdate();

    setState((current) => ({
      ...current,
      status: "checking",
      latestVersion: "",
      notes: "",
      downloadedBytes: 0,
      totalBytes: undefined,
      error: "",
      releaseUrl: fallbackReleaseUrl,
    }));

    try {
      const currentVersion = await loadCurrentVersion();
      const update = await check();
      const checkedAt = Date.now();

      if (!update) {
        setState((current) => ({
          ...current,
          status: "not_available",
          currentVersion: currentVersion || current.currentVersion,
          latestVersion: "",
          notes: "",
          downloadedBytes: 0,
          totalBytes: undefined,
          error: "",
          checkedAt,
          releaseUrl: fallbackReleaseUrl,
        }));
        return null;
      }

      pendingUpdateRef.current = update;
      setState((current) => ({
        ...current,
        status: "available",
        currentVersion: update.currentVersion || currentVersion,
        latestVersion: update.version,
        notes: update.body ?? "",
        downloadedBytes: 0,
        totalBytes: undefined,
        error: "",
        checkedAt,
        releaseUrl: fallbackReleaseUrl,
      }));
      return update;
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        downloadedBytes: 0,
        totalBytes: undefined,
        error: readableError(error),
        checkedAt: Date.now(),
        releaseUrl: fallbackReleaseUrl,
      }));
      return null;
    }
  }, [closePendingUpdate, fallbackReleaseUrl, loadCurrentVersion]);

  const handleDownloadEvent = useCallback((event: DownloadEvent) => {
    setState((current) => {
      if (event.event === "Started") {
        return {
          ...current,
          status: "downloading",
          downloadedBytes: 0,
          totalBytes: event.data.contentLength,
        };
      }

      if (event.event === "Progress") {
        return {
          ...current,
          status: "downloading",
          downloadedBytes: current.downloadedBytes + event.data.chunkLength,
        };
      }

      return {
        ...current,
        status: "installing",
      };
    });
  }, []);

  const installUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current;
    if (!update) {
      setState((current) => ({
        ...current,
        status: "error",
        error: "没有可安装的更新，请先检查更新。",
        releaseUrl: fallbackReleaseUrl,
      }));
      return;
    }

    if (isWindowsPlatform()) {
      const confirmed = window.confirm(
        "安装更新会关闭 Drift。请确认当前直播使用场景可以中断。",
      );
      if (!confirmed) {
        return;
      }
    }

    setState((current) => ({
      ...current,
      status: "downloading",
      downloadedBytes: 0,
      totalBytes: undefined,
      error: "",
      releaseUrl: fallbackReleaseUrl,
    }));

    try {
      await update.downloadAndInstall(handleDownloadEvent);
      pendingUpdateRef.current = null;
      setState((current) => ({
        ...current,
        status: "installed",
        downloadedBytes: current.totalBytes ?? current.downloadedBytes,
        error: "",
        releaseUrl: fallbackReleaseUrl,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: readableError(error),
        releaseUrl: fallbackReleaseUrl,
      }));
    }
  }, [fallbackReleaseUrl, handleDownloadEvent]);

  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: readableError(error),
        releaseUrl: fallbackReleaseUrl,
      }));
    }
  }, [fallbackReleaseUrl]);

  useEffect(() => {
    return () => {
      void closePendingUpdate();
    };
  }, [closePendingUpdate]);

  useEffect(() => {
    if (!checkOnStartup || startupCheckStartedRef.current) return;

    startupCheckStartedRef.current = true;
    void checkForUpdate();
  }, [checkForUpdate, checkOnStartup]);

  return {
    checkForUpdate,
    installUpdate,
    loadCurrentVersion,
    restartApp,
    state,
  };
}

function readableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isWindowsPlatform() {
  return /win/i.test(navigator.platform) || /windows/i.test(navigator.userAgent);
}
