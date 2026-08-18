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
