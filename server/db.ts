import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

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
`);

export default db;
