import * as D from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export const Dropdown = D.Root;
export const DropdownTrigger = D.Trigger;
export const DropdownSub = D.Sub;

export const DropdownContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.Content>>(({ className, sideOffset = 6, align = "start", ...props }, ref) => (
  <D.Portal>
    <D.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn("z-50 min-w-48 rounded-xl border border-border bg-surface p-1 text-fg shadow-pop animate-pop", className)}
      {...props}
    />
  </D.Portal>
));
DropdownContent.displayName = "DropdownContent";

const itemCls =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted";

export const DropdownItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.Item> & { danger?: boolean }>(({ className, danger, ...props }, ref) => (
  <D.Item ref={ref} className={cn(itemCls, danger && "text-rose-600 [&_svg]:text-rose-500", className)} {...props} />
));
DropdownItem.displayName = "DropdownItem";

export const DropdownCheckItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.CheckboxItem>>(({ className, children, ...props }, ref) => (
  <D.CheckboxItem ref={ref} className={cn(itemCls, "pr-7", className)} {...props}>
    {children}
    <D.ItemIndicator className="absolute right-2">
      <Check className="!text-fg" />
    </D.ItemIndicator>
  </D.CheckboxItem>
));
DropdownCheckItem.displayName = "DropdownCheckItem";

export const DropdownSubTrigger = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.SubTrigger>>(({ className, children, ...props }, ref) => (
  <D.SubTrigger ref={ref} className={cn(itemCls, "data-[state=open]:bg-hover", className)} {...props}>
    {children}
    <ChevronRight className="ml-auto" />
  </D.SubTrigger>
));
DropdownSubTrigger.displayName = "DropdownSubTrigger";

export const DropdownSubContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.SubContent>>(({ className, ...props }, ref) => (
  <D.Portal>
    <D.SubContent ref={ref} className={cn("z-50 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-pop animate-pop", className)} {...props} />
  </D.Portal>
));
DropdownSubContent.displayName = "DropdownSubContent";

export const DropdownLabel = ({ className, ...p }: ComponentPropsWithoutRef<typeof D.Label>) => (
  <D.Label className={cn("px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle", className)} {...p} />
);
export const DropdownSeparator = ({ className, ...p }: ComponentPropsWithoutRef<typeof D.Separator>) => (
  <D.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...p} />
);
