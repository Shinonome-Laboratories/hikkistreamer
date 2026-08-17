import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import db from "./db.js";
import type { RegisteredUser, User } from "../shared/types.js";

interface DbUser {
  id: string;
  username: string;
  password_hash: string | null;
  is_guest: number;
  is_admin: number;
  is_moderator: number;
  is_banned: number;
  avatar_url: string | null;
  username_color: string;
  message_color: string;
  created_at: string;
}

interface DbRegisteredUser {
  id: string;
  username: string;
  is_admin: number;
  is_moderator: number;
}

function toUser(row: DbUser): User {
  return {
    id: row.id,
    username: row.username,
    is_guest: row.is_guest === 1,
    is_admin: row.is_admin === 1,
    is_moderator: row.is_moderator === 1,
    avatar_url: row.avatar_url,
    username_color: row.username_color,
    message_color: row.message_color,
  };
}

function isFirstUser(): boolean {
  const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_guest = 0").get() as { count: number };
  return row.count === 0;
}

export function register(username: string, password: string): { user: User; token: string } | { error: string } {
  username = username.trim();
  if (!username || username.length < 2 || username.length > 24) {
    return { error: "Username must be 2-24 characters." };
  }
  if (!password || password.length < 4) {
    return { error: "Password must be at least 4 characters." };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { error: "Username can only contain letters, numbers, underscores, and hyphens." };
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return { error: "Username already taken." };
  }

  const id = randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  const firstUser = isFirstUser();

  db.prepare(
    "INSERT INTO users (id, username, password_hash, is_guest, is_admin, username_color, message_color) VALUES (?, ?, ?, 0, ?, '#ffffff', '#d1d5db')"
  ).run(id, username, hash, firstUser ? 1 : 0);

  const token = randomUUID();
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, id);

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser;
  return { user: toUser(row), token };
}

export function login(username: string, password: string): { user: User; token: string } | { error: string } {
  const row = db.prepare("SELECT * FROM users WHERE username = ? AND is_guest = 0").get(username) as DbUser | undefined;
  if (!row) {
    return { error: "Invalid username or password." };
  }
  if (row.is_banned) {
    return { error: "You are banned." };
  }
  if (!row.password_hash || !bcrypt.compareSync(password, row.password_hash)) {
    return { error: "Invalid username or password." };
  }

  const token = randomUUID();
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, row.id);

  return { user: toUser(row), token };
}

export function guestLogin(username: string): { user: User; token: string } | { error: string } {
  username = username.trim();
  if (!username || username.length < 2 || username.length > 24) {
    return { error: "Username must be 2-24 characters." };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { error: "Username can only contain letters, numbers, underscores, and hyphens." };
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return { error: "Username already taken." };
  }

  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, is_guest, username_color, message_color) VALUES (?, ?, 1, '#9ca3af', '#d1d5db')"
  ).run(id, username);

  const token = randomUUID();
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, id);

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser;
  return { user: toUser(row), token };
}

export function authenticateToken(token: string): User | null {
  const session = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token) as { user_id: string } | undefined;
  if (!session) return null;

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as DbUser | undefined;
  if (!row || row.is_banned) return null;

  return toUser(row);
}

export function getUserById(id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
  if (!row) return null;
  return toUser(row);
}

export function updateCustomization(
  userId: string,
  data: { avatar_url?: string | null; username_color?: string; message_color?: string }
): User | null {
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (data.avatar_url !== undefined) {
    updates.push("avatar_url = ?");
    values.push(data.avatar_url);
  }
  if (data.username_color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(data.username_color)) return null;
    updates.push("username_color = ?");
    values.push(data.username_color);
  }
  if (data.message_color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(data.message_color)) return null;
    updates.push("message_color = ?");
    values.push(data.message_color);
  }

  if (updates.length === 0) return getUserById(userId);

  values.push(userId);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getUserById(userId);
}

export function banUser(userId: string): boolean {
  db.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").run(userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return true;
}

export function unbanUser(userId: string): boolean {
  db.prepare("UPDATE users SET is_banned = 0 WHERE id = ?").run(userId);
  return true;
}

/** List all registered (non-guest) accounts for moderator management. */
export function getRegisteredUsers(): RegisteredUser[] {
  const rows = db.prepare(
    "SELECT id, username, is_admin, is_moderator FROM users WHERE is_guest = 0 ORDER BY username COLLATE NOCASE ASC"
  ).all() as DbRegisteredUser[];
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    is_admin: row.is_admin === 1,
    is_moderator: row.is_moderator === 1,
  }));
}

/**
 * Promote or demote a user's moderator status. Returns the updated user, or
 * null when the target doesn't exist, is a guest, or is an admin (admins are
 * always staff and cannot be toggled).
 */
export function setModerator(userId: string, isModerator: boolean): User | null {
  const row = db.prepare(
    "SELECT id FROM users WHERE id = ? AND is_guest = 0 AND is_admin = 0"
  ).get(userId) as { id: string } | undefined;
  if (!row) return null;
  db.prepare("UPDATE users SET is_moderator = ? WHERE id = ?").run(isModerator ? 1 : 0, userId);
  return getUserById(userId);
}

export function isUserBanned(userId: string): boolean {
  const row = db.prepare("SELECT is_banned FROM users WHERE id = ?").get(userId) as { is_banned: number } | undefined;
  return row?.is_banned === 1;
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
