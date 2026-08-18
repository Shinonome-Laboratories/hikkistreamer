import { useCallback, useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import type { ChatMessage, CustomEmoji, PlayerState } from "../../shared/types";

export interface LiveComment {
  id: string;
  message: ChatMessage;
}

/**
 * Live-only feed of comments for the niconico overlay.
 *
 * Consumes both app chat messages (`chat:message`) and overlay-only comments
 * (`comment:new`, e.g. bridged Twitch chat) so the overlay shows everything
 * while the chat sidebar only shows app chat.
 *
 * Subscribes to the shared socket singleton but NEVER connects/disconnects it —
 * the page's `useChat()` owns the connection lifecycle. Because it ignores
 * `chat:history`, messages already in the room before this hook mounts are not
 * replayed as scrolling comments.
 */
export function useCommentFeed() {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Feed the overlay from both app chat messages and overlay-only comments
    // (e.g. bridged Twitch chat).
    function pushComment(message: ChatMessage) {
      if (message.is_deleted) return;
      setComments((prev) => [...prev, { id: message.id, message }]);
    }

    function onChatDelete(messageId: string) {
      setComments((prev) => prev.filter((c) => c.id !== messageId));
    }

    function onEmojisList(emojis: CustomEmoji[]) {
      setCustomEmojis(emojis);
    }

    function onPlayerState(state: PlayerState) {
      // Pause comment motion while the video is paused or stopped (niconico
      // pauses its comments with the video). Live sources are always "live".
      setPaused(state.status === "paused" || state.status === "stopped");
    }

    socket.on("chat:message", pushComment);
    socket.on("comment:new", pushComment);
    socket.on("chat:delete", onChatDelete);
    socket.on("emojis:list", onEmojisList);
    socket.on("player:state", onPlayerState);

    return () => {
      socket.off("chat:message", pushComment);
      socket.off("comment:new", pushComment);
      socket.off("chat:delete", onChatDelete);
      socket.off("emojis:list", onEmojisList);
      socket.off("player:state", onPlayerState);
    };
  }, []);

  /**
   * Drop comments the overlay has already turned into animated sprites, so the
   * feed never buffers up during a long session.
   */
  const ackComments = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    setComments((prev) => prev.filter((c) => !ids.has(c.id)));
  }, []);

  return { comments, customEmojis, paused, ackComments };
}
