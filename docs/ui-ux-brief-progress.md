# UI/UX implementation brief: release register

Source: `ELT_Suite_Codex_UI_UX_Implementation_Brief.docx` (5 November 2026). The user's correction supersedes its game wording: the only new game option is **Quiz Show**. This branch is not approved for production while any row below remains in progress or unverified.

Legend: **Implemented locally** means code exists but the required full journey and live storage verification have not passed. **In progress** means only part of the requirement is addressed. **Open** means the requirement has not been completed.

| # | Status | Evidence / remaining work |
|---|---|---|
| 01 | Implemented locally | Per-task queue and reload drafts in `responseSaveQueue.ts`; focused unit tests pass. Verify stored answers in Firebase. |
| 02 | In progress | Lesson editor draft recovery and navigation flush; test interrupted saves and modal navigation. |
| 03 | In progress | Learner, lesson and Designer indicators updated; audit all save paths and online/offline truthfulness. |
| 04 | In progress | Designer page/meta queue and element recovery; verify concurrent edits, reload and server state. |
| 05 | Implemented locally | Exam hand-in flushes all answer queues; verify timed and manual hand-in against Firebase. |
| 06 | Open | Rapid switching, slow/offline/reconnect, multi-tab and final Firestore comparison need end-to-end coverage. |
| 07 | Implemented locally | H maps to Hide answers through shared command copy; browser shortcut check needed. |
| 08 | Implemented locally | Teaching view persists across task navigation; browser check needed. |
| 09 | Implemented locally | Separate answer controls and status text; screen reader check needed. |
| 10 | Implemented locally | Carry on picks unfinished task and Review labels finished work; browser check needed. |
| 11 | Implemented locally | Locked activity text changed; verify teacher controls. |
| 12 | Implemented locally | Class-level blank lesson action and contextual links added; browser check needed. |
| 13 | In progress | Teaching tools grouped; inspect real sessions at desktop/tablet/mobile. |
| 14 | Implemented locally | New game menu exposes only Quiz Show; browser and accessibility check passed. |
| 15 | In progress | Hidden game gallery remains unlinked; audit all discovery/marketing surfaces. |
| 16 | Implemented locally | My games actions and empty state updated; test existing legacy games. |
| 17 | In progress | Inline Quiz Show editor and save-before-insert action added; full publish/play path not verified. |
| 18 | In progress | Game loading Retry/Back and expanded focus handling added; keyboard journey check needed. |
| 19 | In progress | Page title/context handling updated; verify answers about visible activity. |
| 20 | In progress | Bounded learner work source added; test authorised reading and class records in Firebase. |
| 21 | In progress | Source labels adjusted; audit exact model payload versus displayed list. |
| 22 | In progress | Pinned attachment mismatch is shown explicitly; test navigation across pages. |
| 23 | In progress | Broad page text scrape removed; browser test verifies detached lesson/history is not resent. Audit all exclusions. |
| 24 | In progress | Class and learner queries bounded; test large-class pagination and evidence language. |
| 25 | Implemented locally | Companion chat available with optional profile fields; browser test passed. |
| 26 | In progress | Retry affordances added; test configuration/network failure with preserved draft. |
| 27 | In progress | Pending image results retained; test Create/Edit/Restyle/Eraser rules in browser. |
| 28 | In progress | Designer file/page thumbnail selection added; verify insertion and large libraries. |
| 29 | Open | Prominent Use in Classes handoff and Edit in Designer source link. |
| 30 | Open | Full canvas manipulation and final composition inspection. |
| 31 | Open | Generated element language and classroom display legibility audit. |
| 32 | Open | Desktop/mobile navigation depth and active location audit. |
| 33 | Open | State and recovery audit across every page. |
| 34 | In progress | Global pinch block removed; 200% browser zoom and canvas gesture checks pending. |
| 35 | In progress | Expanded game focus handling improved; modal inventory/focus restoration pending. |
| 36 | Open | Mobile targets, keyboard, overlay, contrast and screen reader sweep. |
| 37 | Open | Authenticated homepage, invitation, learner login/logout/refresh and redirect checks. |
| 38 | In progress | Low-specificity input baseline added; inventory/visual states pending. |
| 39 | In progress | Textarea baseline added; clipping/autosize audit pending. |
| 40 | In progress | Spelling/style selects use NSelect and raw selects share visible skin; full select inventory pending. |
| 41 | Open | Multiselect/autocomplete audit. |
| 42 | Open | Checkbox/radio/switch visual and semantic audit. |
| 43 | Open | Date/time picker and locale audit. |
| 44 | Open | Number field behaviour audit. |
| 45 | Open | Color picker palette/hex audit. |
| 46 | Open | Upload/dropzone states and progress audit. |
| 47 | Open | Search field affordance audit. |
| 48 | Open | Slider/range control audit. |
| 49 | Open | Rich-text placeholder, selection and shortcut audit. |
| 50 | Open | Button/split button state audit. |
| 51 | Open | Dialog/popover/menu focus and stacking audit. |
| 52 | Open | Inline validation and aria-describedby audit. |
| 53 | Open | Dark, contrast, embedded, print and mobile Safari checks. |
| 54 | Open | Control gallery, screenshot baselines at 320/375/768/1024/1440 and 200% zoom. |

## Verification to date

- TypeScript `--noEmit` passed before the latest Designer recovery change; rerun required.
- Production build passed before the latest Designer thumbnail and recovery changes; rerun required.
- Focused unit tests: 21/21 passed (mock/unit).
- Mock browser: Quiz Show creation/editor, Companion attached/detached context passed.
- Quiz Show accessibility check: 0 issues in the targeted editor screen.
- `docs/ui-ux-brief-images/quiz-show.png` is a local preview, not a production capture.
- No authenticated production write or published-build verification has been performed for this branch.
