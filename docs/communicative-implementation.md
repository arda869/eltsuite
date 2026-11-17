# Communicative activity implementation

Build specification: https://docs.google.com/document/d/1MorJLN2wpIIFrn7RnKZAlzTmt2bq5KyoFDgaMfWy1g0/edit

Supplied UI kit: https://drive.google.com/drive/folders/1fwOh_yCAS8x0QlzBPFahonM_9ptUh-7s

## Implementation

Thirteen inline activity kinds are integrated into the existing rich card editor, task renderer, live teacher/learner screens, worksheet export and offline player: board game, Bingo, Dominoes, Pelmanism, story strips, cue cards, survey, Find someone who, ranking, opinion line, Spot the difference, Taboo and speaking timer. The existing Spinner remains available. The specification has no numbered sections 12 or 17.

Activities use the existing saved group sets, manual/random allocation, named turns, team scores, late-learner allocation and explicit Start/Reveal/Reset/End controls. Teachers can inspect rooms and explicitly share a selected screen. Speaking pairs can rotate roles on timer expiry; sound requires an explicit user gesture. Bingo claims expose the actual claimant's card to the teacher. Rankings require every group member's agreement. Surveys retain a written summary alongside their live chart.

The server owns random calls/dice, revisions and canonical state. Authenticated learner projections contain only their authorised cards, picture version and current results. End does not reveal private cards or opinions. Hidden memory halves use opaque tokens. Version comparison supports three or more native task versions, group-specific reveal and hide.

Private activity content is stored separately from learner-readable task JSON. Save, library, linked edits, class copies, text import/export and clipboard paths preserve it; unresolved source data cannot overwrite existing cards. Uploaded, pasted, dropped and selected resource pictures are copied into protected activity storage. Learner picture access checks the current projection. Personal-library and cross-class copies own their picture bytes and deduplicate repeated linked edits. Existing public external image URLs remain public sources. Storage accounting includes manifests, chunks and activity state.

Every existing question type can be set to No correct answer. Responses remain available, while answer keys, automatic/manual scores, right/wrong feedback and aggregate marking exclude these questions. Teacher comments remain available.

Printed materials reuse the worksheet fonts, branding, header/footer and dashed cut-out/scissors conventions. They include board counters and optional die net, unique Bingo cards and caller strips, paired versions, survey tally/chart, ranking sheets and activity cards. Short task versions share a sheet; longer versions receive their own sheets. Taboo follows the explicit eight-card specification rather than the reference image's nine-card arrangement. Offline HTML embeds protected image bytes and uses the local activity engine without requesting network access.

## Verification and its limits

All checks below are local. This document does not claim production deployment or live Firebase success.

- Pure activity contracts: 20 checks; No correct answer contracts: five checks. Eleven Spot picture/source/framing regressions run separately.
- Real Firestore emulator: 25 service journeys, 37 access checks, seven picture-helper journeys and five storage-accounting journeys. These exercise real rules, transactions and authenticated identities. The Node picture-helper test only supplies FileReader conversion.
- Simultaneous teacher and two-learner browser journeys: all 13 kinds through their final results, private cue assignment/reopen/reset, three-version comparison/reveal/hide, mixed marked/ungraded submission and teacher comments. These use Firebase stand-ins that call the actual service implementation; they are not production tests.
- Authoring: all 13 insertions, list paste, limits and adjacent validation, rich/picture-only cards, crop persistence, keyboard Spot controls, optional fields blank, saved/reopened previews, and 768px containment with scoped accessibility checks. Existing phone behaviour switches to learner preview at 390px; phone editing is not verified.
- Seven actual picture entry paths: upload, native clipboard paste, file drop, resources and rich-picture dialog/paste routes. Saved/reopened teacher and assigned learner pictures decode; no ordinary public media copy is created.
- Copy/import: protected source guard, personal-library ownership, another class, three linked text edits without duplicate image bytes, plain-text round trip and reopened decoded image.
- All thirteen kinds also retain valid picture-only prompts on learner and print surfaces. Teacher Bingo calls, cue assignments and Find someone who summaries stay identifiable without text titles. A focused picture-only Bingo journey reaches a winning claim and decoded caller-strip printout. Spot marker, learner view and print share a 4:3 frame; changed source/framing clears outdated regions. Learner story strips do not carry solved-order letters.
- Actual downloadable production offline HTML with networking disabled: winning Bingo claim, covered private-card handover, assigned picture decoded from embedded bytes, branding and 390px layout; zero remote requests.
- Actual A4 and Letter PDFs: all 13 kinds, 48-square board, 5×5 Bingo, long cue cards, 16-row Find someone who, short/long task versions and protected pictures. Page/card containment is measured, PDFs are rendered and visually inspected.
- All 163 AI regression checks pass. The extended real-emulator task-tools integration also passes for sealed private-card edits and stale-draft checks. TypeScript/build checks run independently. CI includes the activity, emulator and browser suites.

## Release and remaining manual checks

Arda subsequently asked to do the remaining production journeys personally. Bug tracker B-048 records the manual checklist; keep its status In progress until those results are recorded. Publication must still be independently verified.

No production teacher or learner accounts, real learners or live class video rooms have been used. Before claiming live functionality, verify the published build and complete a disposable real teacher/learner journey including private picture delivery, save/reopen, group allocation, results and downloadable output.

Physical iPad Safari, VoiceOver and phone editing remain unverified. Browser checks use desktop Chrome, including narrow/touch-sized layouts and keyboard alternatives. New activity Word export shows an explicit request to choose PDF rather than silently exporting blank content; native editable Word layout is outside this implementation.

## Working arrangement

Agent 1 owns its unrelated Class and Word release work. This branch owns the communicative activity implementation. Agents 3 and 4 assisted with authoring verification and real-emulator privacy/storage checks respectively. Generated files must be checked with `node scripts/sync-communicative-engine.mjs --check`.
