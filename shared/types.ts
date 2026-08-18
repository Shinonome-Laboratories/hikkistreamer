export interface User {
  id: string;
  username: string;
  is_guest: boolean;
  is_admin: boolean;
  is_moderator: boolean;
  avatar_url: string | null;
  username_color: string;
  message_color: string;
}

export type MediaType = "image" | "video";

export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  content: string;
  media_url: string | null;
  media_type: MediaType | null;
  avatar_url: string | null;
  username_color: string;
  message_color: string;
  is_deleted: boolean;
  /** Author's current admin/moderator status (joined from users). */
  author_is_admin: boolean;
  author_is_moderator: boolean;
  created_at: string;
  /**
   * Present only for messages bridged from an external source (e.g. Twitch).
   * These are broadcast live but are not persisted in the message history.
   */
  source?: "twitch";
}

export interface AuthPayload {
  user: User;
  token: string;
}

export interface CustomEmoji {
  name: string;
  url: string;
}

export type PlaylistSource = "hikkistream" | "twitch" | "youtube";

export interface PlaylistItem {
  id: string;
  source: PlaylistSource;
  label: string;
  channel: string | null;
  /** The 11-char YouTube video ID, when `source === "youtube"`. */
  youtube_id: string | null;
  /** Queue order (0-based). Used by the server to pick the next item. */
  position: number;
  is_active: boolean;
  added_by: string;
  created_at: string;
}

export type PlayerStatus = "playing" | "paused" | "live" | "stopped";

/**
 * Authoritative playback state broadcast by the server. Clients compute their
 * desired position from `position` + elapsed time since `at`, and only correct
 * when the drift exceeds the sync slack so playback doesn't constantly skip.
 */
export interface PlayerState {
  /** The active playlist item this state applies to (or null when idle). */
  itemId: string | null;
  status: PlayerStatus;
  /** Playback position in seconds, as measured at `at`. */
  position: number;
  /** Server epoch (ms) at which `position` was measured. */
  at: number;
  /** Playback rate (reserved; always 1 for now). */
  speed: number;
  /** Known video duration in seconds, if it has been reported. */
  duration: number | null;
}

export interface BannedUser {
  id: string;
  username: string;
}

/** A registered (non-guest) account, used for admin moderator management. */
export interface RegisteredUser {
  id: string;
  username: string;
  is_admin: boolean;
  is_moderator: boolean;
}

export interface ServerToClientEvents {
  "auth:success": (payload: AuthPayload) => void;
  "auth:error": (payload: { message: string }) => void;
  "chat:message": (message: ChatMessage) => void;
  /** Live overlay-only comment (e.g. bridged Twitch chat); not in the chat sidebar/history. */
  "comment:new": (message: ChatMessage) => void;
  "chat:history": (messages: ChatMessage[]) => void;
  "chat:delete": (messageId: string) => void;
  "users:count": (count: number) => void;
  "users:list": (users: User[]) => void;
  "mod:banned": () => void;
  "stream:title": (title: string) => void;
  /** Whether the stream title auto-follows the active playlist item. */
  "stream:auto-title": (enabled: boolean) => void;
  "emojis:list": (emojis: CustomEmoji[]) => void;
  "playlist:list": (items: PlaylistItem[]) => void;
  "playlist:error": (payload: { message: string }) => void;
  "player:state": (state: PlayerState) => void;
}

export interface ClientToServerEvents {
  "auth:register": (data: { username: string; password: string }) => void;
  "auth:login": (data: { username: string; password: string }) => void;
  "auth:guest": (data: { username: string }) => void;
  "auth:token": (data: { token: string }) => void;
  "chat:send": (data: { content: string; mediaUrl?: string; mediaType?: MediaType }) => void;
  "chat:history": (data: { before: string; limit: number }) => void;
  "users:request_list": () => void;
  "mod:delete": (data: { messageId: string }) => void;
  "mod:ban": (data: { userId: string }) => void;
  "mod:unban": (data: { userId: string }) => void;
  "user:customize": (data: {
    avatar_url?: string | null;
    username_color?: string;
    message_color?: string;
  }) => void;
  "playlist:add": (data: {
    source: string;
    label?: string;
    channel?: string;
    /** Raw YouTube URL or video ID, when `source === "youtube"`. */
    url?: string;
  }) => void;
  "playlist:remove": (data: { id: string }) => void;
  "playlist:switch": (data: { id: string }) => void;
  // Synced YouTube playback. Control events (play/pause/seek/ended) are
  // staff-only server-side; ready/heartbeat reports are accepted from anyone.
  "player:play": (data: { itemId: string; position: number }) => void;
  "player:pause": (data: { itemId: string; position: number }) => void;
  "player:seek": (data: { itemId: string; position: number }) => void;
  "player:ended": (data: { itemId: string }) => void;
  "player:ready": (data: { itemId: string; duration: number }) => void;
  "player:heartbeat": (data: { itemId: string; position: number }) => void;
}
