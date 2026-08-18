import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "hikkistream.db");

// Ensure data directory exists
import fs from "fs";
fs.mkdirSync(path.join(__dirname, "..", "data"), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT,
    is_guest INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    is_moderator INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0,
    avatar_url TEXT,
    username_color TEXT DEFAULT '#ffffff',
    message_color TEXT DEFAULT '#d1d5db',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT,
    avatar_url TEXT,
    username_color TEXT DEFAULT '#ffffff',
    message_color TEXT DEFAULT '#d1d5db',
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS stream_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_emojis (
    name TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS banners (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_items (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    label TEXT NOT NULL,
    channel TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER DEFAULT 0,
    added_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: add media columns to existing messages table
const messageCols = db.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
if (!messageCols.some((c) => c.name === "media_url")) {
  db.exec("ALTER TABLE messages ADD COLUMN media_url TEXT");
}
if (!messageCols.some((c) => c.name === "media_type")) {
  db.exec("ALTER TABLE messages ADD COLUMN media_type TEXT");
}

// Migration: add moderator role to existing users table
const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
if (!userCols.some((c) => c.name === "is_moderator")) {
  db.exec("ALTER TABLE users ADD COLUMN is_moderator INTEGER DEFAULT 0");
}

// Migration: add youtube_id column to playlist_items for YouTube video items
const playlistCols = db.prepare("PRAGMA table_info(playlist_items)").all() as { name: string }[];
if (!playlistCols.some((c) => c.name === "youtube_id")) {
  db.exec("ALTER TABLE playlist_items ADD COLUMN youtube_id TEXT");
}

// Seed default stream title if not set
const existingTitle = db.prepare("SELECT value FROM stream_settings WHERE key = 'title'").get();
if (!existingTitle) {
  db.prepare("INSERT INTO stream_settings (key, value) VALUES ('title', 'hikkistream')").run();
}

// Seed the auto-title-from-playlist toggle (default on). When enabled, the
// stream title follows the active playlist item instead of staying manual.
const existingAutoTitle = db.prepare(
  "SELECT value FROM stream_settings WHERE key = 'title_from_playlist'"
).get();
if (!existingAutoTitle) {
  db.prepare("INSERT INTO stream_settings (key, value) VALUES ('title_from_playlist', '1')").run();
}

// Seed the sticky hikkistream playlist item if not present. It is pinned,
// cannot be removed, and is the active item by default.
const existingHikkiItem = db.prepare(
  "SELECT id FROM playlist_items WHERE source = 'hikkistream' LIMIT 1"
).get();
if (!existingHikkiItem) {
  db.prepare(
    "INSERT INTO playlist_items (id, source, label, channel, position, is_active, added_by) VALUES (?, 'hikkistream', 'hikkistream', NULL, 0, 1, 'system')"
  ).run(randomUUID());
}

export default db;
