/**
 * Deterministic name colors for bridged users.
 *
 * Users bridged in from another platform (Discord) have no hikkichat account and
 * so can't customize their own colors. Hashing the display name to a hue gives
 * every bridged user a stable color — the same name always posts in the same
 * color, across restarts and in stored history — while different names stay
 * visually distinguishable in chat.
 */

/** Saturation/lightness of generated colors, tuned to stay readable on the dark chat background. */
const SATURATION = 0.65;
const LIGHTNESS = 0.7;

/**
 * FNV-1a (32-bit): tiny, dependency-free and well spread for short strings like
 * display names. Unlike a naive character sum it doesn't collapse anagrams
 * ("abc" / "cba") onto the same color.
 */
function hashName(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Convert an HSL color (h in degrees, s/l in 0-1) to the `#rrggbb` form the chat colors use. */
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * A stable `#rrggbb` color for a bridged user's display name. Case and
 * surrounding whitespace are ignored, so the same person keeps one color even
 * when Discord reports their name with different casing.
 */
export function nameColorFor(name: string): string {
  const hue = hashName(name.trim().toLowerCase()) % 360;
  return hslToHex(hue, SATURATION, LIGHTNESS);
}
