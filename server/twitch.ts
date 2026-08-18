import { Client } from "tmi.js";
import type { ChatUserstate } from "tmi.js";
import type { Server } from "socket.io";
import { randomUUID } from "crypto";
import { getActiveItem } from "./playlist.js";
import type {
  ChatMessage,
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/types.js";

/** Synthetic `user_id` used for bridged messages (not a real DB user). */
const BRIDGE_USER_ID = "twitch-bridge";
/**
 * Default anonymous nickname. tmi.js reads public chat without a login; if a
 * bot account is configured (TWITCH_BOT_USERNAME / TWITCH_BOT_OAUTH) we use it
 * instead, which comes with higher per-connection rate limits.
 */
const ANON_NICK = `justinfan${Math.floor(Math.random() * 80000) + 10000}`;
/** Cap how many Twitch messages we forward to clients per second. */
const BRIDGE_MAX_PER_SECOND = 15;
/** Twitch purple, used when a chatter has no color set. */
const TWITCH_PURPLE = "#9146FF";

export interface TwitchBridge {
  /** Re-sync to whichever Twitch channel is currently active (idempotent). */
  syncTwitchBridge(): void;
}

/**
 * Bridges live Twitch chat into the app's comment overlay whenever a Twitch
 * playlist item is active. Bridged messages are broadcast live via the
 * `comment:new` event — the overlay only — and are NOT persisted to the message
 * history. Twitch chat is ephemeral and can be extremely high-volume.
 */
export function initTwitchBridge(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): TwitchBridge {
  const hasBotCreds =
    !!process.env.TWITCH_BOT_USERNAME && !!process.env.TWITCH_BOT_OAUTH;

  const client = new Client({
    options: { debug: false },
    connection: { reconnect: true, secure: true },
    identity: hasBotCreds
      ? {
          username: process.env.TWITCH_BOT_USERNAME,
          password: process.env.TWITCH_BOT_OAUTH,
        }
      : { username: ANON_NICK },
    channels: [],
  });

  let joinedChannel: string | null = null;
  let lastWindowStart = 0;
  let forwardedInWindow = 0;

  function join(channel: string): void {
    if (joinedChannel === channel) return;
    if (joinedChannel !== null) {
      client.part(joinedChannel).catch(() => {});
    }
    joinedChannel = channel;
    client
      .join(channel)
      .then(() => {
        console.log(`[twitch] bridge joined #${channel}`);
      })
      .catch((err: unknown) => {
        console.error(`[twitch] bridge failed to join #${channel}:`, err);
        joinedChannel = null;
      });
  }

  function leave(channel: string): void {
    client.part(channel).catch(() => {});
    if (joinedChannel === channel) {
      joinedChannel = null;
    }
    console.log(`[twitch] bridge left #${channel}`);
  }

  function syncTwitchBridge(): void {
    const active = getActiveItem();
    if (active?.source === "twitch") {
      const channel = (active.channel ?? active.label).toLowerCase();
      join(channel);
    } else if (joinedChannel !== null) {
      leave(joinedChannel);
    }
  }

  client.on("message", (_channel, tags, rawMessage, self) => {
    if (self) return;

    // Simple per-second sampling so a busy channel can't flood the broadcast.
    const now = Date.now();
    if (now - lastWindowStart >= 1000) {
      lastWindowStart = now;
      forwardedInWindow = 0;
    }
    if (forwardedInWindow >= BRIDGE_MAX_PER_SECOND) return;
    forwardedInWindow += 1;

    const content = rawMessage.trim();
    if (!content) return;

    const color = tags.color ?? TWITCH_PURPLE;
    const displayName = tags["display-name"] || tags.username || "Twitch";

    const message: ChatMessage = {
      id: randomUUID(),
      user_id: BRIDGE_USER_ID,
      username: displayName,
      content,
      media_url: null,
      media_type: null,
      avatar_url: null,
      username_color: color,
      message_color: color,
      is_deleted: false,
      author_is_admin: false,
      author_is_moderator: false,
      created_at: new Date().toISOString(),
      source: "twitch",
    };
    // Overlay-only: don't push Twitch chat into the app's chat sidebar.
    io.emit("comment:new", message);
  });

  client.on("connected", (_address, _port) => {
    console.log(
      `[twitch] bridge connected (${hasBotCreds ? "bot account" : "anonymous read-only"})`
    );
    syncTwitchBridge();
  });

  client.on("disconnected", (reason) => {
    console.log(`[twitch] bridge disconnected: ${reason}`);
  });

  client.connect().catch((err: unknown) => {
    console.error("[twitch] bridge connect error:", err);
  });

  return { syncTwitchBridge };
}
