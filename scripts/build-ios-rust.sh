#!/usr/bin/env bash
# Builds the yhtua-mobile Rust static library for iOS (device + simulator),
# generates the UniFFI Swift bindings, and packages an XCFramework for the
# Expo native module. macOS-only (needs xcodebuild); the mobile-bridge CI job
# and the EAS pre-install hook are the only intended callers. Everything is
# pinned: the Rust toolchain comes from rust-toolchain.toml and the binding
# generator is the locked workspace bin target — never a floating install.
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "build-ios-rust.sh requires macOS (xcodebuild)" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

default_out="$repo_root/apps/mobile/modules/yhtua-vault/ios/rust"
out_dir="${1:-$default_out}"
# This script REPLACES its output directory, so it accepts only the module's
# own rust/ directory or a dedicated temp path — never an arbitrary location,
# and never a directory holding anything but a previous run's artifacts.
case "$out_dir" in
  "$default_out") ;;
  "${RUNNER_TEMP:-/nonexistent-runner-temp}"/yhtua-vault-ios*) ;;
  "${TMPDIR:-/tmp}"/yhtua-vault-ios*) ;;
  *)
    echo "refusing output path (use $default_out or a *?/yhtua-vault-ios* temp dir): $out_dir" >&2
    exit 1
    ;;
esac
if [[ -e "$out_dir" && ! -e "$out_dir/YhtuaMobile.xcframework" ]]; then
  echo "refusing to replace $out_dir: it holds no previous build output" >&2
  exit 1
fi
staging="$(mktemp -d "${TMPDIR:-/tmp}/yhtua-ios-build.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
mkdir -p "$staging/bindings"

rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

cargo build -p yhtua-mobile --release --locked --target aarch64-apple-ios
cargo build -p yhtua-mobile --release --locked --target aarch64-apple-ios-sim
cargo build -p yhtua-mobile --release --locked --target x86_64-apple-ios

# Xcode links simulator apps for both architectures; the simulator slice must
# be universal or the x86_64 link fails with 'library not found'. CocoaPods
# additionally requires the SAME binary name in every slice, hence the subdir.
mkdir -p "$staging/sim"
lipo -create \
  target/aarch64-apple-ios-sim/release/libyhtua_mobile.a \
  target/x86_64-apple-ios/release/libyhtua_mobile.a \
  -output "$staging/sim/libyhtua_mobile.a"

cargo run -p yhtua-mobile --features bindgen --bin uniffi-bindgen --locked -- \
  generate \
  --library target/aarch64-apple-ios/release/libyhtua_mobile.a \
  --language swift \
  --out-dir "$staging/bindings"

# EXACTLY ONE physical yhtua_mobileFFI module map, and the pod owns it. Headers
# inside the XCFramework get staged a second time by CocoaPods, and clang then
# sees two definitions of the module ('redefinition of module yhtua_mobileFFI').
# The header is architecture-independent, so one include/ dir serves both slices.
mkdir -p "$staging/include"
cp "$staging/bindings/yhtua_mobileFFI.h" "$staging/include/"
cp "$staging/bindings/yhtua_mobileFFI.modulemap" "$staging/include/module.modulemap"

xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libyhtua_mobile.a \
  -library "$staging/sim/libyhtua_mobile.a" \
  -output "$staging/YhtuaMobile.xcframework"

rm -rf "$out_dir"
mkdir -p "$(dirname "$out_dir")"
mv "$staging" "$out_dir"
trap - EXIT

echo "XCFramework: $out_dir/YhtuaMobile.xcframework (no headers by design)"
echo "FFI module map: $out_dir/include/module.modulemap"
echo "Swift bindings: $out_dir/bindings/yhtua_mobile.swift"
