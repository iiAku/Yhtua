#!/usr/bin/env bash

set -euo pipefail

if (( $# != 1 )); then
  echo "Usage: $0 <path-to-AppImage>" >&2
  exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
appimage=$(realpath -- "$1")
if [[ ! -x "$appimage" ]]; then
  echo "AppImage is missing or not executable: $appimage" >&2
  exit 1
fi

for command in bun curl python3 setsid xvfb-run; do
  if ! command -v "$command" >/dev/null; then
    echo "Required smoke-test command is unavailable: $command" >&2
    exit 1
  fi
done

smoke_dir=$(mktemp -d)
mkdir -- "$smoke_dir/home" "$smoke_dir/data" "$smoke_dir/config" "$smoke_dir/cache"
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
log_file="$smoke_dir/app.log"
smoke_pid=''

cleanup() {
  if [[ -n $smoke_pid ]] && kill -0 "$smoke_pid" 2>/dev/null; then
    kill -TERM -- "-$smoke_pid" 2>/dev/null || true
    wait "$smoke_pid" 2>/dev/null || true
  fi
  rm -rf -- "$smoke_dir"
}
trap cleanup EXIT

setsid xvfb-run -a -s '-screen 0 1024x900x24' env \
  HOME="$smoke_dir/home" \
  XDG_DATA_HOME="$smoke_dir/data" \
  XDG_CONFIG_HOME="$smoke_dir/config" \
  XDG_CACHE_HOME="$smoke_dir/cache" \
  GDK_BACKEND=x11 \
  XDG_SESSION_TYPE=x11 \
  WAYLAND_DISPLAY= \
  WEBKIT_INSPECTOR_HTTP_SERVER="127.0.0.1:$port" \
  "$appimage" >"$log_file" 2>&1 &
smoke_pid=$!

inspector_page=''
deadline=$((SECONDS + 30))
while (( SECONDS < deadline )); do
  if ! kill -0 "$smoke_pid" 2>/dev/null; then
    echo "AppImage exited before rendering" >&2
    sed -n '1,160p' "$log_file" >&2
    exit 1
  fi
  inspector_page=$(curl --silent --max-time 1 "http://127.0.0.1:$port/" || true)
  if [[ $inspector_page == *'tauri://localhost'* ]]; then
    break
  fi
  sleep 0.25
done

if [[ $inspector_page != *'tauri://localhost'* ]]; then
  echo "AppImage did not navigate to its bundled frontend within 30 seconds" >&2
  sed -n '1,160p' "$log_file" >&2
  exit 1
fi

bun "$script_dir/assert-appimage-ui.ts" "$port"
