import twemoji from "twemoji";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trash2, Ban } from "lucide-react";
import type { ChatMessage as ChatMessageType, CustomEmoji } from "../../shared/types";

interface ChatMessageProps {
  message: ChatMessageType;
  isAdmin: boolean;
  currentUserId: string | null;
  onDelete: (messageId: string) => void;
  onBan: (userId: string) => void;
  customEmojis: CustomEmoji[];
}

const CUSTOM_EMOJI_PATTERN = /(:[a-zA-Z0-9_-]+:)/g;
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

function renderTextWithLinks(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-400 hover:text-blue-300 break-all"
        >
          {part}
        </a>
      );
    }
    if (!part) return null;
    // HTML-escape first to prevent XSS, then let twemoji inject safe img tags
    const escaped = part
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const html = twemoji.parse(escaped, {
      folder: "svg",
      ext: ".svg",
      base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
    });
    return <span key={`${keyPrefix}-${i}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }).filter((n): n is React.ReactElement => n !== null);
}

function renderContent(content: string, emojiMap: Map<string, string>): React.ReactNode[] {
  const parts = content.split(CUSTOM_EMOJI_PATTERN);
  return parts.flatMap((part, i) => {
    const match = part.match(/^:([a-zA-Z0-9_-]+):$/);
    if (match) {
      const url = emojiMap.get(match[1]);
      if (url) {
        return [
          <img
            key={i}
            src={url}
            alt={`:${match[1]}:`}
            title={`:${match[1]}:`}
            className="inline-block h-5 w-5 object-contain align-middle mx-0.5"
          />,
        ];
      }
    }
    if (!part) return [];
    return renderTextWithLinks(part, `t${i}`);
  });
}

export function ChatMessage({
  message,
  isAdmin,
  currentUserId,
  onDelete,
  onBan,
  customEmojis,
}: ChatMessageProps) {
  const emojiMap = new Map(customEmojis.map((e) => [e.name, e.url]));
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
            {renderContent(message.content, emojiMap)}
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
