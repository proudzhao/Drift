import type { AppUpdateState } from "../hooks/control/useAppUpdate";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../types/config";
import type { FilterRule } from "../types/config";
import type { DanmakuItem, VerticalChatItem } from "../types/danmaku";
import type { FilterRuntimeStatus } from "../types/filterRuntime";
import type { DanmakuRecordingStatus } from "../types/recording";
import type { RoomSessionSnapshot } from "../types/roomSession";
import type { VerticalFlowStatus } from "../types/verticalFlow";
import type { ApiTestStep } from "../components/control/DiagnosticsSettings";

export const PREVIEW_CONFIG: AppConfig = {
  ...DEFAULT_APP_CONFIG,
  update: { checkOnStartup: false },
  savedRooms: [
    {
      id: "preview-room-1",
      roomId: "123456",
      displayName: "深夜电台",
      anchorName: "示例主播",
      groupId: "chat",
      updatedAt: "2026-08-16T00:00:00.000Z",
    },
    {
      id: "preview-room-2",
      roomId: "654321",
      displayName: "游戏实况",
      anchorName: "另一位主播",
      groupId: "game",
      updatedAt: "2026-08-16T00:00:00.000Z",
    },
  ],
};

const PREVIEW_EMOTE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='11' fill='%23ffd166'/%3E%3Cpath d='M7 14c2.5 3 7.5 3 10 0' fill='none' stroke='%235c4317' stroke-width='1.5'/%3E%3Ccircle cx='8' cy='9' r='1.2' fill='%235c4317'/%3E%3Ccircle cx='16' cy='9' r='1.2' fill='%235c4317'/%3E%3C/svg%3E";

export const PREVIEW_VERTICAL_MIXED_ITEMS: VerticalChatItem[] = [
  {
    id: "vertical-mixed-default",
    kind: "danmaku",
    user: "defaultUser",
    text: "无本房粉丝牌的普通弹幕",
    createdAt: 1,
  },
  {
    id: "vertical-mixed-medal",
    kind: "danmaku",
    user: "medalUser",
    text: "本房 13 级粉丝牌弹幕",
    currentRoomFanMedalLevel: 13,
    createdAt: 2,
  },
  {
    id: "vertical-mixed-combined",
    kind: "danmaku",
    user: "followedUser",
    text: "普通弹幕 [微笑] 文本结尾",
    segments: [
      { type: "text", text: "普通弹幕 " },
      { type: "emote", text: "[微笑]", url: PREVIEW_EMOTE_DATA_URL },
      { type: "text", text: " 文本结尾" },
    ],
    currentRoomFanMedalLevel: 13,
    followedUser: true,
    highlighted: true,
    isSelf: true,
    createdAt: 3,
  },
  {
    id: "vertical-mixed-super-chat",
    kind: "super_chat",
    user: "followedUser",
    text: "感谢 Drift 的纵向模式",
    superChatColor: "#e2b52b",
    superChatPrice: 100,
    followedUser: true,
    createdAt: 4,
  },
  {
    id: "vertical-mixed-gift",
    kind: "gift",
    user: "giftUser",
    text: "giftUser 送出 小花 × 5",
    createdAt: 5,
  },
  {
    id: "vertical-mixed-guard",
    kind: "guard",
    user: "guardUser",
    text: "guardUser 开通 舰长",
    createdAt: 6,
  },
];

export const PREVIEW_VERTICAL_LONG_ITEMS: VerticalChatItem[] = [
  {
    id: "vertical-long-leading",
    kind: "danmaku",
    user: "firstUser",
    text: "长消息之前的 FIFO 消息",
    createdAt: 1,
  },
  {
    id: "vertical-long-complete",
    kind: "danmaku",
    user: "longMessageUser",
    text: "这是一条需要完整换行的中文消息 EnglishLongTokenWithoutSpaces https://example.com/very/long/path",
    createdAt: 2,
  },
];

export const PREVIEW_VERTICAL_BACKLOG_ITEMS: VerticalChatItem[] = Array.from(
  { length: 18 },
  (_, index) => ({
    id: `vertical-backlog-${index + 1}`,
    kind: index % 6 === 4 ? "gift" : "danmaku",
    user: `backlogUser${index + 1}`,
    text: `积压消息 ${index + 1}`,
    createdAt: index + 1,
  }),
);

export const PREVIEW_VERTICAL_DROPPED_STATUS: VerticalFlowStatus = {
  active: true,
  policy: "complete",
  backlog: 1_240,
  speedMultiplier: 8,
  droppedTotal: 17,
};

export const PREVIEW_RECORDING_DISABLED: DanmakuRecordingStatus = {
  enabled: false,
  state: "disabled",
  activeFiles: [],
  errorMessage: null,
};

