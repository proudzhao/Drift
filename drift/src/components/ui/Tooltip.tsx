import type { ReactElement, ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

type TooltipProps = {
  children: ReactElement;
  content: ReactNode;
};

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ children, content }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="drift-tooltip z-50 rounded-md border border-[var(--drift-ui-border)] bg-[var(--drift-ui-raised)] px-2 py-1 text-[10px] text-[var(--drift-ui-ink)] shadow-lg"
          sideOffset={6}
        >
          {content}
          <TooltipPrimitive.Arrow className="drift-theme-transition fill-[var(--drift-ui-raised)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
