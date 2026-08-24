import type { MouseEvent } from "react";
import { BarChart3, Beaker, Check, History } from "lucide-react";
import type { DanmakuStatsSnapshot } from "../utils/danmakuStats";
import { DanmakuHistoryDrawer, type HistoryMessage } from "./DanmakuHistoryDrawer";
import { DanmakuStatsDrawer } from "./DanmakuStatsDrawer";
import { MockDanmakuPanel } from "./MockDanmakuPanel";
import { OverlayControlDock } from "./OverlayControlDock";
import { IconButton, Tooltip, TooltipProvider } from "./ui";

export type OverlayResizeDirection =
  | "NorthWest"
  | "NorthEast"
  | "SouthEast"
  | "SouthWest";

export type OverlayMockProps = {
  active: boolean;
  rate: number;
  totalGenerated: number;
  onStart: () => void;
  onStop: () => void;
  onRateChange: (rate: number) => void;
  onBurst: () => void;
};

type OverlayEditWorkspaceProps = {
  historyInitialQuery?: string;
  historyMessages: HistoryMessage[];
  mock: OverlayMockProps | null;
  onDragStart: (event: MouseEvent<HTMLElement>) => void;
  onExit: () => void;
  onResizeStart: (
    direction: OverlayResizeDirection,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  onShowMock: () => void;
  onToggleHistory: () => void;
  onToggleStats: () => void;
  shortcut: string;
  showHistory: boolean;
  showStats: boolean;
  stats: DanmakuStatsSnapshot;
};

const RESIZE_DIRECTIONS = [
  {
    direction: "NorthWest",
    label: "左上角",
    className: "overlay-resize-northwest",
  },
  {
    direction: "NorthEast",
    label: "右上角",
    className: "overlay-resize-northeast",
  },
  {
    direction: "SouthEast",
    label: "右下角",
    className: "overlay-resize-southeast",
  },
  {
    direction: "SouthWest",
    label: "左下角",
    className: "overlay-resize-southwest",
  },
] as const;

export function OverlayEditWorkspace(props: OverlayEditWorkspaceProps) {
  const drawerOpen = props.showHistory || props.showStats;

  return (
    <TooltipProvider delayDuration={300}>
      <section
        aria-label="弹幕编辑工作台"
        className="drift-overlay-workspace pointer-events-none absolute inset-0 z-[2] select-none"
      >
        <section
          aria-label="拖动弹幕窗口"
          className="overlay-drag-region pointer-events-auto"
          data-tauri-drag-region
          onMouseDown={props.onDragStart}
        >
          <span className="drift-theme-transition overlay-drag-label">
            拖动调整弹幕区域位置
          </span>
        </section>

        <OverlayControlDock
          drawerOpen={drawerOpen}
          mockActive={props.mock?.active ?? null}
          onExit={props.onExit}
          onToggleHistory={props.onToggleHistory}
          onToggleStats={props.onToggleStats}
          shortcut={props.shortcut}
          showHistory={props.showHistory}
          showStats={props.showStats}
        />

        {props.mock ? (
          <MockDanmakuPanel
            {...props.mock}
            className={drawerOpen ? "overlay-covered-on-narrow" : undefined}
          />
        ) : null}

        {props.showHistory ? (
          <DanmakuHistoryDrawer
            initialQuery={props.historyInitialQuery}
            messages={props.historyMessages}
            onClose={props.onToggleHistory}
          />
        ) : null}
        {props.showStats ? (
          <DanmakuStatsDrawer
            onClose={props.onToggleStats}
            stats={props.stats}
          />
        ) : null}

        {drawerOpen ? (
          <nav
            aria-label="窄屏工作台模式"
            className="drift-theme-transition overlay-narrow-rail pointer-events-auto"
          >
            {props.mock ? (
              <Tooltip content="Mock 控制">
                <IconButton
                  aria-label="显示 Mock 控制"
                  onClick={props.onShowMock}
                  size="sm"
                >
                  <Beaker aria-hidden="true" size={14} />
                </IconButton>
              </Tooltip>
            ) : null}
            <Tooltip content="弹幕历史">
              <IconButton
                active={props.showHistory}
                aria-label="显示弹幕历史"
                aria-pressed={props.showHistory}
                onClick={props.onToggleHistory}
                size="sm"
              >
                <History aria-hidden="true" size={14} />
              </IconButton>
            </Tooltip>
            <Tooltip content="弹幕统计">
              <IconButton
                active={props.showStats}
                aria-label="显示弹幕统计"
                aria-pressed={props.showStats}
                onClick={props.onToggleStats}
                size="sm"
              >
                <BarChart3 aria-hidden="true" size={14} />
              </IconButton>
            </Tooltip>
            <Tooltip content="完成编辑">
              <IconButton
                aria-label="完成编辑"
                className="mt-auto"
                onClick={props.onExit}
                size="sm"
                variant="primary"
              >
                <Check aria-hidden="true" size={14} />
              </IconButton>
            </Tooltip>
          </nav>
        ) : null}

        {RESIZE_DIRECTIONS.map((item) => (
          <button
            aria-label={`${item.label}缩放弹幕窗口`}
            className={`overlay-resize-handle ${item.className}`}
            key={item.direction}
            onMouseDown={(event) => props.onResizeStart(item.direction, event)}
            type="button"
          />
        ))}
      </section>
    </TooltipProvider>
  );
}
