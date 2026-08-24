import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  EMPTY_VERTICAL_FLOW_STATUS,
  type VerticalFlowStatus,
} from "../../types/verticalFlow";

function isNonnegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function parseVerticalFlowStatus(payload: unknown): VerticalFlowStatus | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const status = payload as Record<string, unknown>;
  if (
    typeof status.active !== "boolean" ||
    (status.policy !== "realtime" && status.policy !== "complete") ||
    !isNonnegativeInteger(status.backlog) ||
    (status.speedMultiplier !== 1 &&
      status.speedMultiplier !== 2 &&
      status.speedMultiplier !== 4 &&
      status.speedMultiplier !== 8) ||
    !isNonnegativeInteger(status.droppedTotal)
  ) {
    return null;
  }

  return {
    active: status.active,
    policy: status.policy,
    backlog: status.backlog,
    speedMultiplier: status.speedMultiplier,
    droppedTotal: status.droppedTotal,
  };
}

export function useVerticalFlowStatus() {
  const [status, setStatus] = useState<VerticalFlowStatus>(
    EMPTY_VERTICAL_FLOW_STATUS,
  );

  useEffect(() => {
    let disposed = false;
    let disposeListener: (() => void) | undefined;

    void (async () => {
      try {
        const dispose = await listen<unknown>(
          "vertical-flow-status",
          (event) => {
            if (disposed) {
              return;
            }

            const nextStatus = parseVerticalFlowStatus(event.payload);
            if (nextStatus) {
              setStatus(nextStatus);
            }
          },
        );
        if (disposed) {
          dispose();
          return;
        }

        disposeListener = dispose;
        await emit("vertical-flow-status-request");
      } catch {
        if (!disposed) {
          console.warn("Failed to synchronize vertical flow status.");
        }
      }
    })();

    return () => {
      disposed = true;
      disposeListener?.();
    };
  }, []);

  return status;
}
