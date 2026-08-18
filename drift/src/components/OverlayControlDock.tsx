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
  "shrink-0 !border-[#29414a] !bg-[rgba(14,29,34,.88)] !text-[#c7dadd] !shadow-none hover:!border-[#3a5964] hover:!bg-[#14272d] hover:!text-[#eaf6f7] focus-visible:!ring-[#32c7d9]/25";

export function OverlayControlDock(props: OverlayControlDockProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <nav
        aria-label="编辑工作台"
        className="overlay-control-dock pointer-events-auto absolute bottom-3 left-3 right-3 z-[3] box-border flex min-w-0 select-none items-center gap-2 overflow-hidden rounded-drift border border-[#29414a] bg-[rgba(7,16,20,.92)] px-2 py-1.5 text-[#eaf6f7] shadow-[0_12px_32px_rgba(0,0,0,.32)] backdrop-blur-[20px]"
        data-drawer-open={props.drawerOpen}
      >
        <strong className="overlay-dock-title shrink-0 text-[11px] font-semibold">
          编辑模式
        </strong>
        <span className="drift-data-text overlay-dock-shortcut min-w-0 truncate text-[9px] text-[#789097]">
          {props.shortcut}
        </span>
        <span className="min-w-0 flex-1" />
        {props.mockActive !== null ? (
          <span
            className="overlay-mock-status flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-[#9db3b8]"
            data-active={props.mockActive}
          >
            <span
              aria-hidden="true"
              className={classNames(
                "overlay-status-dot size-1.5 shrink-0 rounded-full",
                props.mockActive ? "bg-[#42c983]" : "bg-[#506970]",
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
                "!border-[#32c7d9] !bg-[rgba(50,199,217,.16)] !text-[#62d7e4]",
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
                "!border-[#32c7d9] !bg-[rgba(50,199,217,.16)] !text-[#62d7e4]",
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
            className="shrink-0 !border-[#32c7d9] !bg-[#32c7d9] !text-[#071014] !shadow-none hover:!bg-[#62d7e4] focus-visible:!ring-[#32c7d9]/30"
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
