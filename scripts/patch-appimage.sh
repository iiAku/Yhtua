#!/usr/bin/env bash

# Keep the AppImage's existing runtime while removing the bundled Wayland
# client library that conflicts with host compositor/graphics libraries.

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_root=$(dirname -- "$script_dir")
bundle_dir="$project_root/src-tauri/target/release/bundle/appimage"

if (( $# > 1 )); then
  echo "Usage: $0 [path-to-AppImage]" >&2
  exit 2
fi

if (( $# == 1 )); then
  appimage=$(realpath -- "$1")
else
  mapfile -t appimages < <(find "$bundle_dir" -maxdepth 1 -type f -name '*.AppImage' -print)
  if (( ${#appimages[@]} != 1 )); then
    echo "Expected exactly one AppImage in $bundle_dir; found ${#appimages[@]}" >&2
    exit 1
  fi
  appimage=$(realpath -- "${appimages[0]}")
fi

if [[ ! -f "$appimage" ]]; then
  echo "AppImage not found: $appimage" >&2
  exit 1
fi

cache_root=${XDG_CACHE_HOME:-${HOME:?HOME is required}/.cache}
plugin="$cache_root/tauri/linuxdeploy-plugin-appimage.AppImage"
if [[ ! -x "$plugin" ]]; then
  echo "Tauri's cached AppImage packaging plugin was not found: $plugin" >&2
  exit 1
fi

patch_dir=$(mktemp -d)
cleanup() {
  rm -rf -- "$patch_dir"
}
trap cleanup EXIT

(
  cd -- "$patch_dir"
  "$appimage" --appimage-extract >/dev/null
)

appdir="$patch_dir/squashfs-root"
if [[ ! -x "$appdir/AppRun" || ! -d "$appdir/usr/lib" ]]; then
  echo "Extracted AppImage does not contain the expected AppDir layout" >&2
  exit 1
fi

mapfile -t bundled_wayland < <(
  find "$appdir/usr/lib" -maxdepth 1 \( -type f -o -type l \) -name 'libwayland-client.so*' -print
)
if (( ${#bundled_wayland[@]} == 0 )); then
  echo "AppImage contains no bundled libwayland-client; refusing an ambiguous repatch" >&2
  exit 1
fi
for library in "${bundled_wayland[@]}"; do
  rm -- "$library"
done

mv -- "$appdir/AppRun" "$appdir/AppRun.orig"
cat >"$appdir/AppRun" <<'APP_RUN'
#!/usr/bin/env bash

set -e

self=$(readlink -f -- "$0")
appdir=${self%/*}

# The AppDir intentionally omits libwayland-client. On Wayland, preload the
# compositor's matching host copy before linuxdeploy adds bundled libraries.
if [[ ${XDG_SESSION_TYPE:-} == wayland || -n ${WAYLAND_DISPLAY:-} ]]; then
  host_wayland=$(
    ldconfig -p 2>/dev/null |
      awk '/libwayland-client\.so(\.0)? \(/{print $NF; exit}'
  )
  if [[ -n $host_wayland && -r $host_wayland ]]; then
    export LD_PRELOAD="$host_wayland${LD_PRELOAD:+:$LD_PRELOAD}"
  fi
fi

exec "$appdir/AppRun.orig" "$@"
APP_RUN
chmod 755 "$appdir/AppRun"

runtime_offset=$("$appimage" --appimage-offset)
if [[ ! $runtime_offset =~ ^[0-9]+$ ]] || (( runtime_offset < 1 )); then
  echo "Unable to determine the original AppImage runtime size" >&2
  exit 1
fi
runtime="$patch_dir/runtime-x86_64"
dd if="$appimage" of="$runtime" bs=1 count="$runtime_offset" status=none

tool_dir="$patch_dir/packaging-tool"
mkdir -- "$tool_dir"
(
  cd -- "$tool_dir"
  "$plugin" --appimage-extract >/dev/null
)
appimagetool="$tool_dir/squashfs-root/usr/bin/appimagetool"
if [[ ! -x "$appimagetool" ]]; then
  echo "Unable to extract appimagetool from Tauri's cached packaging plugin" >&2
  exit 1
fi

patched="$patch_dir/$(basename -- "$appimage")"
ARCH=x86_64 "$appimagetool" --runtime-file "$runtime" "$appdir" "$patched"
chmod 755 "$patched"

if find "$appdir/usr/lib" -maxdepth 1 -name 'libwayland-client.so*' -print -quit | grep -q .; then
  echo "Patched AppDir still contains libwayland-client" >&2
  exit 1
fi

mv -- "$patched" "$appimage"
echo "Patched AppImage: $appimage"
