import { useEffect, useMemo, useRef } from "react";

/**
 * An iOS-style looping scroll wheel. The options are repeated many times so the
 * user can spin freely; on settle we snap to the centred item, report it, and
 * seamlessly recenter to keep the loop effectively endless.
 */
export default function WheelPicker({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: number }[];
  value: number;
  onChange: (value: number) => void;
}) {
  const ITEM = 36;
  const VISIBLE = 5;
  // Enough repeats that no single fling can reach either end before the wheel
  // settles and recentres, without mounting a needless pile of DOM: from the
  // middle copy there are seven copies of runway each way (~6000px), several
  // times the distance a flick actually travels.
  const COPIES = 15;
  const len = options.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const middleStart = Math.floor(COPIES / 2) * len;

  const list = useMemo(
    () => Array.from({ length: COPIES * len }, (_, i) => options[i % len]),
    [options, len],
  );

  // Centre the current value when the wheel first mounts.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const optIdx = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    el.scrollTop = (middleStart + optIdx) * ITEM;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const absIdx = Math.round(el.scrollTop / ITEM);
      const optIdx = ((absIdx % len) + len) % len;
      // CSS scroll-snap has already settled the wheel on an item, so the only
      // reason to touch scrollTop is drifting near either end of the repeats —
      // writing it every time just fought the browser's own snapping.
      if (absIdx < len || absIdx >= (COPIES - 1) * len) {
        el.scrollTop = (middleStart + optIdx) * ITEM;
      }
      if (options[optIdx].value !== value) onChange(options[optIdx].value);
    }, 90);
  }

  const pad = ((VISIBLE - 1) / 2) * ITEM;

  return (
    <div className="relative" style={{ height: VISIBLE * ITEM }}>
      {/* Centre selection band */}
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-md border-y border-primary/40 bg-primary/5"
        style={{ height: ITEM }}
      />
      {/* Fade top/bottom for the wheel illusion */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-9 bg-gradient-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-9 bg-gradient-to-t from-card to-transparent" />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "y mandatory" }}
      >
        <div style={{ paddingTop: pad, paddingBottom: pad }}>
          {list.map((o, i) => (
            <div
              key={i}
              className="flex items-center justify-center text-sm text-foreground"
              style={{ height: ITEM, scrollSnapAlign: "center" }}
            >
              {o.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
