#!/usr/bin/env bash
# Builds the registry with cargo-near and prints the wasm's sha256.
set -euo pipefail
cd "$(dirname "$0")"
cargo near build non-reproducible-wasm
WASM=target/near/policy_registry.wasm
mkdir -p res && cp "$WASM" res/policy_registry.wasm
echo "SHA256: $(shasum -a 256 res/policy_registry.wasm | cut -d' ' -f1)"
ls -lh res/policy_registry.wasm
