import twemoji from "twemoji";
import type { CustomEmoji } from "../../shared/types";

export const CUSTOM_EMOJI_PATTERN = /(:[a-zA-Z0-9_-]+:)/g;
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/** Build a name → url map from the custom emoji list. */
export function buildEmojiMap(customEmojis: CustomEmoji[]): Map<string, string> {
  return new Map(customEmojis.map((e) => [e.name, e.url]));
}

export function renderTextWithLinks(
  text: string,
  keyPrefix: string
): React.ReactElement[] {
  const parts = text.split(URL_PATTERN);
  return parts
    .map((part, i) => {
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
      return (
        <span
          key={`${keyPrefix}-${i}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    })
    .filter((n): n is React.ReactElement => n !== null);
}

export function renderContent(
  content: string,
  emojiMap: Map<string, string>
): React.ReactNode[] {
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
            className="inline-block h-8 w-8 object-contain align-middle mx-0.5"
          />,
        ];
      }
    }
    if (!part) return [];
    return renderTextWithLinks(part, `t${i}`);
  });
}
