import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EMPTY_DANMAKU_RECORDING_STATUS,
  type DanmakuRecordingStatus,
} from "../../types/recording";

export function useDanmakuRecordingStatus() {
  const [status, setStatus] = useState<DanmakuRecordingStatus>(
    EMPTY_DANMAKU_RECORDING_STATUS,
  );
  const [commandError, setCommandError] = useState("");

  useEffect(() => {
    let disposed = false;
    let receivedEvent = false;
    let unlisten: (() => void) | null = null;

    void invoke<DanmakuRecordingStatus>("get_danmaku_recording_status")
      .then((snapshot) => {
        if (!disposed && !receivedEvent) setStatus(snapshot);
      })
      .catch(() => undefined);

    void listen<DanmakuRecordingStatus>("danmaku-recording-status", (event) => {
      receivedEvent = true;
      if (!disposed) setStatus(event.payload);
    })
      .then((disposeListener) => {
        if (disposed) {
          disposeListener();
        } else {
          unlisten = disposeListener;
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function runCommand(command: string, payload?: Record<string, unknown>) {
    setCommandError("");
    try {
      await invoke(command, payload);
    } catch (error) {
      setCommandError(String(error));
    }
  }

  return {
    commandError,
    openDirectory: () => runCommand("open_danmaku_record_dir"),
    retry: () => runCommand("retry_danmaku_recording"),
    setEnabled: (enabled: boolean) =>
      runCommand("set_danmaku_recording_enabled", { enabled }),
    status,
  };
}
