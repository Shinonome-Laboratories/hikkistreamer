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
}

export interface AuthPayload {
  user: User;
  token: string;
}

export interface CustomEmoji {
  name: string;
  url: string;
}

export type PlaylistSource = "hikkistream" | "twitch";

export interface PlaylistItem {
  id: string;
  source: PlaylistSource;
  label: string;
  channel: string | null;
  is_active: boolean;
  added_by: string;
  created_at: string;
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
  "chat:history": (messages: ChatMessage[]) => void;
  "chat:delete": (messageId: string) => void;
  "users:count": (count: number) => void;
  "users:list": (users: User[]) => void;
  "mod:banned": () => void;
  "stream:title": (title: string) => void;
  "emojis:list": (emojis: CustomEmoji[]) => void;
  "playlist:list": (items: PlaylistItem[]) => void;
  "playlist:error": (payload: { message: string }) => void;
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
  }) => void;
  "playlist:remove": (data: { id: string }) => void;
  "playlist:switch": (data: { id: string }) => void;
}
