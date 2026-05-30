import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  CachedUpdateResult,
  CheckUpdateResult,
} from "../../components/control/AboutSettings";

export function useUpdateNotice() {
  const [cachedUpdate, setCachedUpdate] =
    useState<CachedUpdateResult | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<
    string | null
  >(null);
  const updateNotice = cachedUpdate?.result?.hasUpdate
    ? cachedUpdate.result
    : null;
  const shouldShowUpdateNotice =
    updateNotice !== null &&
    updateNotice.latestVersion !== dismissedUpdateVersion;

  useEffect(() => {
    invoke<CachedUpdateResult>("get_cached_update_result")
      .then(setCachedUpdate)
      .catch(() => setCachedUpdate(null));

    const unlistenUpdate = listen<CheckUpdateResult>(
      "update-available",
      (event) => {
        setCachedUpdate({
          result: event.payload,
          checkedAt: Math.floor(Date.now() / 1000),
          isChecking: false,
        });
      },
    );

    return () => {
      void unlistenUpdate.then((unlisten) => unlisten());
    };
  }, []);

  return {
    cachedUpdate,
    setDismissedUpdateVersion,
    shouldShowUpdateNotice,
    updateNotice,
  };
}
