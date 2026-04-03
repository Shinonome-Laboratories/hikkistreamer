import { useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { Loader2 } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../../shared/types";

interface ChatMessagesProps {
  messages: ChatMessageType[];
  isAdmin: boolean;
  currentUserId: string | null;
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  onLoadMore: () => void;
  onDelete: (messageId: string) => void;
  onBan: (userId: string) => void;
}

export function ChatMessages({
  messages,
  isAdmin,
  currentUserId,
  hasMoreHistory,
  loadingHistory,
  onLoadMore,
  onDelete,
  onBan,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevMessageCount = useRef(messages.length);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = distFromBottom < 60;

    if (el.scrollTop < 40 && hasMoreHistory && !loadingHistory) {
      onLoadMore();
    }
  }, [hasMoreHistory, loadingHistory, onLoadMore]);

  useEffect(() => {
    if (messages.length > prevMessageCount.current && shouldAutoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && prevMessageCount.current === messages.length) {
      bottomRef.current?.scrollIntoView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto"
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
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onDelete={onDelete}
          onBan={onBan}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
