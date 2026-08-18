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
