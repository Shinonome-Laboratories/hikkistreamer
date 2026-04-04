import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trash2, Ban } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../../shared/types";

interface ChatMessageProps {
  message: ChatMessageType;
  isAdmin: boolean;
  currentUserId: string | null;
  onDelete: (messageId: string) => void;
  onBan: (userId: string) => void;
}

export function ChatMessage({
  message,
  isAdmin,
  currentUserId,
  onDelete,
  onBan,
}: ChatMessageProps) {
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
        <Avatar className="h-6 w-6 mt-0.5 shrink-0">
          <AvatarImage src={message.avatar_url} />
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <span className="inline">
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
            {message.content}
          </span>
        </span>
      </div>
      {isAdmin && message.user_id !== currentUserId && (
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(message.id)}
            title="Delete message"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={() => onBan(message.user_id)}
            title="Ban user"
          >
            <Ban className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
