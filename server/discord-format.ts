/**
 * Discord writes custom emotes and mentions as inline markup, which is
 * meaningless to the chat renderer. These helpers translate that markup into
 * hikkichat's own plain text / `:name:` custom-emoji syntax.
 */

/**
 * Single-pass matcher for the Discord markup that shows up raw in bridged
 * messages:
 *   <:name:id> / <a:name:id>  custom (and animated) emotes
 *   <@id> / <@!id>            user mentions
 *   <@&id>                    role mentions
 *   <#id>                     channel mentions
 * Real snowflakes are 17-20 digits, but 1-20 is accepted so a malformed emote
 * still gets rewritten to readable text instead of leaking raw markup (the id
 * itself is validated before anything is fetched from Discord).
 * All forms are alternated in one pattern (rather than replaced separately) so
 * the overlapping `<@` prefix of user/role mentions can never be rewritten twice.
 */
export const DISCORD_MARKUP_PATTERN =
  /<(a?):([A-Za-z0-9_]+):(\d{1,20})>|<@!?(\d{1,20})>|<@&(\d{1,20})>|<#(\d{1,20})>/g;

/** An emote referenced by a message, useable as an argument to importDiscordEmoji. */
export interface DiscordEmote {
  id: string;
  name: string;
  animated: boolean;
}

/** Every distinct custom emote referenced by `content`, in first-seen order. */
export function collectDiscordEmotes(content: string): DiscordEmote[] {
  const found = new Map<string, DiscordEmote>();
  for (const match of content.matchAll(DISCORD_MARKUP_PATTERN)) {
    const [, animated, name, id] = match;
    if (!id || !name || found.has(id)) continue;
    found.set(id, { id, name, animated: animated === "a" });
  }
  return [...found.values()];
}

/** Resolves a Discord id to a human-readable name, or null when unknown. */
export interface MentionLookup {
  user(id: string): string | null;
  role(id: string): string | null;
  channel(id: string): string | null;
}

/**
 * Rewrite Discord markup into what the chat renderer understands.
 *
 * `emoteNames` maps a Discord emote id to the local custom emoji name it was
 * imported as; a null (import failed) still renders the shorthand as text
 * rather than leaking `<:name:id>` into chat.
 */
export function formatDiscordContent(
  content: string,
  emoteNames: Map<string, string | null>,
  mentions: MentionLookup
): string {
  return content.replace(
    DISCORD_MARKUP_PATTERN,
    (match, _animated, name, emoteId, userId, roleId, channelId) => {
      if (emoteId && name) return `:${emoteNames.get(emoteId) ?? name}:`;
      if (userId) return `@${mentions.user(userId) ?? "user"}`;
      if (roleId) return `@${mentions.role(roleId) ?? "role"}`;
      if (channelId) return `#${mentions.channel(channelId) ?? "channel"}`;
      return match;
    }
  );
}

/** Max length of a bridged message; Discord allows far more than chat displays. */
export const BRIDGED_CONTENT_LIMIT = 500;

/**
 * Clamp a bridged message to the chat length limit without leaving a half
 * written `:emote:` shorthand behind (a cut inside a long shorthand would
 * otherwise render as literal text).
 */
export function clampBridgedContent(
  content: string,
  limit: number = BRIDGED_CONTENT_LIMIT
): string {
  if (content.length <= limit) return content;
  let clipped = content.slice(0, limit);
  const open = clipped.lastIndexOf(":");
  if (open !== -1) {
    const tail = clipped.slice(open + 1);
    // A trailing colon-prefixed fragment with no closing colon is a split
    // shorthand; the empty tail means the clip landed exactly on a colon, which
    // is also the start of a shorthand that got cut.
    if (/^[a-zA-Z0-9_-]*$/.test(tail)) clipped = clipped.slice(0, open);
  }
  return clipped.trimEnd();
}
