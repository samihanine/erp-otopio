import * as P from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export const PopoverContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof P.Content>>(({ className, align = "start", sideOffset = 6, ...props }, ref) => (
  <P.Portal>
    <P.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn("z-50 rounded-xl border border-border bg-surface p-1.5 text-fg shadow-pop outline-none animate-pop", className)}
      {...props}
    />
  </P.Portal>
));
PopoverContent.displayName = "PopoverContent";
