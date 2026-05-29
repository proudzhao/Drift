export type AppConfig = {
  roomId: string;
  savedRooms: SavedRoom[];
  auth: AuthConfig;
  update: UpdateConfig;
  appearance: AppearanceConfig;
  messageDisplay: MessageDisplayConfig;
  filter: FilterConfig;
  shortcuts: ShortcutConfig;
  mockPanelEnabled: boolean;
};

export type AuthConfig = {
  enabled: boolean;
  lastLoginUid?: number;
  lastLoginName?: string;
  lastValidatedAt?: number;
};

export type UpdateConfig = {
  checkOnStartup: boolean;
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

export type MessageDisplayConfig = {
  showDanmaku: boolean;
  showGift: boolean;
  showGuard: boolean;
};

export type FilterConfig = {
  blockedWords: string[];
  rules: FilterRule[];
};

export type FilterTarget =
  | "text"
  | "user"
  | "messageType"
  | "giftName"
  | "guardLevel";

export type FilterOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "regex";

export type FilterAction = "hide" | "highlight";

export type FilterRule = {
  id: string;
  enabled: boolean;
  name: string;
  target: FilterTarget;
  operator: FilterOperator;
  value: string;
  action: FilterAction;
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
  auth: {
    enabled: false,
  },
  update: {
    checkOnStartup: true,
  },
  appearance: {
    fontSize: 20,
    opacity: 0.94,
    scrollDuration: 12,
    density: "medium",
    showUsername: false,
    color: "white",
  },
  messageDisplay: {
    showDanmaku: true,
    showGift: true,
    showGuard: true,
  },
  filter: {
    blockedWords: [],
    rules: [],
  },
  shortcuts: {
    toggleEditMode: defaultShortcutLabel(),
    toggleOverlayWindow: defaultOverlayShortcutLabel(),
  },
  mockPanelEnabled: false,
};

export function mergeAppConfig(config: Partial<AppConfig>): AppConfig {
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
    messageDisplay: {
      ...DEFAULT_APP_CONFIG.messageDisplay,
      ...config.messageDisplay,
    },
    auth: {
      ...DEFAULT_APP_CONFIG.auth,
      ...config.auth,
    },
    update: {
      ...DEFAULT_APP_CONFIG.update,
      ...config.update,
    },
    filter: {
      ...DEFAULT_APP_CONFIG.filter,
      ...config.filter,
      blockedWords: Array.isArray(config.filter?.blockedWords)
        ? config.filter.blockedWords
        : [],
      rules: Array.isArray(config.filter?.rules) ? config.filter.rules : [],
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
