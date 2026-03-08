#!/bin/sh

set -eu

is_port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

next_free_port() {
  port="$1"
  while is_port_in_use "$port"; do
    port=$((port + 1))
  done
  printf '%s' "$port"
}

main_start_port="${ABLETON_HUD_MAIN_DEBUG_PORT:-9230}"
renderer_start_port="${ABLETON_HUD_RENDERER_DEBUG_PORT:-9222}"

main_port="$(next_free_port "$main_start_port")"
renderer_port="$(next_free_port "$renderer_start_port")"

echo "AOSC debug ports:"
echo "  main inspector:     $main_port"
echo "  renderer debugger:  $renderer_port"

exec electron-vite dev --inspect "$main_port" --remoteDebuggingPort "$renderer_port" "$@"
