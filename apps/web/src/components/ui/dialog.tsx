import * as Dl from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = Dl.Root;
export const DialogTrigger = Dl.Trigger;
export const DialogClose = Dl.Close;

export function DialogContent({ className, children, title, description, hideClose }: { className?: string; children: ReactNode; title?: ReactNode; description?: ReactNode; hideClose?: boolean }) {
  return (
    <Dl.Portal>
      <Dl.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] animate-fade" />
      <Dl.Content className={cn("fixed left-1/2 top-[14vh] z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-border bg-surface shadow-pop outline-none animate-pop", className)}>
        {title ? (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <Dl.Title className="text-[15px] font-semibold">{title}</Dl.Title>
              {description ? <Dl.Description className="mt-0.5 text-[13px] text-muted">{description}</Dl.Description> : null}
            </div>
            {!hideClose && (
              <Dl.Close className="rounded-md p-1 text-muted hover:bg-hover hover:text-fg">
                <X className="size-4" />
              </Dl.Close>
            )}
          </div>
        ) : (
          <Dl.Title className="sr-only">Dialog</Dl.Title>
        )}
        {children}
      </Dl.Content>
    </Dl.Portal>
  );
}

/** Right-side panel used for record details */
export function Sheet({ open, onOpenChange, children, className }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <Dl.Root open={open} onOpenChange={onOpenChange}>
      <Dl.Portal>
        <Dl.Overlay className="fixed inset-0 z-40 bg-black/10 animate-fade" />
        <Dl.Content
          aria-describedby={undefined}
          className={cn("fixed inset-y-2 right-2 z-40 flex w-[min(96vw,720px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop outline-none animate-slide", className)}
        >
          <Dl.Title className="sr-only">Details</Dl.Title>
          {children}
        </Dl.Content>
      </Dl.Portal>
    </Dl.Root>
  );
}
