#!/usr/bin/env bash
# Publishes the module as the company's projects and stores the rows, once
# demo/setup.sh has made the accounts: the same wasm with the same hash, a
# configuration naming an officer per rule, each officer's empty row, and the
# rows the scenario's refused attempts name. Needs NEARAI_API_KEY in ../.env.
set -euo pipefail
cd "$(dirname "$0")"
NEAR_OFFSHORE=${NEAR_OFFSHORE:-$HOME/projects/near-offshore}
CLI=${OUTLAYER_CLI:-$HOME/projects/outlayer-cli/target/release/outlayer}
export NETWORK=testnet OUTLAYER_NETWORK=testnet PATH="$(dirname "$CLI"):$PATH"
set -a; source ../.env; set +a
: "${NEARAI_API_KEY:?NEARAI_API_KEY is not in ../.env}"
source "$NEAR_OFFSHORE/tests/lib/hos_common.sh" >/dev/null 2>&1

(cd ../module && ./build.sh >/dev/null)
WASM=$PWD/../module/target/wasm32-wasip2/release/compliance-gateway.wasm
SHA=$(shasum -a 256 "$WASM" | cut -d' ' -f1)
URL=$(fastfs_upload "$WASM" "$SHA")
echo "module $SHA"

role() { jq -r "$1" roles.json; }
COMPANY=$(role .company.account); PROJECT=$(role .project); TEE=$(role .tee_project); RECRUITER=$(role .employees[0].account)
HR=$(role '.officers[] | select(.takes == "employment_decision") | .account'); RISK=$(role '.officers[] | select(.takes == "annex3") | .account')
PEOPLE=$(role '[.company, .employees[]] | map(.account) | join(",")'); OUTSIDER=$(role .outsider.account); PERSONAL=$(role .personal_project)
MODEL=deepseek-ai/DeepSeek-V4.1-Flash-1017

source_json() { jq -nc --arg u "$URL" --arg h "$SHA" '{WasmUrl:{url:$u, hash:$h, build_target:"wasm32-wasip2"}}'; }
tx() {
  local method=$1 args=$2 out i
  for i in 1 2 3 4; do
    out=$(near contract call-function as-transaction outlayer.testnet "$method" json-args "$args" prepaid-gas '300.0 Tgas' attached-deposit '0.1 NEAR' sign-as "$COMPANY" network-config testnet sign-with-legacy-keychain send 2>&1) && grep -q succeeded <<<"$out" && return 0
    grep -q "already exists" <<<"$out" && return 2
    sleep 4
  done
  near_why "$out" >&2; return 1
}
publish() {
  local status=0
  tx create_project "$(jq -nc --arg n "$1" --argjson s "$(source_json)" '{name:$n, source:$s}')" || status=$?
  if [[ $status == 2 ]]; then tx add_version "$(jq -nc --arg n "$1" --argjson s "$(source_json)" '{project_name:$n, source:$s, set_active:true}')" || [[ $? == 2 ]]; elif [[ $status != 0 ]]; then return 1; fi
  echo "project $COMPANY/$1"
}
store() { # account project profile access json
  local home r i
  home=$(mktemp -d -t acme.XXXX); chmod 700 "$home"; mkdir -p "$home/testnet"
  (umask 077; jq --arg a "$1" '{account_id:$a, public_key, private_key, contract_id:"outlayer.testnet", auth_type:"near_key"}' "$HOME/.near-credentials/testnet/$1.json" > "$home/testnet/credentials.json")
  for i in 1 2 3 4; do
    r=$(OUTLAYER_HOME=$home "$CLI" secrets set "$5" --project "$2" --profile "$3" --access "$4" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -c "Secrets stored" || true)
    [[ "$r" != 0 ]] && break; sleep 5
  done
  rm -rf "$home"
  [[ "$r" != 0 ]] || { echo "row $1 $2 $3 was not stored" >&2; return 1; }
  echo "row $1 under $2, profile $3"; sleep 3
}
config() { jq -nc --arg o "$(role .org_name)" --arg m "$MODEL" --arg hr "$HR" --arg risk "$RISK" --arg a "$1" --argjson f "$2" --argjson t "$3" \
  '{org_name:$o, frameworks:$f, models:[$m], screening_tee:$t, escalate:{($a + "/employment_decision"):$hr, ($a):$risk}}'; }
company_row() { jq -nc --arg k "$NEARAI_API_KEY" --arg c "$1" '{NEARAI_API_KEY:$k, COMPLIANCE_CONFIG:$c}'; }

publish "$PROJECT"; sleep 2; publish "$TEE"
store "$COMPANY" "$COMPANY/$PROJECT" company "whitelist:$PEOPLE" "$(company_row "$(config eu-ai-act/annex3 '["eu-ai-act/art5@1","eu-ai-act/annex3@1","gdpr/art9@1","corporate/baseline@1"]' false)")"
store "$COMPANY" "$COMPANY/$TEE" company "whitelist:$PEOPLE" "$(company_row "$(config eu-ai-act/annex3-tee '["eu-ai-act/art5-tee@1","eu-ai-act/annex3-tee@1"]' true)")"
for officer in "$HR" "$RISK"; do for p in "$PROJECT" "$TEE"; do store "$officer" "$COMPANY/$p" default "whitelist:$PEOPLE" '{}'; done; done
OWN=$(jq -nc '{org_name:"Not the company", frameworks:["corporate/baseline@1"]}')
store "$RECRUITER" "$COMPANY/$PROJECT" attack-config "whitelist:$RECRUITER" "$(jq -nc --arg c "$OWN" '{COMPLIANCE_CONFIG:$c}')"
store "$RECRUITER" "$COMPANY/$PROJECT" attack-key "whitelist:$RECRUITER" "$(jq -nc --arg k "$NEARAI_API_KEY" '{NEARAI_API_KEY:$k}')"
store "$RECRUITER" "$PERSONAL" attack-own "whitelist:$RECRUITER" "$(company_row "$OWN")"
store "$OUTSIDER" "$PERSONAL" personal "whitelist:$OUTSIDER" "$(jq -nc --arg k "$NEARAI_API_KEY" '{NEARAI_API_KEY:$k}')"
