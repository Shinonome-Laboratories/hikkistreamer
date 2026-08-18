import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import type { Server } from "socket.io";
import { createMessage } from "./chat.js";
import db from "./db.js";
import type { AppConfig } from "./config.js";
import type {
  ChatMessage,
  ClientToServerEvents,
  MediaType,
  ServerToClientEvents,
} from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "data", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

/** Synthetic `user_id` for bridged Discord messages (a hidden guest user row). */
export const BRIDGE_USER_ID = "discord-bridge";
/** Display name of the synthetic user row. Not shown anywhere user-facing. */
const BRIDGE_DISPLAY_NAME = "Discord Bridge";
/** Discord blurple, used as both username and message color for Discord users. */
const DISCORD_BLURPLE = "#5865F2";
/** Cap how many Discord messages we forward to clients per second. */
const BRIDGE_MAX_PER_SECOND = 15;
/** Max queued outbound webhook sends before we start dropping messages. */
const MAX_QUEUE = 200;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

const SAFE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".mp4",
  ".webm",
  ".mov",
]);

export interface DiscordBridge {
  /** Relay a hikkichat message to Discord as its author (webhook). No-op when disabled. */
  sendToDiscord(message: ChatMessage): void;
}

const NOOP_BRIDGE: DiscordBridge = { sendToDiscord() {} };

/** Create the hidden guest user that owns persisted Discord-bridged messages. */
function ensureBridgeUser(): void {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(BRIDGE_USER_ID);
  if (!existing) {
    db.prepare(
      "INSERT INTO users (id, username, is_guest, username_color, message_color) VALUES (?, ?, 1, ?, ?)"
    ).run(BRIDGE_USER_ID, BRIDGE_DISPLAY_NAME, DISCORD_BLURPLE, "#d1d5db");
  }
}

function mediaExtension(contentType: string, name: string | null, mediaType: MediaType): string {
  const fromMime = EXT_BY_MIME[contentType];
  if (fromMime) return fromMime;
  if (name) {
    const ext = path.extname(name).toLowerCase();
    if (SAFE_EXTENSIONS.has(ext)) return ext;
  }
  return mediaType === "image" ? ".png" : ".mp4";
}

/**
 * Download a Discord attachment and re-host it under /uploads/. Discord CDN
 * attachment URLs expire, so proxying keeps historical messages stable and
 * everything self-hosted. Returns null for non-image/video or on failure.
 */
