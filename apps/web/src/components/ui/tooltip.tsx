import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children, side = "right" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={8} className="z-[60] rounded-md bg-navy px-2 py-1 text-xs font-medium text-white shadow-pop animate-pop dark:bg-zinc-200 dark:text-zinc-900">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
