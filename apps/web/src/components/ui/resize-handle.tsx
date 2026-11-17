/** Vertical drag handle on the right edge of a side panel (double-click resets the width). */
export function ResizeHandle({ onPointerDown, onReset }: { onPointerDown: (e: React.PointerEvent) => void; onReset?: () => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      className="group absolute -right-1.5 top-0 z-20 h-full w-3 cursor-col-resize"
      title="↔"
    >
      <div className="mx-auto h-full w-px bg-transparent transition group-hover:w-0.5 group-hover:bg-accent/60 group-active:bg-accent" />
    </div>
  );
}
