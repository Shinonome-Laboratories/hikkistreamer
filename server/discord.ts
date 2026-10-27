import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import type { Server } from "socket.io";
import type { Message, MessageSnapshot } from "discord.js";
import { createMessage } from "./chat.js";
import { getCustomEmojis, importDiscordEmoji } from "./emojis.js";
import {
  clampBridgedContent,
  collectDiscordEmotes,
  formatDiscordContent,
  formatDiscordEmbeds,
} from "./discord-format.js";
import type { MentionLookup } from "./discord-format.js";
import { nameColorFor } from "./name-color.js";
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
/** Discord blurple, used as the message body color for bridged Discord posts. */
const DISCORD_BLURPLE = "#5865F2";
/** Cap how many Discord messages we forward to clients per second. */
const BRIDGE_MAX_PER_SECOND = 15;
/** Max queued outbound webhook sends before we start dropping messages. */
const MAX_QUEUE = 200;
/** Max custom emotes we import (and therefore rewrite) per bridged message. */
const MAX_EMOTES_PER_MESSAGE = 8;
/**
 * `MessageReferenceType.Forward`. Spelled out as a literal because discord.js
 * is only imported lazily in `setupGateway` (the bridge may be disabled).
 */
const MESSAGE_REFERENCE_TYPE_FORWARD = 1;

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

/**
 * A Discord message, or the snapshot of the original message carried by a
 * forward. Both expose the pieces the bridge needs (content, embeds, mentions,
 * attachments).
 */
type MessageLike = Message | MessageSnapshot;

/**
 * The snapshot of the original message carried by a forward, or null when
 * `message` isn't a forward. A forwarded message has no content/attachments of
 * its own: those live in the snapshot of the message that was forwarded.
 */
function forwardSnapshot(message: Message): MessageSnapshot | null {
  if (message.reference?.type !== MESSAGE_REFERENCE_TYPE_FORWARD) return null;
  return message.messageSnapshots?.first() ?? null;
}

/** Resolve Discord user/role/channel mentions using the source's own caches. */
function mentionsOf(source: MessageLike): MentionLookup {
  // Snapshots (and partial messages) may carry no mention data at all.
  const mentions = source.mentions;
  return {
    user: (id) => {
      const user = mentions?.users.get(id);
      return user ? user.globalName || user.username : null;
    },
    role: (id) => mentions?.roles.get(id)?.name ?? null,
    channel: (id) => {
      const channel = mentions?.channels.get(id);
      // DM/thread channels have no plain `name`; fall back to "channel".
      return channel && "name" in channel ? (channel.name ?? null) : null;
    },
  };
}

/** Flatten a source's embeds to plain text (empty when it has none). */
function embedTextOf(source: MessageLike): string {
  return formatDiscordEmbeds(source.embeds ?? []);
}

/**
 * Translate Discord message text into chat-friendly text: Discord emotes are
 * imported as local custom emojis and rewritten to `:name:`, and user/role/
 * channel mentions are replaced with readable names. Returns the rewritten text
 * plus whether any emote was newly imported (so clients can be told to refresh
 * their emoji list). The caller clamps the final text, since it may still prefix
 * or join several bodies.
 */
async function translateBody(
  raw: string,
  mentions: MentionLookup
): Promise<{ content: string; importedEmotes: boolean }> {
  const emotes = collectDiscordEmotes(raw).slice(0, MAX_EMOTES_PER_MESSAGE);

  const emoteNames = new Map<string, string | null>();
  let importedEmotes = false;
  if (emotes.length > 0) {
    const imported = await Promise.all(
      emotes.map((emote) => importDiscordEmoji(emote.id, emote.name, emote.animated))
    );
    emotes.forEach((emote, i) => {
      const result = imported[i];
      if (result) importedEmotes = importedEmotes || result.created;
      emoteNames.set(emote.id, result?.name ?? null);
    });
  }

  const content = formatDiscordContent(raw, emoteNames, mentions);
  return { content, importedEmotes };
}

/**
 * Translate a Discord message's whole body: its text plus any embeds (the only
 * body many bot and webhook messages have) flattened to plain text.
 */
async function translateDiscordContent(
  source: MessageLike
): Promise<{ content: string; importedEmotes: boolean }> {
  const raw = [source.content ?? "", embedTextOf(source)]
    .filter((part) => part.trim().length > 0)
    .join("\n");
  return translateBody(raw, mentionsOf(source));
}

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

/** What an inbound Discord message becomes once translated for hikkichat. */
export interface BridgedDiscordMessage {
  content: string;
  mediaUrl: string | null;
  mediaType: MediaType | null;
  displayName: string;
  avatarUrl: string | null;
  /** True when at least one Discord emote was imported as a custom emoji. */
  importedEmotes: boolean;
}

