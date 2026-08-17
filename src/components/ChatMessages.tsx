import { useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { Loader2 } from "lucide-react";
import type { ChatMessage as ChatMessageType, CustomEmoji } from "../../shared/types";

interface ChatMessagesProps {
  messages: ChatMessageType[];
  isAdmin: boolean;
  isModerator: boolean;
  currentUserId: string | null;
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  onLoadMore: () => void;
  onDelete: (messageId: string) => void;
  onBan: (userId: string) => void;
  customEmojis: CustomEmoji[];
}

export function ChatMessages({
  messages,
  isAdmin,
  isModerator,
  currentUserId,
  hasMoreHistory,
  loadingHistory,
  onLoadMore,
  onDelete,
  onBan,
  customEmojis,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevMessageCount = useRef(0);
  const didInitialScroll = useRef(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = distFromBottom < 60;

    if (el.scrollTop < 40 && hasMoreHistory && !loadingHistory) {
      onLoadMore();
    }
  }, [hasMoreHistory, loadingHistory, onLoadMore]);

  // Scroll to bottom on page load once the initial chat history arrives
  useEffect(() => {
    if (!didInitialScroll.current && messages.length > 0) {
      didInitialScroll.current = true;
      bottomRef.current?.scrollIntoView();
    }
  }, [messages]);

  // Re-scroll to bottom when media (images/videos) finish loading — they load
  // asynchronously and expand the scroll height after the initial scroll.
  // Uses capture since `load` events don't bubble. Respects `shouldAutoScroll`
  // so it won't yank the user down if they scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleMediaLoad = () => {
      if (shouldAutoScroll.current) {
        bottomRef.current?.scrollIntoView();
      }
    };

    el.addEventListener("load", handleMediaLoad, true);
    return () => el.removeEventListener("load", handleMediaLoad, true);
  }, []);

  // Auto-scroll to bottom (smoothly) when new messages arrive
  useEffect(() => {
    if (
      messages.length > prevMessageCount.current &&
      shouldAutoScroll.current &&
      didInitialScroll.current
    ) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="chat-scroll flex-1 min-h-0 overflow-y-auto"
      onScroll={handleScroll}
    >
      {loadingHistory && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {!hasMoreHistory && messages.length > 0 && (
        <div className="text-center text-xs text-muted-foreground py-2">
          Beginning of chat history
        </div>
      )}
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          canModerate={isAdmin || isModerator}
          canBan={isAdmin}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onDelete={onDelete}
          onBan={onBan}
          customEmojis={customEmojis}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
