#!/bin/bash
# Builds the compliance gateway for wasm32-wasip2 and checks the artefact:
# the manifest is embedded (it is the outbound allowlist and names the author
# secret), the module imports outlayer:encryption-keys, and it fits FastFS.
set -e

cd "$(dirname "$0")"

WASM_FILE="target/wasm32-wasip2/release/compliance-gateway.wasm"
MAX_SIZE=$((2 * 1024 * 1024))  # 2MB in bytes

echo "Building WASI module (wasm32-wasip2)..."
rustup target add wasm32-wasip2 2>/dev/null || true
# Panic locations carry source paths into the artefact. They are rewritten to
# fixed prefixes, so the wasm (and its sha256, which OutLayer's attestation
# names) does not depend on who built it or where the repository lives — the
# same toolchain (rust-toolchain.toml) and Cargo.lock give the same bytes.
CARGO_HOME_DIR="${CARGO_HOME:-$HOME/.cargo}"
RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$CARGO_HOME_DIR=/cargo --remap-path-prefix=$PWD=/build" \
    cargo build --target wasm32-wasip2 --release
echo ""

SIZE=$(stat -f%z "$WASM_FILE" 2>/dev/null || stat -c%s "$WASM_FILE" 2>/dev/null)
echo "WASM module: $WASM_FILE"
echo "Size: $((SIZE / 1024)) KB"

if ! grep -qa 'outlayer.manifest' "$WASM_FILE"; then
    echo "ERROR: outlayer.manifest custom section is missing from $WASM_FILE"
    exit 1
fi
echo "Manifest section: present"

if strings "$WASM_FILE" | grep -q -e "$HOME" -e "$PWD"; then
    echo "ERROR: $WASM_FILE still carries local paths"
    exit 1
fi
echo "OK: no local paths"

if ! command -v wasm-tools >/dev/null 2>&1; then
    echo "ERROR: wasm-tools is not installed; it checks that $WASM_FILE imports outlayer:encryption-keys"
    exit 1
fi
if ! wasm-tools component wit "$WASM_FILE" 2>/dev/null | grep -q "outlayer:encryption-keys"; then
    echo "ERROR: $WASM_FILE does not import outlayer:encryption-keys"
    exit 1
fi
echo "OK: outlayer:encryption-keys is imported"

# The operations the manifest lists are the ones `main` dispatches on.
python3 - manifest.json src/main.rs <<'PY'
import json, re, sys
declared = set(json.load(open(sys.argv[1]))["operations"])
src = open(sys.argv[2]).read()
body = re.search(r'enum Input \{(.*?)\n\}', src, re.S).group(1)
variants = re.findall(r'^\s*([A-Z][A-Za-z]*)', body, re.M)
dispatched = {re.sub(r'(?<!^)([A-Z])', r'_\1', v).lower() for v in variants}
if declared != dispatched:
    print(f"ERROR: manifest operations {sorted(declared)} vs Input variants {sorted(dispatched)}")
    sys.exit(1)
print(f"Manifest: {len(declared)} operations agree with the code")
PY

HASH=$(shasum -a 256 "$WASM_FILE" | cut -d' ' -f1)
echo "SHA256: $HASH"

if [ "$SIZE" -gt "$MAX_SIZE" ]; then
    echo "ERROR: Size exceeds the 2MB FastFS limit"
    exit 1
fi
echo "OK: Size is within 2MB limit for FastFS"
