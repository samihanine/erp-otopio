import * as C from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ checked, onCheckedChange, className, disabled }: { checked: boolean; onCheckedChange?: (v: boolean) => void; className?: string; disabled?: boolean }) {
  return (
    <C.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[5px] border border-border-strong bg-surface transition data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
    >
      <C.Indicator>
        <Check className="size-3 text-white" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}
