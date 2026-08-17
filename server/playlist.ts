import { randomUUID } from "crypto";
import db from "./db.js";
import type { PlaylistItem, PlaylistSource } from "../shared/types.js";

const TWITCH_CHANNEL_RE = /^[a-z0-9_]{4,25}$/;
const MAX_ITEMS = 50;

interface DbPlaylistItem {
  id: string;
  source: string;
  label: string;
  channel: string | null;
  position: number;
  is_active: number;
  added_by: string | null;
  created_at: string;
}

function toPlaylistItem(row: DbPlaylistItem): PlaylistItem {
  return {
    id: row.id,
    source: row.source as PlaylistSource,
    label: row.label,
    channel: row.channel,
    is_active: row.is_active === 1,
    added_by: row.added_by ?? "",
    created_at: row.created_at,
  };
}

export function getPlaylistItems(): PlaylistItem[] {
  const rows = db.prepare(
    "SELECT * FROM playlist_items ORDER BY position ASC, created_at ASC"
  ).all() as DbPlaylistItem[];
  return rows.map(toPlaylistItem);
}

export function getActiveItem(): PlaylistItem | null {
  const row = db.prepare(
    "SELECT * FROM playlist_items WHERE is_active = 1 LIMIT 1"
  ).get() as DbPlaylistItem | undefined;
  return row ? toPlaylistItem(row) : null;
}

/**
 * Normalize a Twitch channel input (URL or bare channel name) into a lowercase
 * channel name, or return null if it isn't a valid Twitch channel.
 */
export function normalizeTwitchChannel(input: string): string | null {
  let channel = input.trim();
  if (!channel) return null;

  // Accept full twitch.tv URLs as well as bare channel names.
  const urlMatch = channel.match(
    /^(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]+)(?:\/.*)?$/i
  );
  if (urlMatch) {
    channel = urlMatch[1];
  }

  channel = channel.toLowerCase();
  return TWITCH_CHANNEL_RE.test(channel) ? channel : null;
}

export function addPlaylistItem(data: {
  source: string;
  label?: string;
  channel?: string;
  addedBy?: string;
}): PlaylistItem | { error: string } {
  if (data.source === "hikkistream") {
    return { error: "hikkistream is always in the playlist." };
  }
  if (data.source !== "twitch") {
    return { error: "Unsupported stream source." };
  }

  const channel = normalizeTwitchChannel(data.channel ?? "");
  if (!channel) {
    return { error: "Invalid Twitch channel. Use a channel name or a twitch.tv URL." };
  }

  const existing = db.prepare(
    "SELECT id FROM playlist_items WHERE source = 'twitch' AND channel = ? COLLATE NOCASE"
  ).get(channel);
  if (existing) {
    return { error: "That channel is already in the playlist." };
  }

  const count = db.prepare("SELECT COUNT(*) AS count FROM playlist_items").get() as { count: number };
  if (count.count >= MAX_ITEMS) {
    return { error: `Playlist is full (max ${MAX_ITEMS} items).` };
  }

  const label = (data.label ?? channel).trim().slice(0, 100) || channel;
  const position = db.prepare(
    "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM playlist_items"
  ).get() as { next: number };

  const id = randomUUID();
  db.prepare(
    "INSERT INTO playlist_items (id, source, label, channel, position, added_by) VALUES (?, 'twitch', ?, ?, ?, ?)"
  ).run(id, label, channel, position.next, data.addedBy ?? "");

  const row = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem;
  return toPlaylistItem(row);
}

export function removePlaylistItem(id: string): { ok: true } | { error: string } {
  const row = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem | undefined;
  if (!row) {
    return { error: "Item not found." };
  }
  if (row.source === "hikkistream") {
    return { error: "hikkistream cannot be removed." };
  }
  if (row.is_active === 1) {
    return { error: "Cannot remove the currently playing item. Switch first." };
  }
  db.prepare("DELETE FROM playlist_items WHERE id = ?").run(id);
  return { ok: true };
}

export function switchPlaylistItem(id: string): PlaylistItem | { error: string } {
  const row = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem | undefined;
  if (!row) {
    return { error: "Item not found." };
  }
  db.prepare("UPDATE playlist_items SET is_active = 0").run();
  db.prepare("UPDATE playlist_items SET is_active = 1 WHERE id = ?").run(id);
  // Re-fetch so the returned item reflects the new active state.
  const updated = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem;
  return toPlaylistItem(updated);
}
