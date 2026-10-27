import type { Server } from "socket.io";
import { createMessage } from "./chat.js";
import db from "./db.js";
import type {
  ChatMessage,
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/types.js";

/** Synthetic `user_id` for server-generated chat lines (a hidden guest user row). */
export const SYSTEM_USER_ID = "system";
/** Display name shown as the author of system messages. */
const SYSTEM_DISPLAY_NAME = "system";
/** Muted gray, so system lines read differently from real users. */
const SYSTEM_USERNAME_COLOR = "#9ca3af";
const SYSTEM_MESSAGE_COLOR = "#9ca3af";

/** Create the hidden guest user that owns persisted system messages. */
export function ensureSystemUser(): void {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(SYSTEM_USER_ID);
  if (existing) return;
  try {
    db.prepare(
      "INSERT INTO users (id, username, is_guest, username_color, message_color) VALUES (?, ?, 1, ?, ?)"
    ).run(SYSTEM_USER_ID, SYSTEM_DISPLAY_NAME, SYSTEM_USERNAME_COLOR, SYSTEM_MESSAGE_COLOR);
  } catch (err) {
    // A real account already owns the "system" username. Announcements then
    // fail to persist (and are skipped) rather than crash the server at boot.
    console.warn("[system] could not create the system user:", err);
  }
}

/**
 * Persist a server-generated chat line and broadcast it to every client.
 *
 * Returns the created message (or null when the content is empty) so callers can
 * additionally forward it, e.g. to the Discord bridge.
 */
export function postSystemMessage(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  content: string
): ChatMessage | null {
  const message = createMessage(
    SYSTEM_USER_ID,
    SYSTEM_DISPLAY_NAME,
    content,
    null,
    null,
    null,
    SYSTEM_USERNAME_COLOR,
    SYSTEM_MESSAGE_COLOR
  );
  if (message) io.emit("chat:message", message);
  return message;
}
