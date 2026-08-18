import { useEffect, useMemo, useRef, useState } from "react";
import { useCommentFeed } from "@/hooks/useCommentFeed";
import { buildEmojiMap, renderContent } from "@/lib/renderContent";
import type { ChatMessage } from "../../shared/types";

interface CommentSprite {
  key: string;
  lane: number;
  duration: number;
  message: ChatMessage;
}

// Vertical lanes comments are distributed across (as a % of video height).
const LANE_COUNT = 14;
const LANE_TOP_PCT = 4;
const LANE_BOTTOM_PCT = 88;
// Hard cap on simultaneous on-screen comments; the oldest is dropped to make room.
const MAX_COMMENTS = 36;
// Base cross-screen duration (ms); varied per comment for a natural feel.
const BASE_DURATION_MS = 8000;
const DURATION_VARIANCE = 0.25;

function laneTopPct(lane: number): number {
  const usable = LANE_BOTTOM_PCT - LANE_TOP_PCT;
  return LANE_TOP_PCT + (usable * lane) / Math.max(1, LANE_COUNT - 1);
}

interface CommentOverlayProps {
  /** Whether comments are currently enabled (footer toggle). */
  enabled: boolean;
}

/**
 * Niconico-style comment layer: new chat messages scroll right-to-left across
 * the video. Mounted inside a box with the exact same geometry as the player's
 * `aspect-video` container so comments always sit over the video itself.
 */
export function CommentOverlay({ enabled }: CommentOverlayProps) {
  const { comments, customEmojis, paused, ackComments } = useCommentFeed();
  const [sprites, setSprites] = useState<CommentSprite[]>([]);
  const spritesRef = useRef<CommentSprite[]>([]);
  const laneBusyUntilRef = useRef<number[]>(new Array<number>(LANE_COUNT).fill(0));
  const seenRef = useRef<Set<string>>(new Set());
  const emojiMap = useMemo(() => buildEmojiMap(customEmojis), [customEmojis]);

  // While disabled, drop buffered comments so they don't pile up.
  useEffect(() => {
    if (!enabled && comments.length > 0) {
      ackComments(new Set(comments.map((c) => c.id)));
    }
  }, [enabled, comments, ackComments]);

  // Turn newly arrived feed comments into animated sprites.
  useEffect(() => {
    if (!enabled) return;
    const fresh = comments.filter((c) => !seenRef.current.has(c.id));
    if (fresh.length === 0) return;

    const now = performance.now();
    let next = [...spritesRef.current];

    for (const comment of fresh) {
      seenRef.current.add(comment.id);
      const duration =
        BASE_DURATION_MS * (1 + (Math.random() - 0.5) * DURATION_VARIANCE);

      // Assign to the lane whose current occupant finishes soonest, so
      // comments in the same lane never overlap.
      let lane = 0;
      for (let i = 1; i < LANE_COUNT; i++) {
        if (laneBusyUntilRef.current[i] < laneBusyUntilRef.current[lane]) {
          lane = i;
        }
      }
      laneBusyUntilRef.current[lane] = now + duration;

      next.push({
        key: comment.id,
        lane,
        duration,
        message: comment.message,
      });
    }

    // Enforce the on-screen cap by dropping the oldest comments.
    if (next.length > MAX_COMMENTS) {
      next = next.slice(next.length - MAX_COMMENTS);
    }

    spritesRef.current = next;
    setSprites(next);
    ackComments(new Set(seenRef.current));
  }, [comments, enabled, ackComments]);

  const handleAnimationEnd = (key: string) => {
    const next = spritesRef.current.filter((s) => s.key !== key);
    spritesRef.current = next;
    setSprites(next);
  };

  if (!enabled) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      {sprites.map((s) => (
        <div
          key={s.key}
          className={`nico-comment${paused ? " nico-comment-paused" : ""}`}
          style={{
            top: `${laneTopPct(s.lane)}%`,
            color: s.message.message_color,
            animationDuration: `${s.duration}ms`,
          }}
          onAnimationEnd={() => handleAnimationEnd(s.key)}
        >
          {renderContent(s.message.content, emojiMap)}
        </div>
      ))}
    </div>
  );
}
