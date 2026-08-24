export type AppConfig = {
  roomId: string;
  savedRoomGroups: SavedRoomGroup[];
  savedRooms: SavedRoom[];
  auth: AuthConfig;
  update: UpdateConfig;
  recording: RecordingConfig;
  appearance: AppearanceConfig;
  messageDisplay: MessageDisplayConfig;
  filter: FilterConfig;
  shortcuts: ShortcutConfig;
  mockPanelEnabled: boolean;
};

export const UNGROUPED_SAVED_ROOM_GROUP_ID = "uncategorized";
export const ALL_SAVED_ROOM_GROUP_ID = "__all__";

export type SavedRoomGroup = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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

export type RecordingConfig = {
  enabled: boolean;
};

export type SavedRoom = {
  id: string;
  roomId: string;
  displayName: string;
  anchorName?: string;
  groupId: string;
  updatedAt: string;
};

export type AppearanceConfig = {
  fontSize: number;
  fontFamily: string;
  theme: UiTheme;
  opacity: number;
  scrollDuration: number;
  density: "low" | "medium" | "high";
  showUsername: boolean;
  color: "white";
  messageFlow: MessageFlow;
  verticalOverflowPolicy: VerticalOverflowPolicy;
};

export type UiTheme = "dark" | "light";
export type MessageFlow = "horizontal" | "vertical";
export type VerticalOverflowPolicy = "realtime" | "complete";

export type MessageDisplayConfig = {
  showDanmaku: boolean;
  showEmotes: boolean;
  showGift: boolean;
  showGuard: boolean;
  showSuperChat: boolean;
};

export type FilterConfig = {
  blockedWords: string[];
  rules: FilterRule[];
};

export type FilterTarget =
  | "text"
  | "user"
  | "senderUid"
  | "currentRoomFanMedal";

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
  openSendDanmaku: string;
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

export function defaultSendDanmakuShortcutLabel() {
  return navigator.platform.toLowerCase().includes("mac")
    ? "Command+Option+Enter"
    : "Control+Alt+Enter";
}

export function createDefaultSavedRoomGroups(
  now = new Date().toISOString(),
): SavedRoomGroup[] {
  return [
    { id: "vtuber", name: "VTuber", createdAt: now, updatedAt: now },
    { id: "game", name: "游戏", createdAt: now, updatedAt: now },
    { id: "chat", name: "聊天", createdAt: now, updatedAt: now },
    { id: "event", name: "赛事", createdAt: now, updatedAt: now },
  ];
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  roomId: "",
  savedRoomGroups: createDefaultSavedRoomGroups(),
  savedRooms: [],
  auth: {
    enabled: false,
  },
  update: {
    checkOnStartup: true,
  },
  recording: {
    enabled: false,
  },
  appearance: {
    fontSize: 20,
    fontFamily: "system",
    theme: "dark",
    opacity: 0.94,
    scrollDuration: 12,
    density: "high",
    showUsername: false,
    color: "white",
    messageFlow: "horizontal",
    verticalOverflowPolicy: "realtime",
  },
  messageDisplay: {
    showDanmaku: true,
    showEmotes: true,
    showGift: true,
    showGuard: true,
    showSuperChat: true,
  },
  filter: {
    blockedWords: [],
    rules: [],
  },
  shortcuts: {
    toggleEditMode: defaultShortcutLabel(),
    toggleOverlayWindow: defaultOverlayShortcutLabel(),
    openSendDanmaku: defaultSendDanmakuShortcutLabel(),
  },
  mockPanelEnabled: false,
};

