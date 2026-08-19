#!/usr/bin/env bash
#
# discord-notify.sh
# Sends a Discord webhook message when a MediaMTX stream goes live.
#
# Usage (in mediamtx.yml):
#
#   paths:
#     all_others:
#       runOnPublish: /path/to/discord-notify.sh
#       runOnPublishRestart: no
#
# Or for a specific path:
#
#   paths:
#     mystream:
#       runOnPublish: /path/to/discord-notify.sh
#
# MediaMTX exposes info about the stream as environment variables when it
# runs this hook, e.g. MTX_PATH, MTX_SOURCE_TYPE, MTX_SOURCE_ID, MTX_QUERY.
# See: https://github.com/bluenviron/mediamtx#authentication (runOnPublish section)

set -euo pipefail

# ---- Configuration --------------------------------------------------------
# Set this to your Discord webhook URL, or export DISCORD_WEBHOOK_URL before
# calling this script (recommended, so you don't hardcode secrets here).
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

# Optional: a public base URL where viewers can watch the stream.
# Leave empty to omit from the message.
STREAM_BASE_URL="${STREAM_BASE_URL:-}"

# ---- Sanity checks ----------------------------------------------------------
if [[ -z "$WEBHOOK_URL" ]]; then
    echo "discord-notify.sh: DISCORD_WEBHOOK_URL is not set, aborting." >&2
    exit 1
fi

STREAM_PATH="${MTX_PATH:-unknown}"
SOURCE_TYPE="${MTX_SOURCE_TYPE:-unknown}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Build a watch link if a base URL was provided
WATCH_LINE=""
if [[ -n "$STREAM_BASE_URL" ]]; then
    WATCH_LINE="\n\n[Watch here](${STREAM_BASE_URL%/}/${STREAM_PATH})"
fi

# Escape double quotes/backslashes in the path for safe JSON embedding
ESCAPED_PATH=$(printf '%s' "$STREAM_PATH" | sed 's/\\/\\\\/g; s/"/\\"/g')

# ---- Build payload ----------------------------------------------------------
read -r -d '' PAYLOAD <<EOF || true
{
  "username": "MediaMTX",
  "embeds": [
    {
      "title": "🔴 Stream is live!",
      "description": "**Path:** \`${ESCAPED_PATH}\`\\n**Source:** ${SOURCE_TYPE}${WATCH_LINE}",
      "color": 5763719,
      "timestamp": "${TIMESTAMP}"
    }
  ]
}
EOF

# ---- Send it -----------------------------------------------------------------
HTTP_STATUS=$(curl -s -o /tmp/discord-notify-response.log -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "${PAYLOAD}" \
    "${WEBHOOK_URL}")

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
    echo "discord-notify.sh: notification sent (HTTP ${HTTP_STATUS})."
else
    echo "discord-notify.sh: failed to send notification (HTTP ${HTTP_STATUS})." >&2
    cat /tmp/discord-notify-response.log >&2 || true
    exit 1
fi
