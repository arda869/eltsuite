# AI Lesson Assistant: first implementation increment

Source: [ELT Suite vision, 30 October 2026](https://docs.google.com/document/d/1NQiQAAYew36aRJiipjdxdtkmrY0pdOsovh07JqYIrHc).
Baseline: main at 8d607276e29cad0fdea274d1f2572e1bce4f39e9. The owner approved an account-only pilot in the existing lesson-lit project with GPT-6.1 Sol and a US$20 monthly API allowance.

## Implemented

A class-specific, opt-in planning flow: brief → editable outline → explicit approval → teacher plan and separate learner materials → advisory AI review → editable private draft. Every plan content field is editable. Save uses optimistic version checking; drafts reopen from the same account. There is no automatic publication into class lessons. The existing lesson editor and learner delivery are unchanged.

The callable verifies the authenticated teacher profile, account suspension/storage status and class owner/co-teacher role on every action. Viewers and other teachers cannot access the class. Drafts are scoped by authenticated UID; there are no client Firestore grants for the new collections. Super-admin impersonation cannot generate. AI access requires a server flag and the configured verified pilot email. Account-only mode overrides any allowlist entries. The frontend hides the entry for other accounts.

The provider uses the Responses API with strict JSON schemas and `store: false`; local validation also checks field bounds, timing totals, unique IDs and material references. Plan generation preserves approved stage IDs and timings. A separate model call evaluates eleven rubric criteria; this is not an expert certification. Refusals, incomplete output and malformed results fail closed. Model text is rendered as text, never injected HTML.

The pilot limits each account to 12 model calls per UTC day and the entire pilot to 120. A plan reserves two calls (generation and review). Failed requests consume allowance. Each call caps output at 12,000 tokens. An additional project-wide US$20 monthly API allowance is enforced in Firestore transactions. Before each request, the service reserves $0.32 per model call (100K input and 12K output tokens at the verified Sol rates); completed jobs settle against validated usage, while failed/unknown jobs keep their reservation. Total request UTF-8 size, including schema and instructions, is bounded to leave framing headroom. Rates are reviewed before 1 December 2026; generation pauses then until updated. The cap is an application accounting limit at these rates, excludes Firebase/tax/other API usage, and should be paired with provider billing controls. Months reset at UTC month boundaries. Usage tokens and the configured model are recorded with completed jobs.

## Account-only deployment in lesson-lit

The existing project is used at the owner's request. The existing GitHub service account deploys the callable before the frontend. Preflight reads OPENAI_API_KEY metadata only, requires an enabled version, and configures asynchronous 24-hour job TTL. It does not retrieve the key value. Deployment stops if the required assistant deployment or unauthenticated-request check fails.

Server configuration: ELT_AI_MODEL=gpt-6.1-sol, ELT_AI_ENABLED=true, ELT_AI_PILOT_EMAIL=ardanurioglu@gmail.com. The address is the repository's existing owner identity; Firebase must report it as verified. The production frontend uses the same email filter. No other teacher is enrolled. The OPENAI_API_KEY payload remains in Secret Manager and is bound only to the callable. Test builds use an isolated mock identity.

Rollback: set ELT_AI_ENABLED=false and redeploy the callable. Hide the entry by rebuilding with VITE_ELT_AI_PILOT=false. Existing class features are unaffected. Do not delete aiBudgets records to restart a failed request; those reservations prevent untracked spending. Deleting temporary job records does not delete monthly accounting.

The first signed-in test is performed by the owner with synthetic class context. Full multi-user security/concurrency testing and human pedagogical calibration remain required before expanding the pilot. No claim of DELTA-level output quality is made.

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
