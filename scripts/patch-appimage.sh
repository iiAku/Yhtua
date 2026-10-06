#!/usr/bin/env bash

# Repack the AppImage with its existing runtime so every packaged file is
# usable by whichever user mounts it, then verify the shipped artifact: no
# bundled Wayland client library, and a launch chain everyone can execute.

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_root=$(dirname -- "$script_dir")
bundle_dir="$project_root/target/release/bundle/appimage"

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
if ! command -v unsquashfs >/dev/null; then
  echo "unsquashfs (squashfs-tools) is required to verify the AppImage" >&2
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

# A bundled libwayland-client conflicts with the host compositor and graphics
# stack. linuxdeploy excludes it; fail loudly if a bundler change brings it back.
if find "$appdir/usr/lib" -maxdepth 1 -name 'libwayland-client.so*' -print -quit | grep -q .; then
  echo "AppImage bundles libwayland-client, which must come from the host" >&2
  exit 1
fi

# Tauri's tool cache is 0770 and older bundlers copied that mode into the
# AppDir as AppRun.wrapped. The squashfs stores files as root, so sandboxes
# that mount it with kernel permission checks (firejail, the AppImage catalog)
# denied everyone else: "AppRun.wrapped: Permission denied".
chmod -R a+rX,go-w -- "$appdir"
launchers=(AppRun)
if grep -q 'AppRun\.wrapped' "$appdir/AppRun"; then
  launchers+=(AppRun.wrapped)
fi
for launcher in "${launchers[@]}"; do
  chmod a+rx -- "$appdir/$launcher"
done

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

# Check the packed artifact's stored modes. Runtime extraction cannot be used:
# it creates every directory 0700 regardless of what the image records.
patched_offset=$("$patched" --appimage-offset)
mapfile -t restricted < <(
  unsquashfs -lln -o "$patched_offset" "$patched" |
    awk -v launchers="${launchers[*]}" '
      BEGIN {
        count = split(launchers, names, " ")
        for (i = 1; i <= count; i++) required["squashfs-root/" names[i]] = 1
      }
      {
        mode = $1
        path = substr($0, index($0, "squashfs-root"))
        if (mode ~ /^l/) next
        if (path in required) {
          delete required[path]
          if (mode !~ /^-r.xr.xr.x$/) { print path; next }
        }
        if (substr(mode, 8, 1) != "r" || substr(mode, 6, 1) == "w" || substr(mode, 9, 1) == "w" ||
            (substr(mode, 4, 1) ~ /[xs]/ && substr(mode, 10, 1) !~ /[xt]/) ||
            (mode ~ /^d/ && substr(mode, 10, 1) !~ /[xt]/)) print path
      }
      END { for (path in required) print path " (missing)" }
    '
)
if (( ${#restricted[@]} > 0 )); then
  echo "Patched AppImage has files other users cannot read or execute:" >&2
  printf '  %s\n' "${restricted[@]}" >&2
  exit 1
fi

mv -- "$patched" "$appimage"
echo "Patched AppImage: $appimage"
