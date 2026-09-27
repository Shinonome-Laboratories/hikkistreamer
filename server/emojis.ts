import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db.js";
import type { CustomEmoji } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Directory backing the `/emojis` static route (admin uploads + bridged emotes). */
export const emojisDir = path.join(__dirname, "..", "data", "emojis");
fs.mkdirSync(emojisDir, { recursive: true });

/** Discord's emote image CDN. Emote ids are snowflakes; images here don't expire. */
const DISCORD_EMOJI_CDN = "https://cdn.discordapp.com/emojis";
/** Max size of a single emote image we will import (mirrors the admin upload cap). */
const MAX_EMOJI_BYTES = 1024 * 1024;
/** File extensions we may write for a custom emoji. */
const EMOJI_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "avif"];
/** Extensions by the content-type Discord serves emotes with. */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/avif": "avif",
};
/** Local emoji names must satisfy the same rule as admin uploads. */
const EMOJI_NAME_MAX = 32;

export function getCustomEmojis(): CustomEmoji[] {
  return db.prepare("SELECT name, url FROM custom_emojis ORDER BY created_at ASC").all() as CustomEmoji[];
}

export function registerCustomEmoji(name: string, url: string): void {
  db.prepare("INSERT OR REPLACE INTO custom_emojis (name, url) VALUES (?, ?)").run(name, url);
}

/**
 * Remove a custom emoji everywhere: its row, any bridged-emoji mapping that
 * owns the name, and its file on disk. Keeps the in-memory caches coherent so a
 * later bridge doesn't silently reuse a name whose file is gone.
 */
export function deleteCustomEmoji(name: string): void {
  db.prepare("DELETE FROM custom_emojis WHERE name = ?").run(name);
  const owned = db
    .prepare("SELECT discord_id FROM discord_emojis WHERE name = ?")
    .get(name) as { discord_id: string } | undefined;
  if (owned) {
    db.prepare("DELETE FROM discord_emojis WHERE discord_id = ?").run(owned.discord_id);
    emojiNameCache.delete(owned.discord_id);
  }
  for (const ext of EMOJI_EXTENSIONS) {
    const filePath = path.join(emojisDir, `${name}.${ext}`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

/** Result of importing a Discord emote: its local `:name:` and whether it was newly created. */
export interface ImportedEmoji {
  name: string;
  created: boolean;
}

/** Discord emote id -> local custom emoji name, so an emote is only fetched once. */
const emojiNameCache = new Map<string, string>();
/** In-flight imports, so concurrent messages don't fetch the same emote twice. */
const inFlightImports = new Map<string, Promise<ImportedEmoji | null>>();

function lookupImportedName(discordId: string): string | null {
  const cached = emojiNameCache.get(discordId);
  if (cached) return cached;
  const row = db
    .prepare("SELECT name FROM discord_emojis WHERE discord_id = ?")
    .get(discordId) as { name: string } | undefined;
  if (!row) return null;
  emojiNameCache.set(discordId, row.name);
  return row.name;
}

/**
 * A local name is free when it is unused, or already owned by this same Discord
 * emote (an idempotent re-import). A name owned by a user-uploaded emoji is
 * considered taken — bridging must never clobber an admin's emoji.
 */
function isNameFree(name: string, discordId: string): boolean {
  const owner = db
    .prepare("SELECT discord_id FROM discord_emojis WHERE name = ?")
    .get(name) as { discord_id: string } | undefined;
  if (owner) return owner.discord_id === discordId;
  const taken = db.prepare("SELECT 1 FROM custom_emojis WHERE name = ?").get(name);
  return !taken;
}

/** Derive a collision-free local name from a Discord emote's shorthand. */
function pickLocalName(rawName: string, discordId: string): string {
  const sanitized = rawName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, EMOJI_NAME_MAX);
  const base = sanitized || `emote_${discordId.slice(-4)}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? `_${discordId.slice(-4)}` : `_${discordId.slice(-4)}_${attempt}`;
    const candidate =
      attempt === 0 ? base : `${base.slice(0, Math.max(1, EMOJI_NAME_MAX - suffix.length))}${suffix}`;
    if (isNameFree(candidate, discordId)) return candidate;
  }
  return `emote_${discordId}`.slice(0, EMOJI_NAME_MAX);
}

/**
 * Download a Discord custom emote and register it as a local custom emoji so
 * bridged messages can render it through the normal `:name:` pipeline. Like
 * bridged attachments, the image is re-hosted under /emojis/ so it stays
 * available even if the emote is later removed from Discord.
 *
 * Returns null when the id is malformed or the fetch/validation fails, so the
 * caller can fall back to showing the emote's shorthand as plain text.
 */
export function importDiscordEmoji(
  discordId: string,
  rawName: string,
  animated: boolean
): Promise<ImportedEmoji | null> {
  // Only ever fetch an id-shaped snowflake from Discord's own CDN; never a URL
  // taken out of message content.
  if (!/^\d{1,20}$/.test(discordId)) return Promise.resolve(null);

  const existing = lookupImportedName(discordId);
  if (existing) return Promise.resolve({ name: existing, created: false });

  const pending = inFlightImports.get(discordId);
  if (pending) return pending;

  const task = downloadDiscordEmoji(discordId, rawName, animated);
  inFlightImports.set(discordId, task);
  void task.finally(() => inFlightImports.delete(discordId));
  return task;
}

async function downloadDiscordEmoji(
  discordId: string,
  rawName: string,
  animated: boolean
): Promise<ImportedEmoji | null> {
  const fallbackExt = animated ? "gif" : "png";
  try {
    const res = await fetch(`${DISCORD_EMOJI_CDN}/${discordId}.${fallbackExt}`);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const ext = EXT_BY_MIME[contentType] ?? fallbackExt;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_EMOJI_BYTES) return null;

    const name = pickLocalName(rawName, discordId);
    const filename = `${name}.${ext}`;
    fs.writeFileSync(path.join(emojisDir, filename), buffer);
    const url = `/emojis/${filename}`;
    db.prepare(
      "INSERT OR REPLACE INTO discord_emojis (discord_id, name, url, animated) VALUES (?, ?, ?, ?)"
    ).run(discordId, name, url, animated ? 1 : 0);
    registerCustomEmoji(name, url);
    emojiNameCache.set(discordId, name);
    return { name, created: true };
  } catch (err) {
    console.error(`[discord] failed to import emote ${discordId}:`, err);
    return null;
  }
}
