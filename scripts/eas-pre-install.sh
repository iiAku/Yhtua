#!/usr/bin/env bash
# EAS build pre-install hook (runs on the EAS macOS builder before pod
# install). Self-contained and PINNED: the Rust toolchain comes from
# rust-toolchain.toml, the binding generator is the locked workspace bin, and
# dependencies install frozen — no floating downloads decide what ships.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  export PATH="$HOME/.cargo/bin:$PATH"
fi
# rust-toolchain.toml pins the exact toolchain for every cargo invocation.
rustup show active-toolchain

bash scripts/build-ios-rust.sh "$repo_root/apps/mobile/modules/yhtua-vault/ios/rust"
