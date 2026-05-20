export type AppConfig = {
  roomId: string;
  appearance: AppearanceConfig;
  filter: FilterConfig;
  shortcuts: ShortcutConfig;
};

export type AppearanceConfig = {
  fontSize: number;
  opacity: number;
  scrollDuration: number;
  density: "low" | "medium" | "high";
  showUsername: boolean;
  color: "white";
};

export type FilterConfig = {
  blockedWords: string[];
  blockedUsers: string[];
};

export type ShortcutConfig = {
  toggleEditMode: string;
};

export function defaultShortcutLabel() {
  return navigator.platform.toLowerCase().includes("mac")
    ? "Command+Option+D"
    : "Control+Alt+D";
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  roomId: "",
  appearance: {
    fontSize: 20,
    opacity: 0.94,
    scrollDuration: 12,
    density: "medium",
    showUsername: false,
    color: "white",
  },
  filter: {
    blockedWords: [],
    blockedUsers: [],
  },
  shortcuts: {
    toggleEditMode: defaultShortcutLabel(),
  },
};

export function mergeAppConfig(config: AppConfig): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    ...config,
    appearance: {
      ...DEFAULT_APP_CONFIG.appearance,
      ...config.appearance,
    },
    filter: {
      ...DEFAULT_APP_CONFIG.filter,
      ...config.filter,
    },
    shortcuts: {
      ...DEFAULT_APP_CONFIG.shortcuts,
      ...config.shortcuts,
    },
  };
}
