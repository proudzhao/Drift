import type { AppUpdateState } from "../hooks/control/useAppUpdate";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../types/config";
import type { FilterRule } from "../types/config";
import type { DanmakuStatus } from "../types/danmaku";
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

export const PREVIEW_STATUS: DanmakuStatus = {
  status: "idle",
  message: "尚未连接直播间",
};

export const PREVIEW_CONNECTED_STATUS: DanmakuStatus = {
  status: "connected",
  message: "已连接直播间 123456",
  roomId: 123456,
  anchorName: "示例主播",
  liveStatus: 1,
};

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
    id: "preview-filter-3",
    enabled: false,
    name: "隐藏礼物消息",
    target: "messageType",
    operator: "equals",
    value: "gift",
    action: "hide",
  },
  {
    id: "preview-filter-4",
    enabled: true,
    name: "高亮超级醒目留言",
    target: "messageType",
    operator: "equals",
    value: "super_chat",
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
];

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
  currentVersion: "0.7.0",
  latestVersion: "0.7.1",
  releaseUrl: PREVIEW_RELEASE_URL,
  notes: "优化控制面板布局，并改进直播间连接状态反馈。",
  downloadedBytes: 0,
  error: "",
  checkedAt: Date.parse("2026-08-17T00:00:00.000Z"),
};

export const PREVIEW_UPDATE_ERROR: AppUpdateState = {
  status: "error",
  currentVersion: "0.7.0",
  latestVersion: "",
  releaseUrl: PREVIEW_RELEASE_URL,
  notes: "",
  downloadedBytes: 0,
  error: "暂时无法获取更新信息，请稍后重试。",
  checkedAt: Date.parse("2026-08-17T00:00:00.000Z"),
};
