# Applied Linguistics implementation audit

The supplied email is the target specification, not evidence of existing functionality.

## Reuse

- `TaskEditor` and `TaskRenderer` serve Classes and Messages. `CollabDoc` uses a separate Tiptap schema in `docKit`, but shares the insertion commands and renderer. Register the same investigation node in both schemas.
- `training/Training.tsx` already provides meaning/form/pronunciation/use, CCQs and anticipated problems. Reuse its analysis form and native activity instead of inventing another MFP format.
- `teachingCoach/{uid}/inquiries` owns research inquiries. Existing version checks and private account rules must remain. Attach selected evidence links to an existing inquiry; do not duplicate it.
- Coach preferences are enforced server-side in `functions/ai/coach.js`. Selected evidence needs a separate reviewed packet, revalidated at every call, and a preference gate. Never hide evidence in the prompt to bypass those gates.
- Classes portfolios contain dated work, teacher notes and learner records. There is no component or model named Interlanguage Tracker in this revision. Build a selected-sample comparison on the existing portfolio model, not an assumed tracker API.

## Access boundaries

- Investigation drafts are private to their author. Sharing must publish only selected, approved evidence into a target-bound embed. A message card is not a grant to its source investigation.
- Resolve recipients against current Classes membership, shared-document permissions or chat membership on the server. Recheck source status on every open. Retain provenance for frozen snapshots while allowing sensitive evidence revocation to take precedence over archival access.
- Learner evidence remains private by default; recorded consent and selected scope are required. Do not copy unrestricted recordings into Messages.
- All integration credentials remain server-side. No placeholder output may be represented as a real corpus result or successful AI analysis.

## External dependency

No corpus provider or commercial redistribution licence has been selected. Teacher-supplied attributed evidence can support the manual investigation journey. Licensed search, corpus-wide frequency, register comparison and collocation statistics must remain unavailable with an explanation until a valid provider adapter and licence are configured and tested.

## Verification

Test manual optional-fields-blank creation through saved/reopened investigation, Collab insertion, Classes learner view/response, permissioned message preview and attachment to an existing inquiry. Include denied cross-account reads, removed membership, revoked evidence, snapshot immutability and disabled Coach context. Distinguish simulations/emulators from complete published-site checks.
