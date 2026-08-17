import { randomUUID } from "crypto";
import db from "./db.js";
import type { ChatMessage, MediaType } from "../shared/types.js";

interface DbMessage {
  id: string;
  user_id: string;
  username: string;
  content: string;
  media_url: string | null;
  media_type: MediaType | null;
  avatar_url: string | null;
  username_color: string;
  message_color: string;
  is_deleted: number;
  author_is_admin: number;
  author_is_moderator: number;
  created_at: string;
}

/** Shared SELECT with a join to users so each message carries its author's role. */
const MESSAGE_SELECT = `
  SELECT messages.*,
         users.is_admin AS author_is_admin,
         users.is_moderator AS author_is_moderator
  FROM messages
  LEFT JOIN users ON users.id = messages.user_id
`;

function toMessage(row: DbMessage): ChatMessage {
  return {
    ...row,
    media_type: (row.media_type as MediaType | null) ?? null,
    is_deleted: row.is_deleted === 1,
    author_is_admin: row.author_is_admin === 1,
    author_is_moderator: row.author_is_moderator === 1,
  };
}

export function createMessage(
  userId: string,
  username: string,
  content: string,
  mediaUrl: string | null,
  mediaType: MediaType | null,
  avatarUrl: string | null,
  usernameColor: string,
  messageColor: string
): ChatMessage | null {
  content = content.trim();
  const hasMedia = Boolean(mediaUrl && mediaType);
  if ((!content && !hasMedia) || content.length > 500) return null;

  const id = randomUUID();
  db.prepare(
    "INSERT INTO messages (id, user_id, username, content, media_url, media_type, avatar_url, username_color, message_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, username, content, mediaUrl, mediaType, avatarUrl, usernameColor, messageColor);

  const row = db.prepare(`${MESSAGE_SELECT} WHERE messages.id = ?`).get(id) as DbMessage;
  return toMessage(row);
}

export function getRecentMessages(limit: number = 50): ChatMessage[] {
  const rows = db.prepare(
    `${MESSAGE_SELECT} WHERE messages.is_deleted = 0 ORDER BY messages.created_at DESC LIMIT ?`
  ).all(limit) as DbMessage[];
  return rows.map(toMessage).reverse();
}

export function getMessagesBefore(before: string, limit: number = 50): ChatMessage[] {
  const rows = db.prepare(
    `${MESSAGE_SELECT} WHERE messages.is_deleted = 0 AND messages.created_at < ? ORDER BY messages.created_at DESC LIMIT ?`
  ).all(before, limit) as DbMessage[];
  return rows.map(toMessage).reverse();
}

/** Role of a message's author (for moderation permission checks), or null if the message doesn't exist. */
export function getMessageAuthor(messageId: string): {
  user_id: string;
  is_admin: boolean;
  is_moderator: boolean;
} | null {
  const row = db.prepare(
    "SELECT messages.user_id AS user_id, users.is_admin AS is_admin, users.is_moderator AS is_moderator FROM messages LEFT JOIN users ON users.id = messages.user_id WHERE messages.id = ?"
  ).get(messageId) as { user_id: string; is_admin: number; is_moderator: number } | undefined;
  if (!row) return null;
  return {
    user_id: row.user_id,
    is_admin: row.is_admin === 1,
    is_moderator: row.is_moderator === 1,
  };
}

export function deleteMessage(messageId: string): boolean {
  const result = db.prepare("UPDATE messages SET is_deleted = 1 WHERE id = ?").run(messageId);
  return result.changes > 0;
}

export function deleteUserMessages(userId: string): void {
  db.prepare("UPDATE messages SET is_deleted = 1 WHERE user_id = ?").run(userId);
}
