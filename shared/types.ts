export interface User {
  id: string;
  username: string;
  is_guest: boolean;
  is_admin: boolean;
  avatar_url: string | null;
  username_color: string;
  message_color: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  content: string;
  avatar_url: string | null;
  username_color: string;
  message_color: string;
  is_deleted: boolean;
  created_at: string;
}

export interface AuthPayload {
  user: User;
  token: string;
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
}

export interface ClientToServerEvents {
  "auth:register": (data: { username: string; password: string }) => void;
  "auth:login": (data: { username: string; password: string }) => void;
  "auth:guest": (data: { username: string }) => void;
  "auth:token": (data: { token: string }) => void;
  "chat:send": (data: { content: string }) => void;
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
}
