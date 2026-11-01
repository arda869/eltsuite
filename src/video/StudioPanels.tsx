import { useEffect, useRef, useState, type CSSProperties } from "react";
export type StudioLayout = {
  library: number;
  inspector: number;
  timeline: number;
};
const defaults = (): StudioLayout => ({
  library: 280,
  inspector: 240,
  timeline: Math.round(window.innerHeight * 0.32),
});
const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(min, n), Math.max(min, max));
export function fitStudioPanels(
  layout: StudioLayout,
  viewport: { width: number; height: number },
  inspectorOpen: boolean,
) {
  const available = viewport.width - (inspectorOpen ? 14 : 7) - 300;
  const inspectorWanted = clamp(
    layout.inspector,
    180,
    Math.min(500, available - 180),
  );
  const libraryLimit = Math.max(
    180,
    Math.min(600, available - (inspectorOpen ? inspectorWanted : 0)),
  );
  const library = clamp(layout.library, 180, libraryLimit);
  const limits = {
    library: libraryLimit,
    inspector: Math.max(180, Math.min(500, available - library)),
    timeline: Math.max(150, viewport.height - 330),
  };
  const sizes = {
    library,
    inspector: clamp(layout.inspector, 180, limits.inspector),
    timeline: clamp(layout.timeline, 150, limits.timeline),
  };
  return { sizes, limits };
}
export function useStudioPanels(inspectorOpen: boolean) {
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [layout, setLayout] = useState<StudioLayout>(() => {
    const d = defaults();
    try {
      const saved = JSON.parse(
        localStorage.getItem("ll.videoPanelLayout") || "{}",
      );
      return Object.fromEntries(
        Object.entries(d).map(([key, value]) => [
          key,
          Number.isFinite(saved[key]) ? saved[key] : value,
        ]),
      ) as StudioLayout;
    } catch {
      return d;
    }
  });
  useEffect(() => {
    const resize = () =>
      setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ll.videoPanelLayout", JSON.stringify(layout));
    } catch {
      /* Layout persistence is optional. */
    }
  }, [layout]);
  const change = (key: keyof StudioLayout, value: number) =>
    setLayout((current) => ({ ...current, [key]: value }));
  const reset = () => setLayout(defaults());
  const { sizes, limits } = fitStudioPanels(layout, viewport, inspectorOpen);
  return {
    sizes,
    limits,
    change,
    reset,
    style: {
      "--vx-library-width": `${sizes.library}px`,
      "--vx-inspector-width": `${sizes.inspector}px`,
      "--vx-timeline-height": `${sizes.timeline}px`,
    } as CSSProperties,
  };
}
export function StudioDivider({
  label,
  orientation,
  value,
  min,
  max,
  direction = 1,
  onChange,
  onReset,
}: {
  label: string;
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  direction?: number;
  onChange: (n: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  return (
    <div
      className={`vx-divider ${orientation}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={`${label}. Drag or use arrow keys. Double-click to reset.`}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          start: orientation === "vertical" ? e.clientX : e.clientY,
          value,
        };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const point = orientation === "vertical" ? e.clientX : e.clientY;
        onChange(
          clamp(
            drag.current.value + (point - drag.current.start) * direction,
            min,
            max,
          ),
        );
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        const minus = orientation === "vertical" ? "ArrowLeft" : "ArrowUp",
          plus = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
        if (e.key === minus || e.key === plus) {
          e.preventDefault();
          e.stopPropagation();
          onChange(
            clamp(
              value +
                (e.key === minus ? -1 : 1) * (e.shiftKey ? 1 : 10) * direction,
              min,
              max,
            ),
          );
        }
        if (e.key === "Home") {
          e.preventDefault();
          e.stopPropagation();
          onChange(min);
        }
        if (e.key === "End") {
          e.preventDefault();
          e.stopPropagation();
          onChange(max);
        }
      }}
    >
      <span />
    </div>
  );
}
