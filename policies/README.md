# Policy packs

A pack is the JSON the gateway screens prompts with: a framework and a
version, the classifier model, and rules. Each rule is a yes/no question the
model answers about the prompt with a calibrated probability, the threshold
(P(yes) × 100) at which it fires, and what firing does: `block` stops the
prompt inside the enclave; `escalate` opens a task for the officer the
company's configuration names, and the prompt waits for their approval.

| Pack | Rules | Action |
|---|---|---|
| `eu-ai-act/art5@2` | emotion recognition at work, biometric categorisation, social scoring, exploiting a vulnerability | block |
| `eu-ai-act/annex3@2` | employment decisions, credit and insurance, essential services | escalate |
| `gdpr/art9@2` | special-category data about an identifiable person | block |
| `corporate/baseline@2` | credentials, harm | block |
| `eu-ai-act/art5-tee@1` | the rules of `eu-ai-act/art5@2`, screened in a TEE | block |
| `eu-ai-act/annex3-tee@1` | the rules of `eu-ai-act/annex3@2`, screened in a TEE | escalate |

A pack's `via` says how its model is asked. Absent, it is `decisions`: NEAR AI's
typed decisions, with a calibrated probability, from a model built for them;
Sage is one, and NEAR AI serves it outside its TEEs. `chat` asks a model in a
NEAR-operated TEE through a chat completion, the questions in the instructions
and the prompt as data, and is refused before the prompt is sent to any other.
Its probability is the model's own estimate, not a calibrated one: thresholds
set for Sage say nothing about it, and such a pack needs its own calibration
prompts. A company's configuration can also require `"screening_tee": true`, so
that a pack whose model has no TEE report is refused before the prompt reaches it.

Version 1 of the first four names `levanto/sage-1.4`, which NEAR AI no longer serves under that id: a request for its exact model is refused, so those versions cannot be screened with. A pack on chain never changes, so the model's new id is version 2.

The files here are the sources. What applies is what the registry contract
holds under `id@version` (`../registry`): the enclave reads the pack from the
contract, hashes the bytes it was given, and signs that hash into every
answer's label, with the block it read at. A pack on chain is published once
and never changed; a change is the next version, and a withdrawn version is
marked `deprecated` by its publisher. `publish.sh` puts these files there.

The questions are the pack. Wording them is the whole job: Sage answers the
question asked, and a prompt that breaks a rule nobody wrote passes.
`eu-ai-act/annex3@2` says `escalate` because the Act asks for human oversight
there, not a refusal.
