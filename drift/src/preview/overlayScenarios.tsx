import { useState, type CSSProperties } from "react";
import {
  OverlayEditWorkspace,
  type OverlayMockProps,
} from "../components/OverlayEditWorkspace";
import { DanmakuOverlay } from "../components/DanmakuOverlay";
import { VerticalChatOverlay } from "../components/VerticalChatOverlay";
import type { HistoryMessage } from "../components/DanmakuHistoryDrawer";
import type { DanmakuItem, VerticalChatItem } from "../types/danmaku";
import type { RoomSourceOption } from "../types/roomSession";
import { createFollowedUserPreviewItems } from "../data/mockDanmaku";
import {
  createEmptyScopedStatsSnapshots,
  type ScopedStatsSnapshots,
} from "../utils/danmakuStats";
import { ThemeScenarioScope } from "./ThemeScenarioScope";
import {
  PREVIEW_MULTI_ROOM_HORIZONTAL_ITEMS,
  PREVIEW_MULTI_ROOM_VERTICAL_ITEMS,
  PREVIEW_VERTICAL_BACKLOG_ITEMS,
  PREVIEW_VERTICAL_LONG_ITEMS,
  PREVIEW_VERTICAL_MIXED_ITEMS,
} from "./fixtures";

export type OverlayScenarioId =
  | "overlay-edit-basic"
  | "overlay-followed-messages"
  | "overlay-horizontal-multi-room"
  | "overlay-mock-idle"
  | "overlay-mock-active"
  | "overlay-history-empty"
  | "overlay-history-filled"
  | "overlay-history-search-empty"
  | "overlay-history-room-filter"
  | "overlay-stats-empty"
  | "overlay-stats-filled"
  | "overlay-stats-room-filter"
  | "overlay-narrow-history"
  | "overlay-narrow-stats"
  | "overlay-theme-light"
  | "overlay-vertical-multi-room"
  | "overlay-vertical-mixed"
  | "overlay-vertical-backlog"
  | "overlay-vertical-long";

export const OVERLAY_SCENARIOS = [
  { id: "overlay-edit-basic", label: "悬浮层 / 基础编辑" },
  { id: "overlay-followed-messages", label: "悬浮层 / 关注高亮" },
  { id: "overlay-horizontal-multi-room", label: "悬浮层 / 多房横向消息" },
  { id: "overlay-mock-idle", label: "悬浮层 / Mock 已停止" },
  { id: "overlay-mock-active", label: "悬浮层 / Mock 运行中" },
  { id: "overlay-history-empty", label: "悬浮层 / 历史空列表" },
  { id: "overlay-history-filled", label: "悬浮层 / 历史长列表" },
  { id: "overlay-history-search-empty", label: "悬浮层 / 历史无结果" },
  { id: "overlay-history-room-filter", label: "悬浮层 / 历史按房间筛选" },
  { id: "overlay-stats-empty", label: "悬浮层 / 统计空状态" },
  { id: "overlay-stats-filled", label: "悬浮层 / 统计完整数据" },
  { id: "overlay-stats-room-filter", label: "悬浮层 / 统计按房间筛选" },
  { id: "overlay-narrow-history", label: "悬浮层 / 窄屏历史" },
  { id: "overlay-narrow-stats", label: "悬浮层 / 窄屏统计" },
  { id: "overlay-theme-light", label: "悬浮层 / 亮色主题" },
  { id: "overlay-vertical-multi-room", label: "悬浮层 / 多房纵向消息" },
  { id: "overlay-vertical-mixed", label: "悬浮层 / 纵向混合消息" },
  { id: "overlay-vertical-backlog", label: "悬浮层 / 纵向积压" },
  { id: "overlay-vertical-long", label: "悬浮层 / 纵向长消息" },
] as const;

const OVERLAY_SCENARIO_IDS = new Set<string>(
  OVERLAY_SCENARIOS.map((scenario) => scenario.id),
);

export function isOverlayScenarioId(value: string): value is OverlayScenarioId {
  return OVERLAY_SCENARIO_IDS.has(value);
}

