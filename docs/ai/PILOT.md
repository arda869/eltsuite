# AI Lesson Assistant: first implementation increment

Source: [ELT Suite vision, 30 October 2026](https://docs.google.com/document/d/1NQiQAAYew36aRJiipjdxdtkmrY0pdOsovh07JqYIrHc).
Baseline: main at 8d607276e29cad0fdea274d1f2572e1bce4f39e9. This increment is for review, not production activation.

## Implemented

A class-specific, opt-in planning flow: brief → editable outline → explicit approval → teacher plan and separate learner materials → advisory AI review → editable private draft. Every plan content field is editable. Save uses optimistic version checking; drafts reopen from the same account. There is no automatic publication into class lessons. The existing lesson editor and learner delivery are unchanged.

The callable verifies the authenticated teacher profile, account suspension/storage status and class owner/co-teacher role on every action. Viewers and other teachers cannot access the class. Drafts are scoped by authenticated UID; there are no client Firestore grants for the new collections. Super-admin impersonation cannot generate. AI access additionally requires a server flag and a server-managed pilot allowlist.

The provider uses the Responses API with strict JSON schemas and `store: false`; local validation also checks field bounds, timing totals, unique IDs and material references. Plan generation preserves approved stage IDs and timings. A separate model call evaluates eleven rubric criteria; this is not an expert certification. Refusals, incomplete output and malformed results fail closed. Model text is rendered as text, never injected HTML.

The pilot limits each account to 12 model calls per UTC day and the entire pilot to 120. A plan reserves two calls (generation and review). Failed requests consume allowance. Each call caps output at 12,000 tokens. These are conservative engineering defaults, not a pricing promise or an exact currency budget. A provider-side spend limit and verified model pricing are still needed. Usage tokens and the configured model are recorded with completed jobs.

## Enable only after staging review

1. Use a staging Firebase project and provision `OPENAI_API_KEY` in Secret Manager. Never add it to Vite variables or GitHub source.
2. Set server parameters `ELT_AI_MODEL` to an evaluated Responses/Structured Outputs-compatible model and `ELT_AI_ENABLED=true`. No paid model is selected implicitly.
3. Add `aiPilot/{teacherUid}` with `enabled: true` through trusted administration; the client cannot grant itself access.
4. Deploy the callable and verify permissions with two teachers, a co-teacher, a viewer and a learner. Keep production disabled.
5. Configure Firestore TTL for collection group `jobs`, field `expiresAt`. Jobs temporarily retain prompts only as hashes and generated results for retry recovery; expiry is set to 24 hours. TTL is asynchronous, not an exact deletion deadline. Establish operational cleanup and account/class deletion before real pilot records are stored. Saved plans persist until deleted.
6. Build the staging frontend with `VITE_ELT_AI_PILOT=true`. The flag controls discoverability; server checks enforce access. Both frontend and server flags default off.
7. Run real-provider smoke tests with synthetic class context. No live API call has been validated in this change. Review provider retention and data processing settings before using personal information; `store: false` does not by itself mean zero retention.
8. Confirm the review rubric and exemplar lessons with practising teachers, then invite a small pilot. Do not enable the full 10–20 teacher pilot before the gates below pass.

API shape reference: https://developers.openai.com/api/docs/guides/structured-outputs

## Release gates

- Unit contract/provider checks, production TypeScript build, existing smoke/accessibility checks.
- Staging: unauthenticated, learner, viewer, foreign-class, suspended and impersonation requests denied; cross-user draft load/save denied.
- Concurrent retries produce one generation job; identical completed retry returns the saved result; changed payload with the same ID is denied. Test provider timeout and function termination. A stuck job is not automatically retried, to avoid double charging.
- Concurrent requests cannot exceed account/global reservations; budget exhaustion is visible. Verify actual provider usage against stored token counts.
- Two-window save conflict preserves local edits; refresh and reopen restore the saved version. Deletion removes the selected draft only.
- Human evaluation: no critical language/answer/task errors in the accepted sample. Two reviewers score each criterion; target mean >=4/5, no criterion <3, and resolve disagreements before acceptance. These are proposed thresholds requiring calibration.
- Core UI: approve, edit, save, reopen, delete, mobile layout, keyboard use, generation failure and saved-version conflict. Existing teacher pilot flows must still pass.

## Boundaries and next increments

This is the first executable slice of Phase 1, not the entire product vision. Not yet implemented: individual-stage regeneration, exporting plans into existing lesson/task formats, preserved revision history beyond conflict-checked current versions, human-review records, needs analysis, retrieval of learner evidence, preference memory, beliefs interviews, multimedia, trainer workspace and private CPD coach. General planning deliberately reads no learner records.

Before Phase 2, map the existing nested class data rather than adopting the document's illustrative top-level schema. Confirm learner ages, consent, retention, ownership and evidence provenance. Before memory, agree on repetition thresholds and deletion semantics. Keep trainer data and private CPD permissions separate. Establish real model cost and willingness-to-pay findings before committing to commercial quotas.

## Pedagogical evaluation set

Use fixed briefs spanning: A1 adult requests (PPP, 45 minutes), A2 mixed-confidence past narratives (TTT, 60), B1 travel decision (task-based, 60), B2 opinion article (text-based, 75), C1 register noticing (guided discovery, 60), and B1 listening for gist/detail (skills, 45; script only). Include a mixed-level group and an accessibility constraint in each batch. Human-authored reference lessons are still needed; model-generated samples must not be labelled calibrated exemplars.

Score objectives/evidence, coherence, level/context, language, communication, scaffolding, feasibility, instructions, assessment, accessibility, notes/keys. Record a specific stage/task reference for each score and every critical error. Review learner materials independently from the teacher plan. Keep baseline and prompt/model version constant for comparisons.
