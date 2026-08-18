import { randomUUID } from "crypto";
import db from "./db.js";
import type { PlaylistItem, PlaylistSource } from "../shared/types.js";

const TWITCH_CHANNEL_RE = /^[a-z0-9_]{4,25}$/;
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const MAX_ITEMS = 50;

/** Parse a YouTube URL or bare 11-char video ID into the canonical video ID. */
export function parseYoutubeId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (YOUTUBE_ID_RE.test(value)) return value;

  const urlMatch = value.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return urlMatch ? urlMatch[1] : null;
}

/**
 * Fetch YouTube video metadata (title, thumbnail) via the oEmbed endpoint.
 * Returns null when the video can't be resolved.
 */
export async function fetchYoutubeMetadata(
  videoId: string
): Promise<{ title: string; thumbnail: string | null } | null> {
  try {
    const url =
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; thumbnail_url?: string };
    return {
      title: (data.title ?? "").trim(),
      thumbnail: data.thumbnail_url ?? null,
    };
  } catch {
    return null;
  }
}

interface DbPlaylistItem {
  id: string;
  source: string;
  label: string;
  channel: string | null;
  youtube_id: string | null;
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
    youtube_id: row.youtube_id,
    position: row.position,
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

export async function addPlaylistItem(data: {
  source: string;
  label?: string;
  channel?: string;
  url?: string;
  addedBy?: string;
}): Promise<PlaylistItem | { error: string }> {
  if (data.source === "hikkistream") {
    return { error: "hikkistream is always in the playlist." };
  }
  if (data.source === "youtube") {
    const videoId = parseYoutubeId(data.url ?? data.channel ?? "");
    if (!videoId) {
      return { error: "Invalid YouTube video. Use a video URL or a video ID." };
    }

    const existing = db.prepare(
      "SELECT id FROM playlist_items WHERE source = 'youtube' AND youtube_id = ?"
    ).get(videoId);
    if (existing) {
      return { error: "That video is already in the playlist." };
    }

    const count = db.prepare("SELECT COUNT(*) AS count FROM playlist_items").get() as { count: number };
    if (count.count >= MAX_ITEMS) {
      return { error: `Playlist is full (max ${MAX_ITEMS} items).` };
    }

    const metadata = await fetchYoutubeMetadata(videoId);
    const label = (metadata?.title ?? data.label ?? videoId).trim().slice(0, 100) || videoId;
    const position = db.prepare(
      "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM playlist_items"
    ).get() as { next: number };

    const id = randomUUID();
    db.prepare(
      "INSERT INTO playlist_items (id, source, label, channel, youtube_id, position, added_by) VALUES (?, 'youtube', ?, NULL, ?, ?, ?)"
    ).run(id, label, videoId, position.next, data.addedBy ?? "");
    console.log(`[playlist] add youtube "${label}" id=${id.slice(0, 8)} pos=${position.next}`);
    const row = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem;
    return toPlaylistItem(row);
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
    console.log(`[playlist] add twitch "${label}" id=${id.slice(0, 8)} pos=${position.next}`);
  const row = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem;
  return toPlaylistItem(row);
}

export function removePlaylistItem(id: string): { ok: true; removed: PlaylistItem } | { error: string } {
  const row = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem | undefined;
  if (!row) {
    return { error: "Item not found." };
  }
  if (row.source === "hikkistream") {
    return { error: "hikkistream cannot be removed." };
  }
  db.prepare("DELETE FROM playlist_items WHERE id = ?").run(id);
  console.log(
    `[playlist] remove "${row.label}" (${row.source}, pos ${row.position}, wasActive=${row.is_active === 1}) id=${id.slice(0, 8)}`
  );
  return { ok: true, removed: toPlaylistItem(row) };
}

/**
 * Activate the next item after `afterPosition` in the queue. Falls back to the
 * sticky hikkistream item (then the lowest-position item) when nothing follows.
 */
export function advancePlaylist(afterPosition: number): PlaylistItem | null {
  const remaining = db.prepare(
    "SELECT * FROM playlist_items ORDER BY position ASC, created_at ASC"
  ).all() as DbPlaylistItem[];
  const next =
    remaining.find((row) => row.position > afterPosition) ??
    remaining.find((row) => row.source === "hikkistream") ??
    remaining[0] ??
    null;

  console.log(
    `[playlist] advancePlaylist(afterPosition=${afterPosition}) -> ${
      next ? `"${next.label}" (${next.source}, pos ${next.position})` : "null"
    } | remaining: ${
      remaining.length
        ? remaining.map((r) => `"${r.label}"@${r.position}`).join(", ")
        : "(empty)"
    }`
  );

  if (!next) return null;

  db.prepare("UPDATE playlist_items SET is_active = 0").run();
  db.prepare("UPDATE playlist_items SET is_active = 1 WHERE id = ?").run(next.id);
  const updated = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(next.id) as DbPlaylistItem;
  return toPlaylistItem(updated);
}

export function switchPlaylistItem(id: string): PlaylistItem | { error: string } {
  const row = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem | undefined;
  if (!row) {
    return { error: "Item not found." };
  }
  console.log(`[playlist] switch to "${row.label}" (${row.source}, pos ${row.position}) id=${id.slice(0, 8)}`);
  db.prepare("UPDATE playlist_items SET is_active = 0").run();
  db.prepare("UPDATE playlist_items SET is_active = 1 WHERE id = ?").run(id);
  // Re-fetch so the returned item reflects the new active state.
  const updated = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(id) as DbPlaylistItem;
  return toPlaylistItem(updated);
}

/**
 * Move an item to a new queue position (0-based index within the current
 * ordered list) and renumber every item's `position` so the order stays
 * contiguous. The sticky hikkistream item is pinned to position 0 and cannot
 * be moved. Reordering never changes which item is active.
 */
export function reorderPlaylistItem(
  id: string,
  targetPosition: number
): { ok: true } | { error: string } {
  const items = getPlaylistItems();
  const item = items.find((row) => row.id === id);
  if (!item) {
    return { error: "Item not found." };
  }
  if (item.source === "hikkistream") {
    return { error: "hikkistream is pinned to the top and cannot be reordered." };
  }

  const from = items.findIndex((row) => row.id === id);
  let to = Number.isFinite(targetPosition) ? Math.trunc(targetPosition) : from;
  to = Math.max(0, Math.min(items.length - 1, to));
  // Keep the sticky hikkistream item at the very front of the queue.
  if (items[0]?.source === "hikkistream") {
    to = Math.max(1, to);
  }
  if (to === from) return { ok: true };

  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);

  console.log(
    `[playlist] reorder "${moved.label}" (${moved.source}) ${from} -> ${to} | ` +
      items.map((row, i) => `${row.label}@${i}`).join(", ")
  );

  const renumber = db.transaction(() => {
    for (let i = 0; i < items.length; i++) {
      db.prepare("UPDATE playlist_items SET position = ? WHERE id = ?").run(i, items[i].id);
    }
  });
  renumber();
  return { ok: true };
}
