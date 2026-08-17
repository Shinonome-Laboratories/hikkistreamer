/**
 * The chat-panel modes for a Twitch stream.
 *
 * - `hikkistream`: the app's own chat only (default).
 * - `split`: hikkistream chat on top, Twitch channel chat embed below.
 * - `twitch`: Twitch channel chat embed fills the panel (hikkistream header kept).
 */
export type ChatMode = "hikkistream" | "split" | "twitch";

/** Fixed cycle order: each click advances to the next mode. */
export const CHAT_MODE_ORDER: ChatMode[] = ["hikkistream", "split", "twitch"];

interface TwitchChatEmbedProps {
  /** Lowercase Twitch channel name to embed. */
  channel: string;
}

/**
 * Twitch chat-only embed. Mirrors the `parent` rule used by the Twitch player
 * embed in `StreamPlayer.tsx`: the parent must match the page's hostname
 * (`localhost` in dev, the deployed domain in production).
 */
export function TwitchChatEmbed({ channel }: TwitchChatEmbedProps) {
  const parent = window.location.hostname;
  const src =
    `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat` +
    `?parent=${encodeURIComponent(parent)}` +
    `&darkpopout=true`;

  return (
    <div className="w-full h-full min-h-0 bg-black">
      <iframe
        src={src}
        title={`Twitch chat: ${channel}`}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
        scrolling="no"
      />
    </div>
  );
}