const PREVIEW_HISTORY: HistoryMessage[] = [
  {
    id: "preview-1",
    kind: "danmaku",
    sourceAnchorName: "主播甲",
    sourceRoomId: 6,
    user: "观众 A",
    text: "今天的直播也太好笑了",
    timestamp: 1,
  },
  {
    id: "preview-2",
    kind: "super_chat",
    sourceAnchorName: "主播乙",
    sourceRoomId: 7,
    user: "用于检查截断的超长用户名_Official",
    text: "这是一条用于检查历史列表长内容截断的弹幕",
    timestamp: 2,
  },
  ...Array.from({ length: 18 }, (_, index) => ({
    id: `preview-${index + 3}`,
    kind: "danmaku" as const,
    sourceAnchorName: index % 2 === 0 ? "主播甲" : "主播乙",
    sourceRoomId: index % 2 === 0 ? 6 : 7,
    user: `预览观众 ${index + 3}`,
    text: `第 ${index + 3} 条固定弹幕用于检查长列表滚动`,
    timestamp: index + 3,
  })),
];

const PREVIEW_ROOM_SOURCES: RoomSourceOption[] = [
  { roomId: 6, label: "主播甲 · 6" },
  { roomId: 7, label: "主播乙 · 7" },
];

const PREVIEW_ROOM_FILTER_HISTORY: HistoryMessage[] = [
  {
    id: "history-room-6-1",
    kind: "danmaku",
    sourceAnchorName: "主播甲",
    sourceRoomId: 6,
    user: "观众甲一号",
    text: "房间 6 的第一条固定消息",
    timestamp: 1,
  },
  {
    id: "history-room-6-2",
    kind: "gift",
    sourceAnchorName: "主播甲",
    sourceRoomId: 6,
    user: "观众甲二号",
    text: "房间 6 的第二条固定消息",
    timestamp: 2,
  },
  {
    id: "history-room-6-3",
    kind: "danmaku",
    sourceAnchorName: "主播甲",
    sourceRoomId: 6,
    user: "观众甲三号",
    text: "房间 6 的第三条固定消息",
    timestamp: 3,
  },
  {
    id: "history-room-7-1",
    kind: "super_chat",
    sourceAnchorName: "主播乙",
    sourceRoomId: 7,
    user: "观众乙一号",
    text: "房间 7 的第一条固定消息",
    timestamp: 4,
  },
  {
    id: "history-room-7-2",
    kind: "guard",
    sourceAnchorName: "主播乙",
    sourceRoomId: 7,
    user: "观众乙二号",
    text: "房间 7 的第二条固定消息",
    timestamp: 5,
  },
  {
    id: "history-room-7-3",
    kind: "danmaku",
    sourceAnchorName: "主播乙",
    sourceRoomId: 7,
    user: "观众乙三号",
    text: "房间 7 的第三条固定消息",
    timestamp: 6,
  },
];

const PREVIEW_ROOM_FILTER_STATS: ScopedStatsSnapshots = {
  all: {
    startedAt: 1,
    updatedAt: 2,
    totalMessages: 9,
    lastMinuteMessages: 5,
    lastFiveMinuteMessages: 9,
    messagesPerMinute: 5,
    kindCounts: { danmaku: 5, super_chat: 1, gift: 2, guard: 1 },
    topUsers: [{ user: "全局固定观众", count: 3 }],
    topWords: [{ word: "全局固定词", count: 2 }],
  },
  byRoom: {
    6: {
      startedAt: 1,
      updatedAt: 2,
      totalMessages: 6,
      lastMinuteMessages: 4,
      lastFiveMinuteMessages: 6,
      messagesPerMinute: 4,
      kindCounts: { danmaku: 4, super_chat: 0, gift: 1, guard: 1 },
      topUsers: [{ user: "房间 6 观众", count: 2 }],
      topWords: [{ word: "房间 6 词条", count: 2 }],
    },
    7: {
      startedAt: 1,
      updatedAt: 2,
      totalMessages: 3,
      lastMinuteMessages: 1,
      lastFiveMinuteMessages: 3,
      messagesPerMinute: 1,
      kindCounts: { danmaku: 1, super_chat: 1, gift: 1, guard: 0 },
      topUsers: [{ user: "房间 7 观众", count: 2 }],
      topWords: [{ word: "房间 7 词条", count: 1 }],
    },
  },
};

