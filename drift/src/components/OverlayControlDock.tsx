import { BarChart3, Check, History } from "lucide-react";
import { classNames } from "../utils/classNames";
import { Button, Tooltip, TooltipProvider } from "./ui";

type OverlayControlDockProps = {
  drawerOpen: boolean;
  mockActive: boolean | null;
  onExit: () => void;
  onToggleHistory: () => void;
  onToggleStats: () => void;
  shortcut: string;
  showHistory: boolean;
  showStats: boolean;
};

const DOCK_BUTTON_CLASS =
  "shrink-0 !border-[var(--drift-ui-border)] !bg-[var(--drift-ui-overlay-control)] !text-[var(--drift-ui-ink-soft)] !shadow-none hover:!border-[var(--drift-ui-border-strong)] hover:!bg-[var(--drift-ui-overlay-control-hover)] hover:!text-[var(--drift-ui-ink)] focus-visible:!ring-[color-mix(in_srgb,var(--drift-ui-signal)_25%,transparent)]";

export function OverlayControlDock(props: OverlayControlDockProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <nav
        aria-label="编辑工作台"
        className="drift-theme-transition overlay-control-dock pointer-events-auto absolute bottom-3 left-3 right-3 z-[3] box-border flex min-w-0 select-none items-center gap-2 overflow-hidden rounded-drift border border-[var(--drift-ui-border)] bg-[var(--drift-ui-overlay-glass)] px-2 py-1.5 text-[var(--drift-ui-ink)] shadow-[0_12px_32px_var(--drift-ui-overlay-shadow)] backdrop-blur-[20px]"
        data-drawer-open={props.drawerOpen}
      >
        <strong className="drift-theme-transition overlay-dock-title shrink-0 text-[11px] font-semibold">
          编辑模式
        </strong>
        <span className="drift-data-text drift-theme-transition overlay-dock-shortcut min-w-0 truncate text-[9px] text-[var(--drift-ui-muted)]">
          {props.shortcut}
        </span>
        <span className="min-w-0 flex-1" />
        {props.mockActive !== null ? (
          <span
            className="drift-theme-transition overlay-mock-status flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-[var(--drift-ui-overlay-auxiliary)]"
            data-active={props.mockActive}
          >
            <span
              aria-hidden="true"
              className={classNames(
                "drift-theme-transition overlay-status-dot size-1.5 shrink-0 rounded-full",
                props.mockActive
                  ? "bg-[var(--drift-ui-success)]"
                  : "bg-[var(--drift-ui-disabled)]",
              )}
            />
            Mock · {props.mockActive ? "运行中" : "已停止"}
          </span>
        ) : null}
        <Tooltip content="弹幕历史">
          <Button
            active={props.showHistory}
            aria-label="弹幕历史"
            aria-pressed={props.showHistory}
            className={classNames(
              DOCK_BUTTON_CLASS,
              props.showHistory &&
                "!border-[var(--drift-ui-signal)] !bg-[var(--drift-ui-overlay-selected)] !text-[var(--drift-ui-signal-text)]",
            )}
            onClick={props.onToggleHistory}
            size="sm"
            variant="ghost"
          >
            <History aria-hidden="true" size={13} />
            <span>弹幕历史</span>
          </Button>
        </Tooltip>
        <Tooltip content="弹幕统计">
          <Button
            active={props.showStats}
            aria-label="弹幕统计"
            aria-pressed={props.showStats}
            className={classNames(
              DOCK_BUTTON_CLASS,
              props.showStats &&
                "!border-[var(--drift-ui-signal)] !bg-[var(--drift-ui-overlay-selected)] !text-[var(--drift-ui-signal-text)]",
            )}
            onClick={props.onToggleStats}
            size="sm"
            variant="ghost"
          >
            <BarChart3 aria-hidden="true" size={13} />
            <span>弹幕统计</span>
          </Button>
        </Tooltip>
        <Tooltip content="完成编辑">
          <Button
            aria-label="完成编辑"
            className="shrink-0 !border-[var(--drift-ui-signal)] !bg-[var(--drift-ui-signal)] !text-[var(--drift-ui-on-signal)] !shadow-none hover:!bg-[var(--drift-ui-signal-text)] focus-visible:!ring-[color-mix(in_srgb,var(--drift-ui-signal)_30%,transparent)]"
            onClick={props.onExit}
            size="sm"
            variant="primary"
          >
            <Check aria-hidden="true" size={13} />
            <span>完成</span>
          </Button>
        </Tooltip>
      </nav>
    </TooltipProvider>
  );
}
