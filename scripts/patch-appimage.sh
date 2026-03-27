#!/bin/bash
# Script to patch the AppImage for Wayland compatibility
# - Removes bundled libwayland-client (conflicts with system compositor)
# - Injects LD_PRELOAD into the existing AppRun (preserves Tauri's setup)
# Run this after `bun run tauri build`

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APPIMAGE_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/appimage"

# Find the AppImage file
APPIMAGE=$(find "$APPIMAGE_DIR" -name "*.AppImage" -type f 2>/dev/null | head -n1)

if [[ -z "$APPIMAGE" ]]; then
    echo "Error: No AppImage found in $APPIMAGE_DIR"
    exit 1
fi

echo "Found AppImage: $APPIMAGE"

# Check for appimagetool
if ! command -v appimagetool &> /dev/null; then
    echo "appimagetool not found. Installing..."
    APPIMAGETOOL="/tmp/appimagetool"
    wget -q -O "$APPIMAGETOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
    chmod +x "$APPIMAGETOOL"
    export APPIMAGE_EXTRACT_AND_RUN=1
else
    APPIMAGETOOL="appimagetool"
fi

# Create temp directory
EXTRACT_DIR=$(mktemp -d)
echo "Extracting to $EXTRACT_DIR..."

# Extract the AppImage
cd "$EXTRACT_DIR"
"$APPIMAGE" --appimage-extract > /dev/null

SQUASHFS="$EXTRACT_DIR/squashfs-root"

# Remove bundled libwayland-client to prevent mismatch with system Mesa/EGL drivers
echo "Removing bundled libwayland-client..."
find "$SQUASHFS" -name "libwayland-client.so*" -delete 2>/dev/null || true

# Patch the existing AppRun — write a wrapper that sources the original
echo "Patching AppRun with Wayland LD_PRELOAD..."
APPRUN="$SQUASHFS/AppRun"

if [[ -f "$APPRUN" ]]; then
    mv "$APPRUN" "$APPRUN.orig"
    cat > "$APPRUN" << 'WRAPPER'
#!/bin/bash
SELF=$(readlink -f "$0")
HERE=${SELF%/*}

# Wayland: use system libwayland-client instead of bundled
if [ "${XDG_SESSION_TYPE}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY}" ]; then
    WAYLAND_LIB=$(ldconfig -p 2>/dev/null | grep 'libwayland-client\.so ' | head -n1 | sed 's/.*=> //')
    if [ -n "$WAYLAND_LIB" ]; then
        export LD_PRELOAD="${WAYLAND_LIB}${LD_PRELOAD:+:$LD_PRELOAD}"
    fi
fi
export WEBKIT_DISABLE_DMABUF_RENDERER=1

# Run the original AppRun
exec "${HERE}/AppRun.orig" "$@"
WRAPPER
    chmod +x "$APPRUN"
    echo "Patched AppRun successfully"
else
    echo "Warning: No AppRun found, skipping patch"
fi

# Repackage
PATCHED_APPIMAGE="${APPIMAGE%.AppImage}-patched.AppImage"
echo "Repacking to $PATCHED_APPIMAGE..."
ARCH=x86_64 "$APPIMAGETOOL" "$SQUASHFS" "$PATCHED_APPIMAGE"

# Cleanup
rm -rf "$EXTRACT_DIR"

# Replace original with patched version
mv "$PATCHED_APPIMAGE" "$APPIMAGE"

echo "Done! AppImage patched successfully: $APPIMAGE"
