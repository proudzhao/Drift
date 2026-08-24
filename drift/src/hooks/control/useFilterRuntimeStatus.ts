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

    void invoke<FilterRuntimeStatus>("get_filter_runtime_status")
      .then((snapshot) => {
        if (!disposed && !receivedEvent) setStatus(snapshot);
      })
      .catch(() => undefined);

    void listen<FilterRuntimeStatus>("filter-runtime-status", (event) => {
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

  return status;
}