export const PREVIEW_RECORDING_WAITING: DanmakuRecordingStatus = {
  enabled: true,
  state: "waiting",
  activeFiles: [],
  errorMessage: null,
};

export const PREVIEW_RECORDING_ACTIVE: DanmakuRecordingStatus = {
  enabled: true,
  state: "recording",
  activeFiles: [
    { roomId: 6, fileName: "2026-08-27-6-主播甲.txt" },
    { roomId: 7, fileName: "2026-08-27-7-主播乙.txt" },
  ],
  errorMessage: null,
};

export const PREVIEW_MULTI_ROOM_RECORDING_ACTIVE: DanmakuRecordingStatus = {
  enabled: true,
  state: "recording",
  activeFiles: [
    { roomId: 6, fileName: "2026-08-27-6-补给箱.txt" },
    { roomId: 7, fileName: "2026-08-27-7-小海梓.txt" },
  ],
  errorMessage: null,
};

export const PREVIEW_RECORDING_ERROR: DanmakuRecordingStatus = {
  enabled: true,
  state: "error",
  activeFiles: [],
  errorMessage: "记录目录无访问权限，记录已暂停",
};

export const PREVIEW_THEME_SAVE_ERROR = "主题保存失败，已恢复原主题";

export const PREVIEW_MULTI_ROOM_CONFIG: AppConfig = {
  ...PREVIEW_CONFIG,
  savedRooms: [
    {
      id: "preview-room-6",
      roomId: "6",
      displayName: "午夜电台",
      anchorName: "补给箱",
      groupId: "chat",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    {
      id: "preview-room-7",
      roomId: "7",
      displayName: "清晨练歌",
      anchorName: "小海梓",
      groupId: "chat",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    {
      id: "preview-room-8",
      roomId: "8",
      displayName: "周末联机",
      anchorName: "像素阿遥",
      groupId: "game",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    {
      id: "preview-room-9",
      roomId: "9",
      displayName: "午后茶会",
      anchorName: "薄荷研究员",
      groupId: "vtuber",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    {
      id: "preview-room-10",
      roomId: "10",
      displayName: "夜航观测",
      anchorName: "星图事务所",
      groupId: "event",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
  ],
  selectedSavedRoomIds: ["preview-room-6", "preview-room-7"],
};

export const PREVIEW_MULTI_ROOM_SAVED_SESSIONS: RoomSessionSnapshot[] = [
  {
    sessionId: "preview-session-6",
    requestedRoomId: 6,
    roomId: 6,
    anchorName: "补给箱",
    fanMedalName: "补给箱",
    status: "connected",
    message: "已连接直播间 6",
    liveStatus: 1,
  },
  {
    sessionId: "preview-session-7",
    requestedRoomId: 7,
    roomId: 7,
    anchorName: "小海梓",
    fanMedalName: "小海梓",
    status: "reconnecting",
    message: "网络波动，正在重连直播间 7",
    liveStatus: 1,
  },
  {
    sessionId: "preview-session-8",
    requestedRoomId: 8,
    roomId: 8,
    anchorName: "像素阿遥",
    status: "not_live",
    message: "直播间 8 当前未开播",
    liveStatus: 0,
  },
  {
    sessionId: "preview-session-9",
    requestedRoomId: 9,
    roomId: 9,
    anchorName: "薄荷研究员",
    status: "error",
    message: "获取弹幕服务器失败，请稍后重试",
  },
  {
    sessionId: "preview-session-10",
    requestedRoomId: 10,
    roomId: 10,
    anchorName: "星图事务所",
    status: "disconnected",
    message: "直播间 10 已断开",
  },
];

export const PREVIEW_MULTI_ROOM_TEMPORARY_SESSIONS: RoomSessionSnapshot[] = [
  {
    sessionId: "preview-session-9527",
    requestedRoomId: 9527,
    roomId: 9527,
    anchorName: "巡航测试",
    fanMedalName: "巡航测试",
    status: "connected",
    message: "临时房间 9527 已连接",
    liveStatus: 1,
  },
];

export const PREVIEW_MULTI_ROOM_HORIZONTAL_ITEMS: DanmakuItem[] = [
  {
    id: "horizontal-multi-room-medal",
    kind: "danmaku",
    sourceLabel: "补给箱",
    sourceColorIndex: 0,
    user: "牌友一号",
    text: "粉丝牌样式保持",
    currentRoomFanMedalLevel: 13,
    track: 0,
    duration: 18,
    delay: 0,
    createdAt: 1,
  },
  {
    id: "horizontal-multi-room-followed-sc",
    kind: "super_chat",
    sourceLabel: "小海梓",
    sourceColorIndex: 1,
    user: "关注对象",
    text: "关注 SC 样式保持",
    superChatPrice: 30,
    superChatColor: "#e2b52b",
    followedUser: true,
    track: 1,
    duration: 18,
    delay: 0.3,
    createdAt: 2,
  },
  {
    id: "horizontal-multi-room-plain",
    kind: "danmaku",
    user: "普通观众",
    text: "无标签消息保持语义",
    track: 2,
    duration: 18,
    delay: 0.6,
    createdAt: 3,
  },
];

export const PREVIEW_MULTI_ROOM_VERTICAL_ITEMS: VerticalChatItem[] = [
  {
    id: "vertical-multi-room-medal",
    kind: "danmaku",
    sourceLabel: "补给箱",
    sourceColorIndex: 0,
    user: "牌友一号",
    text: "粉丝牌样式保持",
    currentRoomFanMedalLevel: 13,
    createdAt: 1,
  },
  {
    id: "vertical-multi-room-followed-sc",
    kind: "super_chat",
    sourceLabel: "小海梓",
    sourceColorIndex: 1,
    user: "关注对象",
    text: "关注 SC 样式保持",
    superChatPrice: 30,
    superChatColor: "#e2b52b",
    followedUser: true,
    createdAt: 2,
  },
  {
    id: "vertical-multi-room-plain",
    kind: "danmaku",
    user: "普通观众",
    text: "无标签消息保持语义",
    createdAt: 3,
  },
];

export const PREVIEW_FILTER_RULES: FilterRule[] = [
  {
    id: "preview-filter-1",
    enabled: true,
    name: "隐藏抽奖刷屏内容",
    target: "text",
    operator: "contains",
    value: "抽奖",
    action: "hide",
  },
  {
    id: "preview-filter-2",
    enabled: true,
    name: "高亮示例主播的长用户名和说明内容",
    target: "user",
    operator: "startsWith",
    value: "示例主播官方直播账号",
    action: "highlight",
  },
  {
    id: "preview-filter-5",
    enabled: true,
    name: "隐藏重复欢迎语",
    target: "text",
    operator: "regex",
    value: "^(欢迎|来了){2,}$",
    action: "hide",
  },
  {
    id: "preview-sender-uid",
    enabled: true,
    name: "屏蔽指定用户",
    target: "senderUid",
    operator: "equals",
    value: "42",
    action: "hide",
  },
  {
    id: "preview-fan-medal",
    enabled: true,
    name: "只看本房粉丝牌",
    target: "currentRoomFanMedal",
    operator: "equals",
    value: "no",
    action: "hide",
  },
];

export const PREVIEW_FILTER_RUNTIME_STATUS: FilterRuntimeStatus = {
  rooms: [
    {
      roomId: 123456,
      pausedFanMedalRuleIds: ["preview-fan-medal"],
      pauseReason: "fan_medal_protocol_unknown",
    },
  ],
};

export const PREVIEW_DIAGNOSTIC_STEPS: ApiTestStep[] = [
  {
    key: "room_init",
    label: "直播间初始化",
    status: "success",
    durationMs: 86,
    message: "房间号有效，直播状态正常",
    detail:
      "room_id=123456\nlive_status=1\n该详情用于检查长文本展开时的换行与滚动。",
  },
  {
    key: "wbi",
    label: "WBI 签名",
    status: "warning",
    durationMs: 142,
    message: "登录态不可用，已回退匿名请求",
    detail: "匿名链路仍可继续连接只读弹幕。",
  },
  {
    key: "websocket",
    label: "WebSocket 鉴权",
    status: "failed",
    durationMs: 1200,
    message: "预览场景中的模拟失败步骤",
    detail: "仅用于开发预览，不会发起真实网络请求。",
  },
];

const PREVIEW_RELEASE_URL =
  "https://github.com/proudzhao/Drift/releases/latest";

export const PREVIEW_UPDATE_AVAILABLE: AppUpdateState = {
  status: "available",
  currentVersion: "0.8.0",
  latestVersion: "0.8.1",
  releaseUrl: PREVIEW_RELEASE_URL,
  notes: "优化控制面板布局，并改进直播间连接状态反馈。",
  downloadedBytes: 0,
  error: "",
  checkedAt: Date.parse("2026-08-17T00:00:00.000Z"),
};

export const PREVIEW_UPDATE_ERROR: AppUpdateState = {
  status: "error",
  currentVersion: "0.8.0",
  latestVersion: "",
  releaseUrl: PREVIEW_RELEASE_URL,
  notes: "",
  downloadedBytes: 0,
  error: "暂时无法获取更新信息，请稍后重试。",
  checkedAt: Date.parse("2026-08-17T00:00:00.000Z"),
};
