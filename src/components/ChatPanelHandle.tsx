import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";

/** Min/max chat panel height (% of viewport) while resizing. */
export const MIN_CHAT_HEIGHT = 30;
export const MAX_CHAT_HEIGHT = 90;

function clamp(pct: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, pct));
}

interface ChatPanelHandleProps {
  /** Current chat panel height (% of viewport). */
  heightPct: number;
  /** Commit a new chat panel height (clamped to MIN..max). */
  onHeightChange: (pct: number) => void;
  /** Whether the chat panel is in full-screen chat-only mode. */
  chatOnly: boolean;
  /** Toggle chat-only mode. */
  onToggleChatOnly: () => void;
  /**
   * Measure the maximum chat height (% of viewport) for the current layout —
   * the chat stops growing when its top reaches the bottom of the video player.
   */
  measureMaxPct: () => number;
}

/**
 * Mobile-only handle bar above the chat panel: a wide drag grabber that
 * resizes the panel height (no snapping, capped so it can't cover the video)
 * and a toggle for full-screen chat-only mode. Hidden on lg+ where the panel
 * is fixed.
 */
export function ChatPanelHandle({
  heightPct,
  onHeightChange,
  chatOnly,
  onToggleChatOnly,
  measureMaxPct,
}: ChatPanelHandleProps) {
  const dragRef = useRef<{
    startY: number;
    startPct: number;
    maxPct: number;
  } | null>(null);

  // Effective max (% of viewport): measured for the current layout, clamped to
  // the hard ceiling.
  const measureMax = useCallback(
    () =>
      Math.min(
        MAX_CHAT_HEIGHT,
        Math.max(MIN_CHAT_HEIGHT, Math.round(measureMaxPct())),
      ),
    [measureMaxPct],
  );

  // Used for the slider's aria-valuemax; refreshed on each interaction.
  const [maxPct, setMaxPct] = useState<number>(MAX_CHAT_HEIGHT);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (chatOnly) return;
      const max = measureMax();
      setMaxPct(max);
      dragRef.current = { startY: e.clientY, startPct: heightPct, maxPct: max };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [chatOnly, heightPct, measureMax],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaPct =
        ((drag.startY - e.clientY) / window.innerHeight) * 100;
      onHeightChange(
        clamp(drag.startPct + deltaPct, MIN_CHAT_HEIGHT, drag.maxPct),
      );
    },
    [onHeightChange],
  );

  // No snapping: release keeps the dragged height exactly as-is.
  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (chatOnly) return;
      const max = measureMax();
      setMaxPct(max);
      let next: number | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "ArrowRight":
          next = heightPct + 5;
          break;
        case "ArrowDown":
        case "ArrowLeft":
          next = heightPct - 5;
          break;
        case "Home":
          next = MIN_CHAT_HEIGHT;
          break;
        case "End":
          next = max;
          break;
        default:
          return;
      }
      e.preventDefault();
      onHeightChange(clamp(next, MIN_CHAT_HEIGHT, max));
    },
    [chatOnly, heightPct, measureMax, onHeightChange],
  );

  return (
    <div className="lg:hidden flex h-6 shrink-0 items-center gap-1 border-t border-border bg-card/50 pl-1.5">
      <div
        role="slider"
        aria-label="Chat panel height"
        aria-valuemin={MIN_CHAT_HEIGHT}
        aria-valuemax={maxPct}
        aria-valuenow={Math.round(heightPct)}
        aria-disabled={chatOnly}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className={`flex h-full flex-1 touch-none items-center justify-center rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
          chatOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        <div className="h-1 w-12 rounded-full bg-muted-foreground/30" />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onToggleChatOnly}
        title={chatOnly ? "Exit chat-only mode" : "Chat-only mode"}
        aria-label={chatOnly ? "Exit chat-only mode" : "Chat-only mode"}
        aria-pressed={chatOnly}
      >
        {chatOnly ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