async function downloadAttachment(
  url: string,
  contentType: string | null,
  name: string | null
): Promise<{ url: string; mediaType: MediaType } | null> {
  const ct = contentType ?? "";
  let mediaType: MediaType | null = null;
  if (ct.startsWith("image/")) mediaType = "image";
  else if (ct.startsWith("video/")) mediaType = "video";
  if (!mediaType) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    const filename = `${randomUUID()}${mediaExtension(ct, name, mediaType)}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buf);
    return { url: `/uploads/${filename}`, mediaType };
  } catch (err) {
    console.error("[discord] failed to download attachment:", err);
    return null;
  }
}

/** Turn a relative app URL (e.g. /avatars/x.png) into an absolute one Discord can fetch. */
function toAbsoluteUrl(publicUrl: string, url: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return null;
  return `${publicUrl.replace(/\/+$/, "")}${url}`;
}

/** POST a single hikkichat message to the channel webhook, appearing as its author. */
async function postToWebhook(config: AppConfig, message: ChatMessage): Promise<void> {
  const webhookUrl = config.discord.webhookUrl;
  if (!webhookUrl) return;

  const form = new FormData();
  const payload: Record<string, unknown> = {
    content: message.content || "",
    username: message.username,
  };
  if (message.avatar_url) {
    const avatarUrl = toAbsoluteUrl(config.publicUrl, message.avatar_url);
    if (avatarUrl) payload.avatar_url = avatarUrl;
  }
  form.append("payload_json", JSON.stringify(payload));

  if (message.media_url && message.media_type) {
    const filePath = path.join(uploadsDir, path.basename(message.media_url));
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        Object.entries(EXT_BY_MIME).find(([, e]) => e === ext)?.[0] ??
        (message.media_type === "image" ? "image/png" : "video/mp4");
      const blob = new Blob([fs.readFileSync(filePath)], { type: mime });
      form.append("file", blob, `media${ext || (message.media_type === "image" ? ".png" : ".mp4")}`);
    }
  }

  const res = await fetch(webhookUrl, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[discord] webhook send failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

/** Serialize outbound webhook posts through a single-flight queue with a size cap. */
function createOutbound(config: AppConfig): (message: ChatMessage) => void {
  let tail: Promise<void> = Promise.resolve();
  let queueLength = 0;

  return function sendToDiscord(message: ChatMessage): void {
    // Never echo bridged Discord messages back to Discord.
    if (message.user_id === BRIDGE_USER_ID) return;
    if (queueLength >= MAX_QUEUE) {
      console.warn("[discord] webhook queue full, dropping message");
      return;
    }
    queueLength += 1;
    tail = tail
      .then(() => postToWebhook(config, message))
      .catch((err) => console.error("[discord] webhook error:", err))
      .finally(() => {
        queueLength -= 1;
      });
  };
}

/** Connect to the Discord gateway and relay channel messages into hikkichat. */
async function setupGateway(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  config: AppConfig
): Promise<void> {
  const dc = config.discord;
  // Lazy-import so discord.js is never loaded when the bridge is disabled.
  const { Client, GatewayIntentBits } = await import("discord.js");
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let lastWindowStart = 0;
  let forwardedInWindow = 0;

  client.on("messageCreate", async (message) => {
    if (message.channelId !== dc.channelId) return;
    // Loop prevention: our own webhook posts echo back as webhook messages, and
    // the bot never relays bots. Skip both.
    if (message.webhookId) return;
    if (message.author.bot) return;

    // Simple per-second sampling so a busy channel can't flood the broadcast.
    const now = Date.now();
    if (now - lastWindowStart >= 1000) {
      lastWindowStart = now;
      forwardedInWindow = 0;
    }
    if (forwardedInWindow >= BRIDGE_MAX_PER_SECOND) return;
    forwardedInWindow += 1;

    let content = (message.content ?? "").trim();
    if (content.length > 500) content = content.slice(0, 500);

    let mediaUrl: string | null = null;
    let mediaType: MediaType | null = null;
    const attachment = message.attachments.first();
    if (attachment) {
      const downloaded = await downloadAttachment(
        attachment.url,
        attachment.contentType ?? null,
        attachment.name ?? null
      );
      if (downloaded) {
        mediaUrl = downloaded.url;
        mediaType = downloaded.mediaType;
      }
    }

    if (!content && !mediaUrl) return;

    const displayName = message.author.globalName || message.author.username || "Discord";
    const avatarUrl = message.author.displayAvatarURL({ size: 64 });

    const dbMessage = createMessage(
      BRIDGE_USER_ID,
      displayName,
      content,
      mediaUrl,
      mediaType,
      avatarUrl,
      DISCORD_BLURPLE,
      DISCORD_BLURPLE
    );
    if (dbMessage) {
      io.emit("chat:message", dbMessage);
    }
  });

  client.once("ready", () => {
    console.log(`[discord] bridge connected as ${client.user?.tag ?? "?"}`);
  });

  try {
    await client.login(dc.botToken);
  } catch (err) {
    console.error("[discord] bridge login failed:", err);
  }
}

/**
 * Initialize the optional Discord bridge. Returns a no-op bridge when disabled
 * or misconfigured, so the rest of the server can call `sendToDiscord` safely.
 * discord.js is only imported (lazily) when the bridge is actually enabled.
 */
export function initDiscordBridge(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  config: AppConfig
): DiscordBridge {
  const dc = config.discord;
  if (!dc.enabled) return NOOP_BRIDGE;
  if (!dc.botToken || !dc.channelId || !dc.webhookUrl) {
    console.warn(
      "[discord] bridge enabled but botToken/channelId/webhookUrl are not all set; keeping it disabled"
    );
    return NOOP_BRIDGE;
  }

  ensureBridgeUser();

  // Outbound works immediately; the gateway (inbound) connects in the background.
  void setupGateway(io, config);

  return { sendToDiscord: createOutbound(config) };
}
