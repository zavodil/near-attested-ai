#!/usr/bin/env bash
# Creates the demo company's people on testnet, funds them and buys their
# payment keys. A person runs this: it creates accounts and moves tokens.
#
#   demo/setup.sh
#
# Each account comes from the testnet faucet with 10 NEAR, its key in the legacy
# keychain (~/.near-credentials/testnet). Everyone who calls the project gets a
# payment key topped up with USD dollars of FUNDER's testnet USDC. The keys go
# to demo/accounts.env, mode 600 and ignored by git, and are never printed.
# Running it again skips what exists.
set -euo pipefail
cd "$(dirname "$0")"
FUNDER=${FUNDER:-outlayer-bob.testnet}
USD=${USD:-5}
TOKEN=usdc.fakes.testnet
CLI=${OUTLAYER_CLI:-$HOME/projects/outlayer-cli/target/release/outlayer}
OUT=accounts.env
export OUTLAYER_NETWORK=testnet
[[ -x "$CLI" ]] || { echo "no outlayer CLI at $CLI: set OUTLAYER_CLI" >&2; exit 1; }
touch "$OUT"; chmod 600 "$OUT"

exists() { near account view-account-summary "$1" network-config testnet now </dev/null >/dev/null 2>&1; }
retry() { local i; for i in 1 2 3 4 5; do "$@" && return 0; echo "  retrying in $((i * 6)) s" >&2; sleep $((i * 6)); done; return 1; }

create() {
  local account=$1
  if exists "$account"; then echo "$account: exists"; return; fi
  # In the open, on the terminal: near-cli may ask something here, and a hidden question waits forever.
  echo "$account: creating"
  near --quiet account create-account sponsor-by-faucet-service "$account" autogenerate-new-keypair save-to-legacy-keychain network-config testnet create || return 1
  exists "$account" || { echo "$account: the faucet answered, the account is not on chain yet" >&2; return 1; }
  [[ -f "$HOME/.near-credentials/testnet/$account.json" ]] || { echo "$account: its key is not in the legacy keychain" >&2; return 1; }
  echo "$account: created"
}

buy_key() {
  local role=$1 account=$2 var home nonce
  var="$(tr '[:lower:]' '[:upper:]' <<<"$role")_PAYMENT_KEY"
  if grep -q "^$var=" "$OUT"; then echo "$account: has a payment key"; return; fi
  near contract call-function as-transaction "$TOKEN" storage_deposit json-args "$(jq -nc --arg a "$account" '{account_id:$a, registration_only:true}')" \
    prepaid-gas '30.0 Tgas' attached-deposit '0.00125 NEAR' sign-as "$account" network-config testnet sign-with-legacy-keychain send </dev/null >/dev/null 2>&1
  near contract call-function as-transaction "$TOKEN" ft_transfer json-args "$(jq -nc --arg a "$account" --arg m "$((USD * 1000000))" '{receiver_id:$a, amount:$m}')" \
    prepaid-gas '30.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as "$FUNDER" network-config testnet sign-with-legacy-keychain send </dev/null >/dev/null 2>&1
  home=$(mktemp -d -t acme.XXXX); chmod 700 "$home"; mkdir -p "$home/testnet"
  (umask 077; jq --arg a "$account" '{account_id:$a, public_key, private_key, contract_id:"outlayer.testnet", auth_type:"near_key"}' "$HOME/.near-credentials/testnet/$account.json" > "$home/testnet/credentials.json")
  nonce=$(OUTLAYER_HOME=$home "$CLI" keys create </dev/null 2>&1 >/dev/null | sed 's/\x1b\[[0-9;]*m//g' | sed -n 's/.*nonce: \([0-9]*\).*/\1/p' | head -1)
  [[ -n "$nonce" ]] || { rm -rf "$home"; echo "$account: the key was not created" >&2; return 1; }
  printf '%s=%s\n' "$var" "$(OUTLAYER_HOME=$home "$CLI" keys show "$nonce" </dev/null)" >> "$OUT"
  OUTLAYER_HOME=$home "$CLI" keys topup "$nonce" --usd "$USD" </dev/null >/dev/null 2>&1 || echo "$account: the top-up failed; run: outlayer keys topup $nonce --usd $USD" >&2
  rm -rf "$home"
  echo "$account: payment key $nonce, \$$USD"
}

echo "creating accounts: near-cli asks on this terminal if it needs an answer"
for account in $(jq -r '[.company, .employees[], .officers[], .outsider] | .[].account' roles.json); do retry create "$account"; done
jq -r '[.company, .employees[], .outsider] | .[] | "\(.role) \(.account)"' roles.json | while read -r role account; do retry buy_key "$role" "$account"; done
echo "done: $(grep -c '_PAYMENT_KEY=' "$OUT") payment keys in demo/$OUT"
