import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Directory backing the `/avatars` static route (user uploads + mirrored avatars). */
export const avatarsDir = path.join(__dirname, "..", "data", "avatars");
/** Sub-directory holding avatars mirrored from Discord, served as `/avatars/discord/*`. */
const discordAvatarsDir = path.join(avatarsDir, "discord");
fs.mkdirSync(discordAvatarsDir, { recursive: true });

/** Discord's avatar CDN. The hash in the path changes whenever the picture does. */
const DISCORD_AVATAR_CDN = "https://cdn.discordapp.com/avatars";
/** Size requested from Discord. Avatars render at 32px, so 128px covers hidpi. */
export const DISCORD_AVATAR_SIZE = 128;
/** Max size of a single mirrored avatar (mirrors the /api/avatar upload cap). */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
/** Extensions by the content-type Discord serves avatars with. */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};
/** Extensions a mirrored avatar may have on disk, in lookup order. */
const AVATAR_EXTENSIONS = ["webp", "gif", "png", "jpg"];
/** How many distinct historical URLs a single migration pass will mirror. */
const MAX_MIGRATED_URLS = 500;

/** Mirrored avatar filenames confirmed to exist, so the common path is a Set hit. */
const knownFiles = new Set<string>();
/** In-flight mirrors, so concurrent messages don't fetch the same avatar twice. */
const inFlight = new Map<string, Promise<string | null>>();

/** Discord avatar hashes are hex, with animated ones prefixed by `a_`. */
function safeHash(hash: string): string {
  return hash.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64);
}

/** Local `/avatars/...` path of an already-mirrored avatar, or null when absent. */
function mirroredAvatarPath(key: string): string | null {
  for (const ext of AVATAR_EXTENSIONS) {
    const filename = `${key}.${ext}`;
    if (knownFiles.has(filename) || fs.existsSync(path.join(discordAvatarsDir, filename))) {
      knownFiles.add(filename);
      return `/avatars/discord/${filename}`;
    }
  }
  return null;
}

/**
 * Mirror a Discord avatar into data/avatars and return its local path.
 *
 * Discord CDN avatar URLs embed the picture's hash, so a stored URL starts
 * 404ing the moment its owner uploads a new one. Downloading the image once per
 * (id, hash) and serving it from our own origin keeps historical messages
 * intact. Returns null for a malformed id/hash or a failed fetch, so the caller
 * can fall back to the CDN URL.
 */
export async function cacheDiscordAvatar(userId: string, hash: string): Promise<string | null> {
  // Only ever fetch an id-shaped snowflake from Discord's own CDN.
  if (!/^\d{1,20}$/.test(userId)) return null;
  const cleanHash = safeHash(hash);
  if (!cleanHash) return null;

  const key = `${userId}-${cleanHash}`;
  const mirrored = mirroredAvatarPath(key);
  if (mirrored) return mirrored;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = downloadDiscordAvatar(key, userId, cleanHash);
  inFlight.set(key, task);
  void task.finally(() => inFlight.delete(key));
  return task;
}

async function downloadDiscordAvatar(
  key: string,
  userId: string,
  hash: string
): Promise<string | null> {
  // Animated avatars (`a_...`) are only served as GIFs; stills as WebP.
  const fallbackExt = hash.startsWith("a_") ? "gif" : "webp";
  const url = `${DISCORD_AVATAR_CDN}/${userId}/${hash}.${fallbackExt}?size=${DISCORD_AVATAR_SIZE}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) return null;

    const filename = `${key}.${EXT_BY_MIME[contentType] ?? fallbackExt}`;
    fs.writeFileSync(path.join(discordAvatarsDir, filename), buffer);
    knownFiles.add(filename);
    return `/avatars/discord/${filename}`;
  } catch (err) {
    console.error(`[avatars] failed to mirror Discord avatar ${key}:`, err);
    return null;
  }
}

/** Split a Discord CDN avatar URL into the id and hash it was built from. */
export function parseDiscordAvatarUrl(url: string): { userId: string; hash: string } | null {
  const match =
    /^https?:\/\/cdn\.discordapp\.com\/avatars\/(\d{1,20})\/([a-zA-Z0-9_]+)\.\w+(?:\?.*)?$/i.exec(
      url
    );
  if (!match) return null;
  return { userId: match[1], hash: match[2] };
}

/**
 * Mirror the Discord CDN avatar URLs still stored on historical messages.
 *
 * Bridged messages used to persist the CDN URL directly, which breaks as soon as
 * the author changes their picture. Every distinct URL is downloaded once and
 * rewritten to its local copy. A URL whose hash is already gone cannot be
 * recovered from the CDN alone, so `resolveCurrentHash` (the gateway's user
 * lookup) is consulted as a fallback; anything still unresolved is left as is.
 */
export async function migrateDiscordAvatarUrls(
  resolveCurrentHash?: (userId: string) => Promise<string | null>
): Promise<void> {
  const rows = db
    .prepare(
      "SELECT DISTINCT avatar_url FROM messages WHERE avatar_url LIKE '%cdn.discordapp.com/avatars/%' LIMIT ?"
    )
    .all(MAX_MIGRATED_URLS) as { avatar_url: string }[];
  if (rows.length === 0) return;

  let mirrored = 0;
  let unavailable = 0;
  for (const { avatar_url: url } of rows) {
    const parsed = parseDiscordAvatarUrl(url);
    let local = parsed ? await cacheDiscordAvatar(parsed.userId, parsed.hash) : null;
    if (!local && parsed && resolveCurrentHash) {
      const current = await resolveCurrentHash(parsed.userId);
      if (current) local = await cacheDiscordAvatar(parsed.userId, current);
    }
    if (!local) {
      unavailable += 1;
      continue;
    }
    db.prepare("UPDATE messages SET avatar_url = ? WHERE avatar_url = ?").run(local, url);
    mirrored += 1;
  }
  console.log(
    `[avatars] mirrored ${mirrored} Discord avatar URL(s)` +
      (unavailable > 0 ? `; ${unavailable} no longer available` : "")
  );
}
