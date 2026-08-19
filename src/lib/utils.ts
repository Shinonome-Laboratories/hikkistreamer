import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** localStorage key for the niconico comments overlay toggle. */
export const COMMENTS_KEY = "hikkistream:comments"

/** Read the persisted comments-overlay preference (defaults to on). */
export function readCommentsEnabled(): boolean {
  try {
    return localStorage.getItem(COMMENTS_KEY) !== "0"
  } catch {
    return true
  }
}

/** Position of the stream footer: below or above the video. */
export type FooterPosition = "top" | "bottom"

/** localStorage key for the footer position toggle. */
export const FOOTER_POSITION_KEY = "hikkistream:footerPosition"

/** Read the persisted footer position preference (defaults to bottom). */
export function readFooterPosition(): FooterPosition {
  try {
    return localStorage.getItem(FOOTER_POSITION_KEY) === "top" ? "top" : "bottom"
  } catch {
    return "bottom"
  }
}

/** localStorage key for the chat timestamps display toggle. */
export const TIMESTAMPS_KEY = "hikkistream:timestamps"

/** Read the persisted show-timestamps preference (defaults to off). */
export function readTimestampsEnabled(): boolean {
  try {
    return localStorage.getItem(TIMESTAMPS_KEY) === "1"
  } catch {
    return false
  }
}

/** Default mobile chat panel height (percent of viewport height). */
export const DEFAULT_CHAT_HEIGHT = 50

/** localStorage key for the mobile chat panel height (percent). */
export const CHAT_HEIGHT_KEY = "hikkistream:chatHeight"

/** Read the persisted mobile chat panel height (defaults to 50, clamped 30-90). */
export function readChatHeight(): number {
  try {
    const raw = Number.parseInt(
      localStorage.getItem(CHAT_HEIGHT_KEY) ?? "",
      10,
    )
    if (Number.isFinite(raw)) return Math.min(90, Math.max(30, raw))
    return DEFAULT_CHAT_HEIGHT
  } catch {
    return DEFAULT_CHAT_HEIGHT
  }
}

/** localStorage key for the mobile chat-only mode toggle. */
export const CHAT_ONLY_KEY = "hikkistream:chatOnly"

/** Read the persisted chat-only preference (defaults to off). */
export function readChatOnly(): boolean {
  try {
    return localStorage.getItem(CHAT_ONLY_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Format a chat message's `created_at` for display as local time HH:MM.
 *
 * Messages arrive in two formats: persisted messages store SQLite
 * `datetime('now')` output ("YYYY-MM-DD HH:MM:SS", UTC, no T/Z), while
 * live-bridged messages (Twitch/Discord) use ISO-8601. Returns null when the
 * value can't be parsed (callers should render nothing).
 */
export function formatTimestamp(createdAt: string): string | null {
  const normalized = createdAt.includes("T")
    ? createdAt
    : `${createdAt.replace(" ", "T")}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
