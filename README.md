# hikkistreamer
self hosting live streaming + chat tool

## Niconico-style comment overlay
Chat messages scroll right-to-left across the video (toggleable from the footer
controls). When a Twitch channel is the active playlist item, live Twitch chat
is bridged in via an anonymous `tmi.js` connection (zero-config) and scrolls
over the video too. Bridged Twitch messages appear only on the comment overlay —
they are not shown in the chat panel and are not persisted to history.

Optionally run the bridge as a registered bot account (higher per-connection
rate limits):

| Variable | Purpose |
| --- | --- |
| `TWITCH_BOT_USERNAME` | Bot account username (lowercase). |
| `TWITCH_BOT_OAUTH` | OAuth token (`oauth:...`) for the bot account. |

Without these, the bridge connects anonymously (read-only). Chat sends are
rate-limited server-side (8 messages / 20s per user).
