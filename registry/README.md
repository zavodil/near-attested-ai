# Policy registry

A NEAR contract that holds policy packs by `id@version`: published once,
deprecated by their publisher, never changed or deleted.

| Method | Who | Does |
|---|---|---|
| `publish(id, version, bytes)` | anyone, payable | stores the pack; refused when that version exists. The signer is its publisher, the block its time. Attach the storage cost; the excess comes back |
| `deprecate(id, version)` | the publisher | marks the version withdrawn; the bytes stay |
| `get(id, version)` | view | the pack with its bytes |
| `get_meta(id, version)` | view | the pack without its bytes: `sha256`, `publisher`, `published_at`, `deprecated`, `size` |
| `versions(id)` | view | every version of `id`, oldest first |
| `list(from_index?, limit?)` | view | a page of every pack, in publishing order (100 at most) |
| `count()` | view | how many packs |

`id` is `framework/pack` — lowercase letters, digits and `-` on both sides,
64 characters at most. `bytes` is a JSON object of at most 16 KB; the
contract reads nothing of it but that.

What the gateway does with it: it reads the pack through `near:rpc` `view`,
hashes the bytes it was given, screens with the rules, and signs the hash,
the registry's account and the block height into the answer's label. A
verifier asks the contract for the same `id@version` and compares the hash;
an RPC that lied yields a hash the chain does not hold.

```bash
./build.sh                                   # cargo near build; res/policy_registry.wasm
cargo test
near contract deploy <account> use-file res/policy_registry.wasm with-init-call new json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
../policies/publish.sh <account> <publisher> testnet
```

Built with near-sdk 5.9 on Rust 1.85 (`rust-toolchain.toml`), the toolchain
OutLayer's own contracts use.