/**
 * Translate an inbound Discord message into the pieces of a hikkichat message.
 *
 * Handles forwards (whose body lives in a snapshot rather than on the message
 * itself) and embed-only messages (typical for bots and webhooks). Returns null
 * when there is nothing worth relaying.
 */
export async function bridgeInboundMessage(
  message: Message
): Promise<BridgedDiscordMessage | null> {
  // A forward carries no content of its own: the original message (text,
  // embeds, mentions, attachments) lives in its snapshot.
  const snapshot = forwardSnapshot(message);
  const source: MessageLike = snapshot ?? message;

  const body = await translateDiscordContent(source);
  let importedEmotes = body.importedEmotes;
  let content = body.content;
  if (snapshot) {
    // The chat line is attributed to whoever forwarded the message into the
    // bridged channel, so name the original author to keep that context. Some
    // clients can add their own note next to a forward; keep it in front.
    const originalAuthor =
      snapshot.author?.globalName || snapshot.author?.username || "Discord";
    const note = await translateBody(message.content ?? "", mentionsOf(message));
    importedEmotes = importedEmotes || note.importedEmotes;
    content = [
      note.content,
      content ? `[Forwarded from ${originalAuthor}] ${content}` : "",
    ]
      .filter((part) => part.length > 0)
      .join("\n");
  }
  content = clampBridgedContent(content);

  let mediaUrl: string | null = null;
  let mediaType: MediaType | null = null;
  const attachment = source.attachments.first();
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

  if (!content && !mediaUrl) return null;

  return {
    content,
    mediaUrl,
    mediaType,
    displayName: message.author.globalName || message.author.username || "Discord",
    avatarUrl: message.author.displayAvatarURL({ size: 64 }),
    importedEmotes,
  };
}

/** Snowflake of the webhook a Discord webhook URL points at, or null if unparseable. */
export function webhookIdFromUrl(webhookUrl: string): string | null {
  return /\/webhooks\/(\d{5,20})/.exec(webhookUrl)?.[1] ?? null;
}

/**
 * Whether an inbound channel message should be relayed into hikkichat.
 *
 * Loop prevention: messages posted through our own webhook (hikkichat → Discord)
 * echo back through the gateway and must never be bridged again, and the bridge
 * bot's own posts are ignored too. Everything else is relayed, including
 * forwards, bot posts and other webhooks — those used to be dropped wholesale.
 * When the webhook id is unknown (unparseable URL) all webhook messages are
 * dropped rather than risk echoing our own.
 */
export function shouldRelayInbound(
  message: Message,
  ownWebhookId: string | null,
  selfUserId: string | null
): boolean {
  if (message.webhookId) return ownWebhookId !== null && message.webhookId !== ownWebhookId;
  return message.author.id !== selfUserId;
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

  // Id of the webhook this app posts through, so its own echoes can be told
  // apart from other webhooks posting in the same channel.
  const ownWebhookId = webhookIdFromUrl(dc.webhookUrl);
  if (!ownWebhookId) {
    console.warn(
      "[discord] could not read a webhook id from discord.webhookUrl; webhook messages will not be bridged"
    );
  }

  let lastWindowStart = 0;
  let forwardedInWindow = 0;

  client.on("messageCreate", async (message) => {
    if (message.channelId !== dc.channelId) return;
    // Skips only our own echoes and the bridge bot itself; forwards, bot posts
    // and foreign webhooks are all bridged.
    if (!shouldRelayInbound(message, ownWebhookId, client.user?.id ?? null)) return;

    // Simple per-second sampling so a busy channel can't flood the broadcast.
    const now = Date.now();
    if (now - lastWindowStart >= 1000) {
      lastWindowStart = now;
      forwardedInWindow = 0;
    }
    if (forwardedInWindow >= BRIDGE_MAX_PER_SECOND) return;
    forwardedInWindow += 1;

    // Discord-only markup (`<:emote:id>`, `<@id>`, `<#id>`, …) means nothing to
    // the chat renderer, so translation happens here: forwards are read from
    // their snapshot, embed-only bot/webhook posts are flattened to text.
    const bridged = await bridgeInboundMessage(message);
    if (!bridged) return;

    if (bridged.importedEmotes) {
      // Tell connected clients about the newly imported emotes before the
      // message that uses them is broadcast.
      io.emit("emojis:list", getCustomEmojis());
    }

    // Bridged users have no account to customize, so their name color is
    // derived from the display name (stable per user, so history and live
    // messages agree). The body stays blurple so Discord-sourced lines remain
    // recognizable in the chat.
    const dbMessage = createMessage(
      BRIDGE_USER_ID,
      bridged.displayName,
      bridged.content,
      bridged.mediaUrl,
      bridged.mediaType,
      bridged.avatarUrl,
      nameColorFor(bridged.displayName),
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
