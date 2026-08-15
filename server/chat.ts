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
  created_at: string;
}

function toMessage(row: DbMessage): ChatMessage {
  return {
    ...row,
    media_type: (row.media_type as MediaType | null) ?? null,
    is_deleted: row.is_deleted === 1,
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

  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as DbMessage;
  return toMessage(row);
}

export function getRecentMessages(limit: number = 50): ChatMessage[] {
  const rows = db.prepare(
    "SELECT * FROM messages WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as DbMessage[];
  return rows.map(toMessage).reverse();
}

export function getMessagesBefore(before: string, limit: number = 50): ChatMessage[] {
  const rows = db.prepare(
    "SELECT * FROM messages WHERE is_deleted = 0 AND created_at < ? ORDER BY created_at DESC LIMIT ?"
  ).all(before, limit) as DbMessage[];
  return rows.map(toMessage).reverse();
}

export function deleteMessage(messageId: string): boolean {
  const result = db.prepare("UPDATE messages SET is_deleted = 1 WHERE id = ?").run(messageId);
  return result.changes > 0;
}

export function deleteUserMessages(userId: string): void {
  db.prepare("UPDATE messages SET is_deleted = 1 WHERE user_id = ?").run(userId);
}
