import type { KeyboardEvent, MouseEvent, Ref } from "react";
import { X } from "lucide-react";
import { classNames } from "../utils/classNames";
import { Button, IconButton, Input, Tooltip, TooltipProvider } from "./ui";

const TEXT_LIMIT = 60;
const NO_DRAG_CLASS = "[-webkit-app-region:no-drag]";

export type SendFeedbackTone = "signal" | "success" | "warning" | "danger";

type SendDanmakuViewProps = {
  canSend: boolean;
  feedback: string;
  inputRef: Ref<HTMLInputElement>;
  isSending: boolean;
  onClose: () => void;
  onDragStart: (event: MouseEvent<HTMLElement>) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onTextChange: (text: string) => void;
  remaining: number;
  targetText: string;
  text: string;
  tone: SendFeedbackTone;
};

const TONE_CLASSES: Record<
  SendFeedbackTone,
  { dot: string; text: string }
> = {
  signal: {
    dot: "bg-[var(--drift-ui-signal)]",
    text: "text-[var(--drift-ui-signal-text)]",
  },
  success: {
    dot: "bg-[var(--drift-ui-success)]",
    text: "text-[var(--drift-ui-success)]",
  },
  warning: {
    dot: "bg-[var(--drift-ui-warning)]",
    text: "text-[var(--drift-ui-warning)]",
  },
  danger: {
    dot: "bg-[var(--drift-ui-danger)]",
    text: "text-[var(--drift-ui-danger)]",
  },
};

export function formatRemainingText(remaining: number) {
  return remaining < 0 ? `超出 ${Math.abs(remaining)} 字` : `${remaining} 字可用`;
}

export function SendDanmakuView({
  canSend,
  feedback,
  inputRef,
  isSending,
  onClose,
  onDragStart,
  onInputKeyDown,
  onSend,
  onTextChange,
  remaining,
  targetText,
  text,
  tone,
}: SendDanmakuViewProps) {
  const countTone =
    remaining < 0 ? "danger" : remaining <= 5 ? "warning" : "neutral";
  const toneClasses = TONE_CLASSES[tone];

  return (
    <TooltipProvider delayDuration={300}>
      <main className="drift-send-shell drift-theme-transition box-border grid h-full w-full grid-cols-[minmax(0,1fr)] grid-rows-[34px_46px_minmax(0,1fr)] overflow-hidden rounded-[13px] border text-[var(--drift-ui-ink)]">
        <header
          aria-label="拖动发送窗口"
          className="drift-theme-transition flex cursor-move select-none items-center justify-between gap-3 px-2.5 pl-3"
          onMouseDown={onDragStart}
        >
          <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
            <span className="drift-theme-transition shrink-0 text-[10px] text-[var(--drift-ui-muted)]">
              发送到
            </span>
            <strong className="drift-theme-transition min-w-0 truncate text-[12px] font-semibold text-[var(--drift-ui-ink)]">
              {targetText}
            </strong>
          </div>
          <Tooltip content="关闭">
            <IconButton
              aria-label="关闭发送窗口"
              className={classNames(NO_DRAG_CLASS, "drift-theme-transition")}
              onClick={onClose}
              onMouseDown={(event) => event.stopPropagation()}
              size="sm"
              variant="ghost"
            >
              <X aria-hidden="true" size={14} strokeWidth={1.8} />
            </IconButton>
          </Tooltip>
        </header>

        <div
          className={classNames(
            NO_DRAG_CLASS,
            "grid grid-cols-[minmax(0,1fr)_64px] items-center gap-2 px-3",
          )}
        >
          <Input
            aria-label="弹幕内容"
            aria-invalid={remaining < 0}
            className="h-9 min-h-9"
            invalid={remaining < 0}
            maxLength={TEXT_LIMIT + 8}
            onChange={(event) => onTextChange(event.currentTarget.value)}
            onKeyDown={onInputKeyDown}
            placeholder="输入弹幕内容"
            ref={inputRef}
            value={text}
          />
          <Button
            className="h-9 min-h-9 w-16"
            disabled={!canSend || isSending}
            onClick={onSend}
            variant="primary"
          >
            {isSending ? "发送中" : "发送"}
          </Button>
        </div>

        <footer className="drift-theme-transition grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--drift-ui-line)] px-3 text-[10px]">
          <span
            className={classNames(
              "drift-theme-transition flex min-w-0 items-center gap-2",
              toneClasses.text,
            )}
            data-tone={tone}
            role="status"
          >
            <span
              aria-hidden="true"
              className={classNames(
                "drift-theme-transition size-1.5 shrink-0 rounded-full",
                toneClasses.dot,
              )}
            />
            <span className="truncate">{feedback || "读取发送状态"}</span>
          </span>
          <span
            className={classNames(
              "drift-data-text drift-theme-transition whitespace-nowrap text-[var(--drift-ui-muted)]",
              countTone === "warning" && "text-[var(--drift-ui-warning)]",
              countTone === "danger" && "text-[var(--drift-ui-danger)]",
            )}
            data-count-tone={countTone}
          >
            {formatRemainingText(remaining)}
          </span>
        </footer>
      </main>
    </TooltipProvider>
  );
}
