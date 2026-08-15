#!/usr/bin/env bash

set -euo pipefail

# Resolve project root relative to this script
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CLIENT_PID=""
SERVER_PID=""

cleanup() {
    echo ""
    echo "Stopping dev servers..."
    [[ -n "$CLIENT_PID" ]] && kill "$CLIENT_PID" 2>/dev/null || true
    [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM EXIT

echo "Starting client (Vite) and server (tsx watch)..."
pnpm run dev &
CLIENT_PID=$!
pnpm run dev:server &
SERVER_PID=$!

# Wait for either process to finish, then let cleanup() tear down the rest
wait -n "$CLIENT_PID" "$SERVER_PID" 2>/dev/null || true
