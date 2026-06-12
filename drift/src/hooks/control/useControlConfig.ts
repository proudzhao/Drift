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

export function useControlConfig({
  config,
  onConfigChange,
}: UseControlConfigParams) {
  async function saveConfig(nextConfig: AppConfig) {
    const savedConfig = await invoke<AppConfig>("save_app_config", {
      config: nextConfig,
    });
    onConfigChange(savedConfig);
  }

  async function updateAppearance(nextAppearance: Partial<AppearanceConfig>) {
    await saveConfig({
      ...config,
      appearance: {
        ...config.appearance,
        ...nextAppearance,
      },
    });
  }

  async function updateMessageDisplay(
    nextMessageDisplay: Partial<MessageDisplayConfig>,
  ) {
    await saveConfig({
      ...config,
      messageDisplay: {
        ...config.messageDisplay,
        ...nextMessageDisplay,
      },
    });
  }

  async function updateFilter(nextFilter: Partial<FilterConfig>) {
    await saveConfig({
      ...config,
      filter: {
        ...config.filter,
        ...nextFilter,
      },
    });
  }

  async function updateUpdateConfig(nextUpdate: Partial<AppConfig["update"]>) {
    await saveConfig({
      ...config,
      update: {
        ...config.update,
        ...nextUpdate,
      },
    });
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
