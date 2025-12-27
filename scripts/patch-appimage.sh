#!/bin/bash
# Script to patch the AppImage with custom AppRun for Wayland LD_PRELOAD support
# Run this after `bun run tauri build`

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APPIMAGE_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/appimage"
CUSTOM_APPRUN="$PROJECT_ROOT/src-tauri/AppRun"

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
else
    APPIMAGETOOL="appimagetool"
fi

# Create temp directory
EXTRACT_DIR=$(mktemp -d)
echo "Extracting to $EXTRACT_DIR..."

# Extract the AppImage
cd "$EXTRACT_DIR"
"$APPIMAGE" --appimage-extract > /dev/null

# Replace AppRun with our custom one
echo "Replacing AppRun with custom version..."
cp "$CUSTOM_APPRUN" "$EXTRACT_DIR/squashfs-root/AppRun"
chmod +x "$EXTRACT_DIR/squashfs-root/AppRun"

# Repackage
PATCHED_APPIMAGE="${APPIMAGE%.AppImage}-patched.AppImage"
echo "Repacking to $PATCHED_APPIMAGE..."
ARCH=x86_64 "$APPIMAGETOOL" "$EXTRACT_DIR/squashfs-root" "$PATCHED_APPIMAGE" > /dev/null 2>&1

# Cleanup
rm -rf "$EXTRACT_DIR"

# Replace original with patched version
mv "$PATCHED_APPIMAGE" "$APPIMAGE"

echo "Done! AppImage patched successfully: $APPIMAGE"