const PREVIEW_STATS: ScopedStatsSnapshots = {
  all: {
    startedAt: 1,
    updatedAt: 2,
    totalMessages: 100,
    lastMinuteMessages: 24,
    lastFiveMinuteMessages: 80,
    messagesPerMinute: 24,
    kindCounts: { danmaku: 70, super_chat: 10, gift: 15, guard: 5 },
    topUsers: [
      { user: "用于检查截断的超长用户名_Official", count: 18 },
    ],
    topWords: [{ word: "超长高频词条用于检查截断", count: 12 }],
  },
  byRoom: {
    6: {
      startedAt: 1,
      updatedAt: 2,
      totalMessages: 60,
      lastMinuteMessages: 16,
      lastFiveMinuteMessages: 48,
      messagesPerMinute: 16,
      kindCounts: { danmaku: 42, super_chat: 6, gift: 9, guard: 3 },
      topUsers: [{ user: "房间甲活跃观众", count: 11 }],
      topWords: [{ word: "主播甲高频词", count: 7 }],
    },
    7: {
      startedAt: 1,
      updatedAt: 2,
      totalMessages: 40,
      lastMinuteMessages: 8,
      lastFiveMinuteMessages: 32,
      messagesPerMinute: 8,
      kindCounts: { danmaku: 28, super_chat: 4, gift: 6, guard: 2 },
      topUsers: [{ user: "房间乙活跃观众", count: 9 }],
      topWords: [{ word: "主播乙高频词", count: 5 }],
    },
  },
};

type OverlayFixture = {
  horizontalItems?: DanmakuItem[];
  historyInitialQuery?: string;
  historyMessages: HistoryMessage[];
  mockActive: boolean | null;
  narrow: boolean;
  roomSources: RoomSourceOption[];
  showHistory: boolean;
  showStats: boolean;
  statsSnapshots: ScopedStatsSnapshots;
  verticalItems?: VerticalChatItem[];
  verticalFontSize?: number;
  viewportHeight?: number;
  viewportWidth?: number;
};

const EMPTY_STATS = createEmptyScopedStatsSnapshots(1);

const FIXTURES: Record<OverlayScenarioId, OverlayFixture> = {
  "overlay-edit-basic": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-followed-messages": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-horizontal-multi-room": {
    horizontalItems: PREVIEW_MULTI_ROOM_HORIZONTAL_ITEMS,
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-mock-idle": {
    historyMessages: [],
    mockActive: false,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-mock-active": {
    historyMessages: [],
    mockActive: true,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-history-empty": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: true,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-history-filled": {
    historyMessages: PREVIEW_HISTORY,
    mockActive: null,
    narrow: false,
    roomSources: PREVIEW_ROOM_SOURCES,
    showHistory: true,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-history-search-empty": {
    historyInitialQuery: "不会匹配任何消息",
    historyMessages: PREVIEW_HISTORY,
    mockActive: null,
    narrow: false,
    roomSources: PREVIEW_ROOM_SOURCES,
    showHistory: true,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-history-room-filter": {
    historyMessages: PREVIEW_ROOM_FILTER_HISTORY,
    mockActive: null,
    narrow: false,
    roomSources: PREVIEW_ROOM_SOURCES,
    showHistory: true,
    showStats: false,
    statsSnapshots: PREVIEW_ROOM_FILTER_STATS,
    viewportHeight: 220,
    viewportWidth: 560,
  },
  "overlay-stats-empty": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: true,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-stats-filled": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: PREVIEW_ROOM_SOURCES,
    showHistory: false,
    showStats: true,
    statsSnapshots: PREVIEW_STATS,
  },
  "overlay-stats-room-filter": {
    historyMessages: PREVIEW_ROOM_FILTER_HISTORY,
    mockActive: null,
    narrow: false,
    roomSources: PREVIEW_ROOM_SOURCES,
    showHistory: false,
    showStats: true,
    statsSnapshots: PREVIEW_ROOM_FILTER_STATS,
    viewportHeight: 220,
    viewportWidth: 560,
  },
  "overlay-narrow-history": {
    historyMessages: PREVIEW_HISTORY,
    mockActive: false,
    narrow: true,
    roomSources: PREVIEW_ROOM_SOURCES,
    showHistory: true,
    showStats: false,
    statsSnapshots: PREVIEW_STATS,
  },
  "overlay-narrow-stats": {
    historyMessages: PREVIEW_HISTORY,
    mockActive: false,
    narrow: true,
    roomSources: PREVIEW_ROOM_SOURCES,
    showHistory: false,
    showStats: true,
    statsSnapshots: PREVIEW_STATS,
  },
  "overlay-theme-light": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
  },
  "overlay-vertical-multi-room": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
    verticalItems: PREVIEW_MULTI_ROOM_VERTICAL_ITEMS,
    verticalFontSize: 14,
    viewportHeight: 220,
    viewportWidth: 560,
  },
  "overlay-vertical-mixed": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
    verticalItems: PREVIEW_VERTICAL_MIXED_ITEMS,
    verticalFontSize: 14,
    viewportHeight: 220,
    viewportWidth: 1280,
  },
  "overlay-vertical-backlog": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
    verticalItems: PREVIEW_VERTICAL_BACKLOG_ITEMS,
    viewportHeight: 220,
    viewportWidth: 560,
  },
  "overlay-vertical-long": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    roomSources: [],
    showHistory: false,
    showStats: false,
    statsSnapshots: EMPTY_STATS,
    verticalItems: PREVIEW_VERTICAL_LONG_ITEMS,
    verticalFontSize: 14,
    viewportHeight: 160,
    viewportWidth: 320,
  },
};

