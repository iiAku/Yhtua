#!/usr/bin/env bash

set -euo pipefail

if (( $# != 1 )); then
  echo "Usage: $0 <path-to-AppImage>" >&2
  exit 2
fi

appimage=$(realpath -- "$1")
if [[ ! -x "$appimage" ]]; then
  echo "AppImage is missing or not executable: $appimage" >&2
  exit 1
fi

for command in setsid xvfb-run; do
  if ! command -v "$command" >/dev/null; then
    echo "Required smoke-test command is unavailable: $command" >&2
    exit 1
  fi
done

smoke_dir=$(mktemp -d)
mkdir -- "$smoke_dir/home" "$smoke_dir/data" "$smoke_dir/config" "$smoke_dir/cache"
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
  YHTUA_UI_SMOKE_TEST=1 \
  "$appimage" >"$log_file" 2>&1 &
smoke_pid=$!

deadline=$((SECONDS + 30))
while (( SECONDS < deadline )); do
  if ! kill -0 "$smoke_pid" 2>/dev/null; then
    echo "AppImage exited before rendering" >&2
    sed -n '1,160p' "$log_file" >&2
    exit 1
  fi
  if grep -Fxq 'YHTUA_UI_SMOKE_READY' "$log_file"; then
    echo 'Packaged application UI rendered successfully'
    exit 0
  fi
  sleep 0.25
done

echo "AppImage did not render a usable bundled frontend within 30 seconds" >&2
sed -n '1,160p' "$log_file" >&2
exit 1
