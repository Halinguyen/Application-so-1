"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

const POPOVER_WIDTH = 260;
const MARGIN = 8;

// Wraps a tile and shows `hint` in a floating card while the pointer is over
// it, so the explanation doesn't take up room inside the tile itself. The card
// is position:fixed (computed from the tile's rect on enter) so the tile's
// overflow:hidden can't clip it and it stays inside the viewport at the
// left/right edges. It sits above the tile, or below when there's no room.
export default function HoverHint({
  hint,
  className,
  style,
  children,
}: {
  hint: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(r.left + r.width / 2 - POPOVER_WIDTH / 2, MARGIN),
      window.innerWidth - POPOVER_WIDTH - MARGIN
    );
    const above = r.top > window.innerHeight / 2;
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  }

  return (
    <div
      className={className}
      style={style}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <div
          role="tooltip"
          className="hover-hint"
          style={{
            left: pos.left,
            top: pos.top,
            width: POPOVER_WIDTH,
            transform: pos.above ? "translateY(-100%)" : undefined,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
