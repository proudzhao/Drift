import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EMPTY_FILTER_RUNTIME_STATUS,
  type FilterRuntimeStatus,
} from "../../types/filterRuntime";

export function useFilterRuntimeStatus() {
  const [status, setStatus] = useState<FilterRuntimeStatus>(
    EMPTY_FILTER_RUNTIME_STATUS,
  );

  useEffect(() => {
    let disposed = false;
    let receivedEvent = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        const disposeListener = await listen<FilterRuntimeStatus>(
          "filter-runtime-status",
          (event) => {
            receivedEvent = true;
            if (!disposed) setStatus(event.payload);
          },
        );
        if (disposed) {
          disposeListener();
          return;
        }
        unlisten = disposeListener;
      } catch {
        if (disposed) return;
      }

      try {
        const snapshot = await invoke<FilterRuntimeStatus>(
          "get_filter_runtime_status",
        );
        if (!disposed && !receivedEvent) setStatus(snapshot);
      } catch {
        // Keep the last event or the empty initial status.
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return status;
}
