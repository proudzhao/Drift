import { useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  AppearanceConfig,
  FilterConfig,
  MessageDisplayConfig,
} from "../../types/config";

type UseControlConfigParams = {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
};

export type AppConfigUpdater = (current: AppConfig) => AppConfig;

export function useControlConfig({
  config,
  onConfigChange,
}: UseControlConfigParams) {
  const latestConfigRef = useRef(config);
  const onConfigChangeRef = useRef(onConfigChange);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useLayoutEffect(() => {
    latestConfigRef.current = config;
    onConfigChangeRef.current = onConfigChange;
  }, [config, onConfigChange]);

  function saveConfig(updater: AppConfigUpdater) {
    const operation = saveQueueRef.current.then(async () => {
      const nextConfig = updater(latestConfigRef.current);
      const savedConfig = await invoke<AppConfig>("save_app_config", {
        config: nextConfig,
      });
      latestConfigRef.current = savedConfig;
      onConfigChangeRef.current(savedConfig);
    });
    saveQueueRef.current = operation.catch(() => undefined);
    return operation;
  }

  async function updateAppearance(nextAppearance: Partial<AppearanceConfig>) {
    await saveConfig((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        ...nextAppearance,
      },
    }));
  }

  async function updateMessageDisplay(
    nextMessageDisplay: Partial<MessageDisplayConfig>,
  ) {
    await saveConfig((current) => ({
      ...current,
      messageDisplay: {
        ...current.messageDisplay,
        ...nextMessageDisplay,
      },
    }));
  }

  async function updateFilter(nextFilter: Partial<FilterConfig>) {
    await saveConfig((current) => ({
      ...current,
      filter: {
        ...current.filter,
        ...nextFilter,
      },
    }));
  }

  async function updateUpdateConfig(nextUpdate: Partial<AppConfig["update"]>) {
    await saveConfig((current) => ({
      ...current,
      update: {
        ...current.update,
        ...nextUpdate,
      },
    }));
  }

  async function saveFilterRules(rules: FilterConfig["rules"]) {
    await updateFilter({ rules });
  }

  async function resetAppearance() {
    await updateAppearance({
      fontSize: 20,
      fontFamily: "system",
      opacity: 0.94,
      scrollDuration: 12,
      density: "high",
      showUsername: false,
      color: "white",
      messageFlow: "horizontal",
      verticalOverflowPolicy: "realtime",
    });
  }

  return {
    resetAppearance,
    saveConfig,
    saveFilterRules,
    updateAppearance,
    updateMessageDisplay,
    updateUpdateConfig,
  };
}
