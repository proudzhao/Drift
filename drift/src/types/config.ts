export type AppConfig = {
  roomId: string;
  savedRooms: SavedRoom[];
  appearance: AppearanceConfig;
  filter: FilterConfig;
  shortcuts: ShortcutConfig;
  mockPanelEnabled: boolean;
};

export type SavedRoom = {
  id: string;
  roomId: string;
  displayName: string;
  anchorName?: string;
  updatedAt: string;
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
};

export type ShortcutConfig = {
  toggleEditMode: string;
  toggleOverlayWindow: string;
};

export function defaultShortcutLabel() {
  return navigator.platform.toLowerCase().includes("mac")
    ? "Command+Option+K"
    : "Control+Alt+K";
}

export function defaultOverlayShortcutLabel() {
  return navigator.platform.toLowerCase().includes("mac")
    ? "Command+Option+J"
    : "Control+Alt+J";
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  roomId: "",
  savedRooms: [],
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
  },
  shortcuts: {
    toggleEditMode: defaultShortcutLabel(),
    toggleOverlayWindow: defaultOverlayShortcutLabel(),
  },
  mockPanelEnabled: false,
};

export function mergeAppConfig(config: AppConfig): AppConfig {
  const toggleEditMode =
    config.shortcuts?.toggleEditMode === "Command+Option+D" ||
    config.shortcuts?.toggleEditMode === "Control+Alt+D"
      ? defaultShortcutLabel()
      : config.shortcuts?.toggleEditMode;

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
    savedRooms: Array.isArray(config.savedRooms) ? config.savedRooms : [],
    shortcuts: {
      ...DEFAULT_APP_CONFIG.shortcuts,
      ...config.shortcuts,
      toggleEditMode: toggleEditMode ?? DEFAULT_APP_CONFIG.shortcuts.toggleEditMode,
      toggleOverlayWindow:
        config.shortcuts?.toggleOverlayWindow ??
        DEFAULT_APP_CONFIG.shortcuts.toggleOverlayWindow,
    },
  };
}
