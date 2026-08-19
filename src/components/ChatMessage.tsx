import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { buildEmojiMap, renderContent } from "@/lib/renderContent";
import { Button } from "@/components/ui/button";
import { Trash2, Ban } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import type { ChatMessage as ChatMessageType, CustomEmoji } from "../../shared/types";

interface ChatMessageProps {
  message: ChatMessageType;
  /** Staff (admin or moderator) — can use moderation actions. */
  canModerate: boolean;
  /** Admins only — can ban users. */
  canBan: boolean;
  /** Whether the viewer is an admin (admins can act on any message). */
  isAdmin: boolean;
  currentUserId: string | null;
  onDelete: (messageId: string) => void;
  onBan: (userId: string) => void;
  customEmojis: CustomEmoji[];
  /** Show a small HH:MM timestamp before each message (viewer preference). */
  showTimestamps?: boolean;
}

export function ChatMessage({
  message,
  canModerate,
  canBan,
  isAdmin,
  currentUserId,
  onDelete,
  onBan,
  customEmojis,
  showTimestamps = false,
}: ChatMessageProps) {
  const emojiMap = buildEmojiMap(customEmojis);

  // Moderators can delete their own messages and messages from regular users;
  // admins can delete anything.
  const canDeleteMessage =
    canModerate &&
    (isAdmin ||
      message.user_id === currentUserId ||
      (!message.author_is_admin && !message.author_is_moderator));

  // Banning is admin-only and never targets staff or yourself.
  const canBanUser =
    canBan &&
    message.user_id !== currentUserId &&
    !message.author_is_admin &&
    !message.author_is_moderator;

  // Show a small HH:MM timestamp when the viewer enables it.
  const timestamp = showTimestamps
    ? formatTimestamp(message.created_at)
    : null;

  if (message.is_deleted) {
    return (
      <div className="px-3 py-1 opacity-40 italic text-xs text-muted-foreground">
        message deleted
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 px-3 py-1.5 hover:bg-secondary/30 transition-colors">
      {message.avatar_url && (
        <Avatar className="h-8 w-8 mt-0.5 shrink-0">
          <AvatarImage src={message.avatar_url} />
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <span className="inline">
          {timestamp && (
            <span className="text-[10px] text-muted-foreground mr-1.5">
              {timestamp}
            </span>
          )}
          <span
            className="text-sm font-semibold mr-1.5"
            style={{ color: message.username_color }}
          >
            {message.username}
          </span>
          <span
            className="text-sm break-words"
            style={{ color: message.message_color }}
          >
            {renderContent(message.content, emojiMap)}
          </span>
        </span>
        {message.media_url && (
          <div className="mt-1.5">
            {message.media_type === "video" ? (
              <video
                src={message.media_url}
                controls
                preload="metadata"
                className="max-h-72 max-w-[280px] rounded-sm object-contain bg-black/40"
              />
            ) : (
              <a
                href={message.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
                title="Open image in new tab"
              >
                <img
                  src={message.media_url}
                  alt=""
                  loading="lazy"
                  className="max-h-72 max-w-[280px] rounded-sm object-contain bg-black/40 transition-opacity hover:opacity-90"
                />
              </a>
            )}
          </div>
        )}
      </div>
      {(canDeleteMessage || canBanUser) && (
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          {canDeleteMessage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(message.id)}
              title="Delete message"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          {canBanUser && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive"
              onClick={() => onBan(message.user_id)}
              title="Ban user"
            >
              <Ban className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
