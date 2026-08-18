import { useLayoutEffect, useRef, useState } from "react";

/** The player's native aspect ratio (16:9). */
export const PLAYER_ASPECT_RATIO = 16 / 9;

interface AspectFitResult {
  /** Attach to the outer (definitely-sized) container that bounds the box. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Pixel max-width that keeps an inner box at `ratio` fully visible inside
   * the container (fit-to-container). `undefined` until the first measurement,
   * at which point the box can fall back to its full-width `aspect-video` size.
   * Apply as `style={{ maxWidth }}` on the box; it only caps width when the
   * available height runs out, so the CSS-derived height keeps the ratio.
   */
  maxWidth: number | undefined;
}

/**
 * Measures `containerRef`'s box and returns the max width an inner `ratio` box
 * can take while remaining fully visible. Unlike CSS `aspect-ratio` +
 * `max-height` (which distorts when height-constrained), this computes the
 * constraint explicitly so the box always renders at the requested ratio.
 */
export function useAspectFit(ratio: number = PLAYER_ASPECT_RATIO): AspectFitResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [maxWidth, setMaxWidth] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const update = () => {
      const rect = container.getBoundingClientRect();
      // Wait for a real size before committing a fit, so the box never
      // collapses to zero during the initial layout pass.
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      setMaxWidth(Math.min(rect.width, rect.height * ratio));
    };

    // Measure before paint so the first frame is already correctly fitted.
    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [ratio]);

  return { containerRef, maxWidth };
}