export function OverlayScenarioPreview({
  scenarioId,
}: {
  scenarioId: OverlayScenarioId;
}) {
  const fixture = FIXTURES[scenarioId];
  const [showHistory, setShowHistory] = useState(fixture.showHistory);
  const [showStats, setShowStats] = useState(fixture.showStats);
  const [mockActive, setMockActive] = useState(fixture.mockActive ?? false);
  const [rate, setRate] = useState(50);
  const [generated, setGenerated] = useState(fixture.mockActive ? 1248 : 0);
  const theme =
    scenarioId === "overlay-theme-light" ||
    scenarioId === "overlay-vertical-long"
      ? "light"
      : "dark";
  const showRealMessages =
    scenarioId === "overlay-followed-messages" ||
    scenarioId === "overlay-theme-light";

  function toggleHistory() {
    setShowHistory((current) => {
      const next = !current;
      if (next) setShowStats(false);
      return next;
    });
  }

  function toggleStats() {
    setShowStats((current) => {
      const next = !current;
      if (next) setShowHistory(false);
      return next;
    });
  }

  const mock: OverlayMockProps | null =
    fixture.mockActive === null
      ? null
      : {
          active: mockActive,
          onBurst: () => setGenerated((count) => count + 40),
          onRateChange: setRate,
          onStart: () => setMockActive(true),
          onStop: () => setMockActive(false),
          rate,
          totalGenerated: generated,
        };

  return (
    <ThemeScenarioScope theme={theme}>
      <div
        className={
          theme === "light"
            ? "grid h-screen w-screen place-items-center overflow-hidden bg-[var(--drift-ui-workspace)]"
            : "grid h-screen w-screen place-items-center overflow-hidden bg-[#263a43]"
        }
      >
        <div
          className={
            theme === "light"
              ? "relative max-h-[100vh] max-w-[100vw] shrink-0 overflow-hidden bg-[var(--drift-ui-edit-backdrop)]"
              : "relative max-h-[100vh] max-w-[100vw] shrink-0 overflow-hidden bg-[rgba(9,14,20,.16)]"
          }
          style={
            {
              "--danmaku-font-size": fixture.verticalFontSize
                ? `${fixture.verticalFontSize}px`
                : undefined,
              height: fixture.viewportHeight ?? (fixture.narrow ? 160 : 220),
              width: fixture.viewportWidth ?? (fixture.narrow ? 320 : 1280),
            } as CSSProperties
          }
        >
          {fixture.verticalItems ? (
            <VerticalChatOverlay
              items={fixture.verticalItems}
              onItemsPruned={() => undefined}
              showEmotes
            />
          ) : fixture.horizontalItems ? (
            <DanmakuOverlay
              items={fixture.horizontalItems}
              showEmotes
              showUsername
              trackCount={5}
            />
          ) : showRealMessages ? (
            <DanmakuOverlay
              items={createFollowedUserPreviewItems()}
              showEmotes
              showUsername={false}
              trackCount={5}
            />
          ) : (
            <div
              aria-hidden="true"
              className="absolute right-8 top-10 text-sm text-white"
            >
              示例用户：这是一条运行态弹幕背景
            </div>
          )}
          <OverlayEditWorkspace
            historyInitialQuery={fixture.historyInitialQuery}
            historyMessages={fixture.historyMessages}
            mock={mock}
            onDragStart={() => undefined}
            onExit={() => undefined}
            onResizeStart={() => undefined}
            onShowMock={() => {
              setShowHistory(false);
              setShowStats(false);
            }}
            onToggleHistory={toggleHistory}
            onToggleStats={toggleStats}
            roomSources={fixture.roomSources}
            shortcut="Command+Option+K"
            showHistory={showHistory}
            showStats={showStats}
            statsSnapshots={fixture.statsSnapshots}
          />
        </div>
      </div>
    </ThemeScenarioScope>
  );
}
