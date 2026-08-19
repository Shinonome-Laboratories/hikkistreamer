import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  PanelBottom,
  PanelTop,
  Settings,
  Radio,
  SquareSplitHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { CHAT_MODE_ORDER, type ChatMode } from "@/components/TwitchChatEmbed";
import { cn, type FooterPosition } from "@/lib/utils";

interface FooterBarProps {
  streamTitle: string;
  isAdmin: boolean;
  isModerator: boolean;
  /** Render-prop slot for the playlist toggle (a PopoverTrigger). */
  playlistTrigger: ReactNode;
  onOpenAdminSettings: () => void;
  /** Current chat-panel mode; only meaningful while a Twitch stream is active. */
  chatMode: ChatMode;
  /** Advance the chat panel to the next mode (hikkistream → split → twitch). */
  onCycleChatMode: () => void;
  /** The active Twitch channel, or null when no Twitch stream is playing. */
  twitchChannel: string | null;
  /** Whether the niconico comments overlay is enabled. */
  commentsEnabled: boolean;
  /** Toggle the niconico comments overlay. */
  onToggleComments: () => void;
  /** Current footer position: below or above the video. */
  footerPosition: FooterPosition;
  /** Move the footer to the opposite position (top ↔ bottom). */
  onToggleFooterPosition: () => void;
}

const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  hikkistream: "hikkistream",
  split: "split",
  twitch: "twitch",
};

/** Describe the current chat mode and what the next click will do. */
function chatModeTooltip(mode: ChatMode): string {
  const next =
    CHAT_MODE_ORDER[(CHAT_MODE_ORDER.indexOf(mode) + 1) % CHAT_MODE_ORDER.length];
  return `Chat: ${CHAT_MODE_LABELS[mode]} (click: ${CHAT_MODE_LABELS[next]})`;
}

/** Describe the current footer position and what the next click will do. */
function footerPositionTooltip(position: FooterPosition): string {
  const next = position === "top" ? "bottom" : "top";
  return `Footer: ${position} (click: ${next})`;
}

/**
 * Footer bar below the video container, styled to match ChatHeader. Holds the
 * stream title, the playlist toggle, the admin settings button, and a slot for
 * future user-related toggles.
 */
export function FooterBar({
  streamTitle,
  isAdmin,
  isModerator,
  playlistTrigger,
  onOpenAdminSettings,
  chatMode,
  onCycleChatMode,
  twitchChannel,
  commentsEnabled,
  onToggleComments,
  footerPosition,
  onToggleFooterPosition,
}: FooterBarProps) {
  const ChatModeIcon =
    chatMode === "split"
      ? SquareSplitHorizontal
      : chatMode === "twitch"
        ? MessagesSquare
        : MessageCircle;

  const canModerate = isAdmin || isModerator;

  return (
    <div
      data-footer
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5 border-border bg-card/50",
        footerPosition === "top"
          ? "border-b pt-[calc(env(safe-area-inset-top)+0.375rem)]"
          : "border-t lg:pb-[calc(env(safe-area-inset-bottom)+0.375rem)]",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-9 w-9 sm:h-6 sm:w-6 shrink-0"
          title={footerPositionTooltip(footerPosition)}
          aria-label={`Move footer to ${footerPosition === "top" ? "bottom" : "top"}`}
          onClick={onToggleFooterPosition}
        >
          {footerPosition === "top" ? (
            <PanelTop className="h-3.5 w-3.5" />
          ) : (
            <PanelBottom className="h-3.5 w-3.5" />
          )}
        </Button>
        <Radio className="h-3.5 w-3.5 text-red-500 shrink-0" />
        <h1 className="text-sm font-semibold text-foreground truncate">
          {streamTitle}
        </h1>
      </div>
      <div className="flex items-center gap-1 sm:gap-0.5 shrink-0">
        <Button
          variant="outline"
          size="xs"
          className="h-9 sm:h-6 gap-1"
          title={`Comments overlay: ${commentsEnabled ? "on" : "off"}`}
          aria-label="Toggle comments overlay"
          aria-pressed={commentsEnabled}
          onClick={onToggleComments}
        >
          <MessageSquare
            className={`h-3.5 w-3.5 ${
              commentsEnabled ? "text-foreground" : "text-muted-foreground opacity-50"
            }`}
          />
          <span
            className={`hidden sm:inline ${
              commentsEnabled ? "text-foreground" : "text-muted-foreground opacity-60"
            }`}
          >
            niconico
          </span>
        </Button>
        {twitchChannel && (
          <Button
            variant="ghost"
            size="xs"
            className="h-9 sm:h-6 gap-1"
            title={chatModeTooltip(chatMode)}
            onClick={onCycleChatMode}
          >
            <ChatModeIcon
              className={`h-3.5 w-3.5 ${chatMode === "twitch" ? "text-purple-500" : ""}`}
            />
            <span
              className={`hidden sm:inline ${
                chatMode === "twitch" ? "text-purple-500" : "text-foreground"
              }`}
            >
              {CHAT_MODE_LABELS[chatMode]}
            </span>
          </Button>
        )}
        {playlistTrigger}
        {canModerate && (
          <Button
            variant="outline"
            size="xs"
            className="h-9 sm:h-6 gap-1"
            onClick={onOpenAdminSettings}
            title={isAdmin ? "Admin settings" : "Moderator settings"}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isAdmin ? "Admin" : "Mod"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
