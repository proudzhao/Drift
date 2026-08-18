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
  signal: { dot: "bg-drift-signal", text: "text-[#8edee8]" },
  success: { dot: "bg-[#42c983]", text: "text-[#78dca5]" },
  warning: { dot: "bg-[#e6a15a]", text: "text-[#e9b779]" },
  danger: { dot: "bg-[#e06c75]", text: "text-[#f0a0a7]" },
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
      <main className="drift-send-shell box-border grid h-full w-full grid-cols-[minmax(0,1fr)] grid-rows-[34px_46px_minmax(0,1fr)] overflow-hidden rounded-[13px] border text-drift-ink">
        <header
          aria-label="拖动发送窗口"
          className="flex cursor-move select-none items-center justify-between gap-3 px-2.5 pl-3"
          onMouseDown={onDragStart}
        >
          <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
            <span className="shrink-0 text-[10px] text-[#789097]">发送到</span>
            <strong className="min-w-0 truncate text-[12px] font-semibold text-drift-ink">
              {targetText}
            </strong>
          </div>
          <Tooltip content="关闭">
            <IconButton
              aria-label="关闭发送窗口"
              className={NO_DRAG_CLASS}
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

        <footer className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-drift-line px-3 text-[10px]">
          <span
            className={classNames(
              "flex min-w-0 items-center gap-2",
              toneClasses.text,
            )}
            data-tone={tone}
            role="status"
          >
            <span
              aria-hidden="true"
              className={classNames(
                "size-1.5 shrink-0 rounded-full",
                toneClasses.dot,
              )}
            />
            <span className="truncate">{feedback || "读取发送状态"}</span>
          </span>
          <span
            className={classNames(
              "drift-data-text whitespace-nowrap text-[#789097]",
              countTone === "warning" && "text-[#e9b779]",
              countTone === "danger" && "text-[#f0a0a7]",
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
