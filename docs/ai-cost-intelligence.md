# AI Cost Intelligence

Measurement only: no credit balances, deductions, subscriptions, payments, or entitlements are activated. Super Admin → AI Cost Intelligence (`/admin?tab=ai-costs`). Tracking begins with deployment, not retroactively from allowance counts.

## Accounting and evidence

`aiCostGenerations` groups a logical feature generation. `aiCostAttempts` records every dispatched provider call, including research, quality reviews, repairs and failed responses. Provider usage is captured before application output validation. Opening/recovering a saved result does not start another paid call. Repeated settlement of an attempt is transactional and idempotent. Request IDs and existing job locks group resumed text work; video polling updates its original attempt.

Costs use integer micro-USD, rounded upwards once per provider call. The immutable rate snapshot and source/version are saved with priced records. `provider_usage` means provider-reported tokens priced at published rates; `calculated_units` means a returned song counted at list price. `estimated_usage` includes requested video duration and transcription's published per-minute estimate. **None is invoice-confirmed.** No invoice integration or historical verified expenses are claimed. Provider discounts, refunds, taxes, infrastructure and payment fees are outside these calculations. Missing/unsupported usage or models remain `unknown` with null cost, never zero. Unobserved asynchronous completion becomes failed/unknown after 24 hours; its safeguard reservation remains.

Prices reviewed 3 November 2026 in `functions/costs/pricing.js`, with official OpenAI, Google and Runway source links. Keep snapshots for old requests; update the version and rate card when prices/models change. Cached tokens have separate rates. Reasoning tokens are already included in output totals and are not counted twice. Image text/image tokens and realtime text/audio/cache tokens remain distinct. Unsupported cache splits remain unknown. New billable endpoints must explicitly use the cost context and tracked provider adapter; production missing context fails before dispatch.

## Coverage of the 21-feature catalogue

| Feature | Entry point / paid work |
| --- | --- |
| lessonOutline | lessonAssistant outline, research, revision |
| lessonPlan | lessonAssistant plan, reviews, editorial repairs |
| lessonActivities | lessonAssistant activities/task tools; classroomGameDraft |
| materialImport | material rebuilding, source comparison and repair |
| coach | teaching coach; background learning reports |
| help | AI article selection (local exact matching makes no paid call) |
| speech | recordingSpeech realtime WebSocket utterances |
| transcription | recordingTranscript diarisation |
| dialogue | recordingDialogue |
| lyrics | recordingLyrics |
| song | recordingSong / Google Lyria |
| videoPlan | videoStudio plan |
| videoScene | videoStudio Runway generation and existing polling/recovery |
| videoImage | videoStudio character/scene reference images |
| designerImage | Designer images/edits and dictionary illustration generation |
| definitions | teachingDefinition text |
| linguistics | appliedLinguisticsAnalysis |
| lessonImage | background lesson images, visual verification, imported picture recreation |
| lessonAudio | background prepared recordings, including each utterance |
| speakingPractice | server-observed live conversation plus separate transcription cost |
| speakingFeedback | speakingTask feedback |

Free Wikimedia downloads, token-count preflights, provider readiness checks, status polling and local stem separation are not fabricated as paid AI generations. Existing allowance policies remain independent of monetary records. An internal check belongs to its enclosing feature, not a new user use.

## Speaking and ownership

The existing deadline watchdog also connects to the OpenAI server-side WebSocket. The start request waits for that monitor before releasing the SDP, so the client cannot begin a billable conversation before observation. Provider response IDs deduplicate usage events. Transcription usage has a separate model record in the same generation. No client-reported usage, transcripts or tokens are trusted. Interrupted observation is explicitly incomplete; it is not a verified full-session expense. The original independent hangup deadline remains enforced.

Actor UID and teacher account UID are separate. Class ownership is resolved from the server class document after checking membership/co-teaching. Learner profiles can supply their class when no class parameter is present, but membership is still checked. A forged class ID cannot redirect a charge to someone else's teacher account. Unresolvable learner ownership is labelled and is never silently assigned to a teacher.

## Security and spending safeguards

All monetary collections are denied to client reads/writes, including admin clients. `adminAiCosts` requires a verified, non-proxy Super Admin identity derived from the protected registry. Reports are bounded to 93 days and 10,000 provider records/lifecycle records; oversized requests fail visibly instead of presenting truncated statistics. Settings changes use optimistic version checks and an audit collection. No prompts, images, audio, API keys, or transcripts enter the monetary ledger.

Before dispatch, a transaction records the pending attempt and reserves against global and teacher-account daily caps. Defaults are $1,000/day service-wide and $250/day per teacher, including associated learner activity. Existing tighter daily/monthly controls continue to apply. The Super Admin can edit these safeguards or pause new provider spending. Known costs release the unused reservation; unknown requests keep it. These are conservative safeguards, not an invoice billing limit or a guarantee against provider price changes. Global reservations are intentionally shared to enforce concurrency; throughput is bounded by existing function concurrency limits.

## Recommendations

100 credits = $1. For an individual cost, recommended credits = `ceil(costMicroUsd / 2500)`. For a feature's observed sample, use the higher of the maximum generation cost and total cost divided by successful generations. This includes the burden of failures. It targets at least 75% on the observed fully priced sample, not a guarantee for future outliers. No recommendation is shown for incomplete samples or zero successes. Alerts distinguish incomplete data, unset prices, below cost and below the margin target. Revenue/profit are hypothetical, never actual collected revenue.

Feature totals and distributions use complete lifecycles of generations active in the selected dates, including cross-midnight resumes. Provider/date expenditure is limited to calls started inside the chosen UTC date range. p95 is nearest-rank over fully priced finished generations. Saved proposals do not change billing or access.

## Verification

- `node --test test/ai/costs.test.mjs`: pricing, cache/modality separation, rounding, p95, failed work, unknowns and settings validation.
- `test/ai/costs-integration.mjs` under isolated Firestore/Auth emulators: actual transactions, duplicate settlement, learner attribution/spoof denial, admin authentication, blank optional report fields, save conflicts, concurrent spending safeguards and Firestore rules. Provider HTTP is simulated.
- `node test/ai-costs-ui.mjs`: browser journey, 21 rows, optional prices blank, save/reload, validation, 75% proposal, attribution, empty/error states, desktop/mobile and accessibility. Firebase/provider data are simulated.
- Existing AI, speech, video and allowance regressions remain required.
- Live deployment and authenticated published-page verification are separate from these tests. Record their actual results in the release report; do not infer live success from a build.
