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
          className="z-50 rounded-md border border-drift-line bg-drift-raised px-2 py-1 text-[10px] text-drift-ink shadow-lg"
          sideOffset={6}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-drift-raised" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
