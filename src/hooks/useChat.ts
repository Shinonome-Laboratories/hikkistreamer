import { useState, useEffect, useCallback, useRef } from "react";
import { socket } from "@/lib/socket";
import type { User, ChatMessage, AuthPayload } from "../../shared/types";

export function useChat() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      // Try token auth
      const savedToken = localStorage.getItem("hikkistream_token");
      if (savedToken) {
        socket.emit("auth:token", { token: savedToken });
      }
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onAuthSuccess(payload: AuthPayload) {
      setUser(payload.user);
      setAuthError(null);
      if (payload.token) {
        tokenRef.current = payload.token;
        localStorage.setItem("hikkistream_token", payload.token);
      }
    }

    function onAuthError(payload: { message: string }) {
      setAuthError(payload.message);
      localStorage.removeItem("hikkistream_token");
    }

    function onChatMessage(message: ChatMessage) {
      setMessages((prev) => [...prev, message]);
    }

    function onChatHistory(history: ChatMessage[]) {
      setLoadingHistory(false);
      if (history.length < 50) {
        setHasMoreHistory(false);
      }
      setMessages((prev) => {
        // If prev is empty, this is initial load
        if (prev.length === 0) return history;
        // Otherwise prepend (lazy load)
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = history.filter((m) => !existingIds.has(m.id));
        return [...newMessages, ...prev];
      });
    }

    function onChatDelete(messageId: string) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, is_deleted: true } : m
        )
      );
    }

    function onUserCount(count: number) {
      setUserCount(count);
    }

    function onUserList(users: User[]) {
      setConnectedUsers(users);
    }

    function onBanned() {
      setUser(null);
      setMessages([]);
      localStorage.removeItem("hikkistream_token");
      setAuthError("You have been banned.");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("auth:success", onAuthSuccess);
    socket.on("auth:error", onAuthError);
    socket.on("chat:message", onChatMessage);
    socket.on("chat:history", onChatHistory);
    socket.on("chat:delete", onChatDelete);
    socket.on("users:count", onUserCount);
    socket.on("users:list", onUserList);
    socket.on("mod:banned", onBanned);

    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("auth:success", onAuthSuccess);
      socket.off("auth:error", onAuthError);
      socket.off("chat:message", onChatMessage);
      socket.off("chat:history", onChatHistory);
      socket.off("chat:delete", onChatDelete);
      socket.off("users:count", onUserCount);
      socket.off("users:list", onUserList);
      socket.off("mod:banned", onBanned);
      socket.disconnect();
    };
  }, []);

  const registerUser = useCallback(
    (username: string, password: string) => {
      setAuthError(null);
      socket.emit("auth:register", { username, password });
    },
    []
  );

  const loginUser = useCallback((username: string, password: string) => {
    setAuthError(null);
    socket.emit("auth:login", { username, password });
  }, []);

  const guestLogin = useCallback((username: string) => {
    setAuthError(null);
    socket.emit("auth:guest", { username });
  }, []);

  const sendMessage = useCallback((content: string) => {
    socket.emit("chat:send", { content });
  }, []);

  const loadMoreHistory = useCallback(() => {
    if (loadingHistory || !hasMoreHistory || messages.length === 0) return;
    setLoadingHistory(true);
    const oldest = messages[0];
    if (oldest) {
      socket.emit("chat:history", { before: oldest.created_at, limit: 50 });
    }
  }, [messages, loadingHistory, hasMoreHistory]);

  const deleteMsg = useCallback((messageId: string) => {
    socket.emit("mod:delete", { messageId });
  }, []);

  const banUserAction = useCallback((userId: string) => {
    socket.emit("mod:ban", { userId });
  }, []);

  const requestUserList = useCallback(() => {
    socket.emit("users:request_list");
  }, []);

  const customize = useCallback(
    (data: {
      avatar_url?: string | null;
      username_color?: string;
      message_color?: string;
    }) => {
      socket.emit("user:customize", data);
    },
    []
  );

  const uploadAvatar = useCallback(async (dataUrl: string): Promise<void> => {
    const token = localStorage.getItem("hikkistream_token");
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error || "Upload failed");
    }
    const { avatar_url } = await res.json() as { avatar_url: string };
    setUser((prev) => (prev ? { ...prev, avatar_url } : prev));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("hikkistream_token");
    setUser(null);
    setMessages([]);
    tokenRef.current = null;
    socket.disconnect();
    socket.connect();
  }, []);

  return {
    user,
    messages,
    userCount,
    connectedUsers,
    authError,
    isConnected,
    hasMoreHistory,
    loadingHistory,
    registerUser,
    loginUser,
    guestLogin,
    sendMessage,
    loadMoreHistory,
    deleteMsg,
    banUserAction,
    requestUserList,
    customize,
    uploadAvatar,
    logout,
  };
}