export function mergeAppConfig(config: Partial<AppConfig>): AppConfig {
  const savedRoomGroups = normalizeSavedRoomGroups(config.savedRoomGroups);
  const savedRooms = normalizeSavedRooms(config.savedRooms, savedRoomGroups);
  const roomId =
    typeof config.roomId === "string"
      ? config.roomId
      : DEFAULT_APP_CONFIG.roomId;
  const mockPanelEnabled =
    typeof config.mockPanelEnabled === "boolean"
      ? config.mockPanelEnabled
      : DEFAULT_APP_CONFIG.mockPanelEnabled;

  const toggleEditMode =
    config.shortcuts?.toggleEditMode === "Command+Option+D" ||
    config.shortcuts?.toggleEditMode === "Control+Alt+D"
      ? defaultShortcutLabel()
      : config.shortcuts?.toggleEditMode;

  return {
    roomId,
    appearance: {
      ...DEFAULT_APP_CONFIG.appearance,
      ...config.appearance,
      theme:
        config.appearance?.theme === "light"
          ? "light"
          : DEFAULT_APP_CONFIG.appearance.theme,
      messageFlow:
        config.appearance?.messageFlow === "vertical"
          ? "vertical"
          : DEFAULT_APP_CONFIG.appearance.messageFlow,
      verticalOverflowPolicy:
        config.appearance?.verticalOverflowPolicy === "complete"
          ? "complete"
          : DEFAULT_APP_CONFIG.appearance.verticalOverflowPolicy,
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
    recording: {
      ...DEFAULT_APP_CONFIG.recording,
      ...config.recording,
    },
    filter: {
      ...DEFAULT_APP_CONFIG.filter,
      ...config.filter,
      blockedWords: Array.isArray(config.filter?.blockedWords)
        ? config.filter.blockedWords
        : [],
      rules: Array.isArray(config.filter?.rules) ? config.filter.rules : [],
    },
    savedRoomGroups,
    savedRooms,
    shortcuts: {
      ...DEFAULT_APP_CONFIG.shortcuts,
      ...config.shortcuts,
      toggleEditMode: toggleEditMode ?? DEFAULT_APP_CONFIG.shortcuts.toggleEditMode,
      toggleOverlayWindow:
        config.shortcuts?.toggleOverlayWindow ??
        DEFAULT_APP_CONFIG.shortcuts.toggleOverlayWindow,
      openSendDanmaku:
        config.shortcuts?.openSendDanmaku ??
        DEFAULT_APP_CONFIG.shortcuts.openSendDanmaku,
    },
    mockPanelEnabled,
  };
}

function normalizeSavedRoomGroups(
  savedRoomGroups: Partial<SavedRoomGroup>[] | undefined,
): SavedRoomGroup[] {
  if (!Array.isArray(savedRoomGroups) || savedRoomGroups.length === 0) {
    return createDefaultSavedRoomGroups();
  }

  const now = new Date().toISOString();
  const normalizedGroups = savedRoomGroups
    .map((group) => ({
      id: typeof group.id === "string" ? group.id.trim() : "",
      name: typeof group.name === "string" ? group.name.trim() : "",
      createdAt:
        typeof group.createdAt === "string" && group.createdAt
          ? group.createdAt
          : now,
      updatedAt:
        typeof group.updatedAt === "string" && group.updatedAt
          ? group.updatedAt
          : now,
    }))
    .filter(
      (group) =>
        group.id && group.name && group.id !== UNGROUPED_SAVED_ROOM_GROUP_ID,
    );

  return normalizedGroups.length > 0
    ? normalizedGroups
    : createDefaultSavedRoomGroups(now);
}

function normalizeSavedRooms(
  savedRooms: Partial<SavedRoom>[] | undefined,
  savedRoomGroups: SavedRoomGroup[],
): SavedRoom[] {
  if (!Array.isArray(savedRooms)) {
    return [];
  }

  const validGroupIds = new Set(savedRoomGroups.map((group) => group.id));

  return savedRooms.map((room) => {
    const legacyGroup = (room as Partial<SavedRoom> & { group?: string }).group;
    const groupId = resolveSavedRoomGroupId(
      room.groupId,
      legacyGroup,
      validGroupIds,
    );

    return {
      id: typeof room.id === "string" ? room.id : "",
      roomId: typeof room.roomId === "string" ? room.roomId : "",
      displayName:
        typeof room.displayName === "string" ? room.displayName : "",
      anchorName:
        typeof room.anchorName === "string" ? room.anchorName : undefined,
      groupId,
      updatedAt: typeof room.updatedAt === "string" ? room.updatedAt : "",
    };
  });
}

function resolveSavedRoomGroupId(
  groupId: string | undefined,
  legacyGroup: string | undefined,
  validGroupIds: Set<string>,
) {
  if (groupId && validGroupIds.has(groupId)) {
    return groupId;
  }

  const migratedGroupId = mapLegacySavedRoomGroup(legacyGroup);
  if (migratedGroupId === UNGROUPED_SAVED_ROOM_GROUP_ID) {
    return UNGROUPED_SAVED_ROOM_GROUP_ID;
  }
  if (migratedGroupId && validGroupIds.has(migratedGroupId)) {
    return migratedGroupId;
  }

  return UNGROUPED_SAVED_ROOM_GROUP_ID;
}

function mapLegacySavedRoomGroup(group: string | undefined) {
  switch (group) {
    case "favorite":
      return UNGROUPED_SAVED_ROOM_GROUP_ID;
    case "event":
      return "event";
    case "study":
      return "chat";
    case "entertainment":
      return "game";
    default:
      return undefined;
  }
}
