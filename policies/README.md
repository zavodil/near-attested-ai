# Policy packs

A pack is the JSON the gateway screens prompts with: a framework and a
version, the classifier model, and rules. Each rule is a yes/no question the
model answers about the prompt with a calibrated probability, the threshold
(P(yes) × 100) at which it fires, and what firing does: `block` stops the
prompt inside the enclave; `escalate` opens a task for the officer the
company's configuration names, and the prompt waits for their approval.

| Pack | Rules | Action |
|---|---|---|
| `eu-ai-act/art5@1` | emotion recognition at work, biometric categorisation, social scoring, exploiting a vulnerability | block |
| `eu-ai-act/annex3@1` | employment decisions, credit and insurance, essential services | escalate |
| `gdpr/art9@1` | special-category data about an identifiable person | block |
| `corporate/baseline@1` | credentials, harm | block |

The files here are the sources. What applies is what the registry contract
holds under `id@version` (`../registry`): the enclave reads the pack from the
contract, hashes the bytes it was given, and signs that hash into every
answer's label, with the block it read at. A pack on chain is published once
and never changed; a change is the next version, and a withdrawn version is
marked `deprecated` by its publisher. `publish.sh` puts these files there.

The questions are the pack. Wording them is the whole job: Sage answers the
question asked, and a prompt that breaks a rule nobody wrote passes.
`eu-ai-act/annex3@1` says `escalate` because the Act asks for human oversight
there, not a refusal.
