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

out_dir="${1:-$repo_root/apps/mobile/modules/yhtua-vault/ios/rust}"
# Refuse to delete anything outside the repository or the CI temp dir; build
# into a fresh staging directory and swap it in atomically at the end.
case "$out_dir" in
  "$repo_root"/*|"${RUNNER_TEMP:-/nonexistent-runner-temp}"/*|"${TMPDIR:-/tmp}"/*) ;;
  *)
    echo "refusing output path outside the repository or temp dirs: $out_dir" >&2
    exit 1
    ;;
esac
staging="$(mktemp -d "${TMPDIR:-/tmp}/yhtua-ios-build.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
mkdir -p "$staging/bindings"

rustup target add aarch64-apple-ios aarch64-apple-ios-sim

cargo build -p yhtua-mobile --release --locked --target aarch64-apple-ios
cargo build -p yhtua-mobile --release --locked --target aarch64-apple-ios-sim

cargo run -p yhtua-mobile --features bindgen --bin uniffi-bindgen --locked -- \
  generate \
  --library target/aarch64-apple-ios/release/libyhtua_mobile.a \
  --language swift \
  --out-dir "$staging/bindings"

# XCFramework headers: the FFI header + modulemap (named module.modulemap so
# the framework is importable without extra flags).
for slice in device simulator; do
  mkdir -p "$staging/headers-$slice"
  cp "$staging/bindings/yhtua_mobileFFI.h" "$staging/headers-$slice/"
  cp "$staging/bindings/yhtua_mobileFFI.modulemap" "$staging/headers-$slice/module.modulemap"
done

xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libyhtua_mobile.a \
  -headers "$staging/headers-device" \
  -library target/aarch64-apple-ios-sim/release/libyhtua_mobile.a \
  -headers "$staging/headers-simulator" \
  -output "$staging/YhtuaMobile.xcframework"

rm -rf "$out_dir"
mkdir -p "$(dirname "$out_dir")"
mv "$staging" "$out_dir"
trap - EXIT

echo "XCFramework: $out_dir/YhtuaMobile.xcframework"
echo "Swift bindings: $out_dir/bindings/yhtua_mobile.swift"
