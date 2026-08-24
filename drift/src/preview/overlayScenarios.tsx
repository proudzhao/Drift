import { useState, type CSSProperties } from "react";
import {
  OverlayEditWorkspace,
  type OverlayMockProps,
} from "../components/OverlayEditWorkspace";
import { DanmakuOverlay } from "../components/DanmakuOverlay";
import { VerticalChatOverlay } from "../components/VerticalChatOverlay";
import type { HistoryMessage } from "../components/DanmakuHistoryDrawer";
import type { VerticalChatItem } from "../types/danmaku";
import { createFollowedUserPreviewItems } from "../data/mockDanmaku";
import {
  createEmptyStatsSnapshot,
  type DanmakuStatsSnapshot,
} from "../utils/danmakuStats";
import { ThemeScenarioScope } from "./ThemeScenarioScope";
import {
  PREVIEW_VERTICAL_BACKLOG_ITEMS,
  PREVIEW_VERTICAL_LONG_ITEMS,
  PREVIEW_VERTICAL_MIXED_ITEMS,
} from "./fixtures";

export type OverlayScenarioId =
  | "overlay-edit-basic"
  | "overlay-followed-messages"
  | "overlay-mock-idle"
  | "overlay-mock-active"
  | "overlay-history-empty"
  | "overlay-history-filled"
  | "overlay-history-search-empty"
  | "overlay-stats-empty"
  | "overlay-stats-filled"
  | "overlay-narrow-history"
  | "overlay-narrow-stats"
  | "overlay-theme-light"
  | "overlay-vertical-mixed"
  | "overlay-vertical-backlog"
  | "overlay-vertical-long";

export const OVERLAY_SCENARIOS = [
  { id: "overlay-edit-basic", label: "悬浮层 / 基础编辑" },
  { id: "overlay-followed-messages", label: "悬浮层 / 关注高亮" },
  { id: "overlay-mock-idle", label: "悬浮层 / Mock 已停止" },
  { id: "overlay-mock-active", label: "悬浮层 / Mock 运行中" },
  { id: "overlay-history-empty", label: "悬浮层 / 历史空列表" },
  { id: "overlay-history-filled", label: "悬浮层 / 历史长列表" },
  { id: "overlay-history-search-empty", label: "悬浮层 / 历史无结果" },
  { id: "overlay-stats-empty", label: "悬浮层 / 统计空状态" },
  { id: "overlay-stats-filled", label: "悬浮层 / 统计完整数据" },
  { id: "overlay-narrow-history", label: "悬浮层 / 窄屏历史" },
  { id: "overlay-narrow-stats", label: "悬浮层 / 窄屏统计" },
  { id: "overlay-theme-light", label: "悬浮层 / 亮色主题" },
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
    user: "观众 A",
    text: "今天的直播也太好笑了",
    timestamp: 1,
  },
  {
    id: "preview-2",
    kind: "super_chat",
    user: "用于检查截断的超长用户名_Official",
    text: "这是一条用于检查历史列表长内容截断的弹幕",
    timestamp: 2,
  },
  ...Array.from({ length: 18 }, (_, index) => ({
    id: `preview-${index + 3}`,
    kind: "danmaku" as const,
    user: `预览观众 ${index + 3}`,
    text: `第 ${index + 3} 条固定弹幕用于检查长列表滚动`,
    timestamp: index + 3,
  })),
];

const PREVIEW_STATS: DanmakuStatsSnapshot = {
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
};

type OverlayFixture = {
  historyInitialQuery?: string;
  historyMessages: HistoryMessage[];
  mockActive: boolean | null;
  narrow: boolean;
  showHistory: boolean;
  showStats: boolean;
  stats: DanmakuStatsSnapshot;
  verticalItems?: VerticalChatItem[];
  verticalFontSize?: number;
  viewportHeight?: number;
  viewportWidth?: number;
};

const EMPTY_STATS = createEmptyStatsSnapshot(1);

const FIXTURES: Record<OverlayScenarioId, OverlayFixture> = {
  "overlay-edit-basic": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-followed-messages": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-mock-idle": {
    historyMessages: [],
    mockActive: false,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-mock-active": {
    historyMessages: [],
    mockActive: true,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-history-empty": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: true,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-history-filled": {
    historyMessages: PREVIEW_HISTORY,
    mockActive: null,
    narrow: false,
    showHistory: true,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-history-search-empty": {
    historyInitialQuery: "不会匹配任何消息",
    historyMessages: PREVIEW_HISTORY,
    mockActive: null,
    narrow: false,
    showHistory: true,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-stats-empty": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: true,
    stats: EMPTY_STATS,
  },
  "overlay-stats-filled": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: true,
    stats: PREVIEW_STATS,
  },
  "overlay-narrow-history": {
    historyMessages: PREVIEW_HISTORY,
    mockActive: false,
    narrow: true,
    showHistory: true,
    showStats: false,
    stats: PREVIEW_STATS,
  },
  "overlay-narrow-stats": {
    historyMessages: PREVIEW_HISTORY,
    mockActive: false,
    narrow: true,
    showHistory: false,
    showStats: true,
    stats: PREVIEW_STATS,
  },
  "overlay-theme-light": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
  },
  "overlay-vertical-mixed": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
    verticalItems: PREVIEW_VERTICAL_MIXED_ITEMS,
    verticalFontSize: 14,
    viewportHeight: 220,
    viewportWidth: 1280,
  },
  "overlay-vertical-backlog": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
    verticalItems: PREVIEW_VERTICAL_BACKLOG_ITEMS,
    viewportHeight: 220,
    viewportWidth: 560,
  },
  "overlay-vertical-long": {
    historyMessages: [],
    mockActive: null,
    narrow: false,
    showHistory: false,
    showStats: false,
    stats: EMPTY_STATS,
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
            shortcut="Command+Option+K"
            showHistory={showHistory}
            showStats={showStats}
            stats={fixture.stats}
          />
        </div>
      </div>
    </ThemeScenarioScope>
  );
}
