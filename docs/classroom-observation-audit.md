# Classroom Observation Studio: repository audit

Source brief: [Classroom Observation Studio and Action Research Rollout Plan](https://docs.google.com/document/d/1c2J4q0WWVdWDIcnNwwpsBQv9u-hS2KfmAuttZMIveg8/edit).
Audited against main at 7bd7483aa6995bda9eb2899a62ce3359e4ea0178.

## Existing foundations

- Live calls use Daily's custom call object in src/lib/callEngine.ts, with separately managed main and breakout rooms in src/components/LiveVideo.tsx.
- Daily participant session IDs, application account IDs (when supplied), current tracks and active-speaker events are available in the browser. An active-speaker event is not a validated measurement of speaking time.
- callLogs save attendance spans and optionally microphone/camera state. These are not recordings or evidence of engagement. Logs are periodically saved; this is not a complete event history.
- src/lib/live.ts stores current lesson/task, timer, group and board state. Updating that state does not preserve a historical timeline.
- scripts/video.mjs provisions Daily rooms and host tokens. The audited configuration does not enable recording or transcription. No Observation Studio recording storage, transcript pipeline, consent records or signed replay service exists.
- Development Studio already owns private inquiries at teachingCoach/{uid}/inquiries/{id}. Preserve those IDs and records; do not create another research database.
- Applied Linguistics demonstrates server-authorised evidence references and explicit Coach packets. Observation evidence needs its own typed references and permission checks, not copied private text hidden in generic inquiry fields.
- Coach journals and inquiries exclude administrator impersonation. Observation permissions must preserve that boundary.

## Initial implementation boundary

First deliver a complete notes-only inquiry cycle: create an observation; start its elapsed timer; save/edit timestamped notes; distinguish observed facts from interpretations; select evidence; attach references to an existing inquiry; create a repeat observation; compare selected evidence and contextual differences; export a traceable report. Notes-only observation must work for external lessons and with optional fields blank.

Developmental observations are private by default. Formal trainer records need an explicit assignment and institution-owned rubric; teacher role or organisation membership alone must not expose developmental notes. No automatic grading.

No recording, transcript, diarisation or talk-time claims should appear until their end-to-end integrations and consent flows are verified. Future processing must run asynchronously and must not block the call.

## Data and access design

Use stable observation and note IDs, version checks and server timestamps. Store notes as separate documents to avoid unbounded document size. Each note records its author, revision, elapsed lesson offset and origin (manual observation or teacher interpretation). Keep an optional linked class/item and the original observation start time.

Inquiry evidence links reference observation IDs and selected note IDs. Resolve current source access on every read and export. Removing a source, revoking a grant or changing selected evidence invalidates prior Coach packets. Do not persist full source text inside an inquiry link.

Mutations require an active teacher account, no proxy session, and observation ownership or an explicit scoped grant. Formal sign-off must be a separate human action. Source permissions take precedence over all linked destinations.

Use stable client-generated IDs for retryable note saves. A network failure keeps the unsaved note visible and offers retry; a stale version must not overwrite another edit. Never report a note as saved until acknowledged.

## Verification gates

1. Real owner account: create with optional fields blank; add/edit notes; reload; confirm persistence.
2. Failure/retry: rejected save retains text; retry produces one note, not duplicates.
3. Two account access tests: unrelated teacher, organisation admin and impersonation cannot read private observations.
4. Existing inquiry: attach selected notes only; keep its original ID; compare two observations; export with provenance and limitations.
5. Explicit Coach selection: only selected evidence reaches the existing Coach; revoked/changed source blocks reuse.
6. Formal records: assigned trainer can complete rubric and sign off without access to private journals.
7. Live lesson links: launch from the correct class/item; manual external observation remains usable.
8. Published UI: complete the full journey and distinguish emulator/provider simulations from real live evidence.

Recording capability, provider entitlements, costs, retention/deletion and consent requirements remain separate implementation gates. The repository audit alone does not establish deployed Daily recording availability.
