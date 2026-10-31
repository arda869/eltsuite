# Development Studio

`/development` is a teacher-only professional learning workspace, available through the suite Apps
menu and controlled by the `development` app switch. `/reading` and `/coach` remain working aliases
to the appropriate Studio section. Its colours, typography, navigation and light/dark themes reuse the suite.

The first release brings Reading, private reflections, action research, a professional timeline and
the Teaching Coach into one app. The overview reconnects recent work and professional goals. Reading
reuses the existing journal files, citations, stars, shared files and organisation library; it does
not move or duplicate files or change their sharing. Reading editors return to Development Studio
and offer a link to start a private reflection on that journal. Only the linked title, not its
source text, can be included with a selected reflection in a coaching conversation.

The first release includes:

- An editable professional profile and teaching beliefs. Before the first AI chat, a short setup requires training/qualifications (including none), experience, roles and teaching context. The journal, reading and inquiries remain usable without completing it. Roles can be combined and
  qualifications are free text, including custom qualifications or none.
- A private journal with free writing, prompts, themes, search, editing, export and deletion.
  Reflections can link to an existing lesson and an inquiry, with plan/actual/next observations.
- Learner voice prompts and guidance for recording consented, anonymised themes. This release does
  not collect responses from learners or claim that responses are anonymous through the app.
- Classroom action research in three stages: question/plan, evidence/ethics, reflect/revisit.
  Reports include linked reflections and limitations. Research source notes are teacher supplied;
  sources are not automatically retrieved or verified, and the coach must say so.
- A timeline of reflections and inquiries, without scores or inferred judgements.
- Four conversational coaching modes through the existing lessonAssistant callable's `coach`
  action. AI access requires the existing explicit pilot grant and uses the same daily limits and
  monthly budget ledger as other pilot generation. The journal works without a pilot grant.

## Privacy and context

Writing is stored beneath `teachingCoach/{uid}/{reflections|inquiries|settings}/{id}`.
Rules allow only the active teacher whose UID matches, excluding admin view-as sessions.
Organisation and super admins have no coaching read privilege. Version checks prevent concurrent
windows silently replacing saved writing. Export is a teacher-triggered browser download.

The coach is a chat interface with message bubbles, a scrolling conversation, Enter-to-send,
Shift+Enter for a new line, a compact composer, a new-chat action and explicit saving to Reflections.
Conversation state stays available while switching Studio sections in the same window.

Profile, beliefs, reflections and inquiries are available by default, as requested by the product
owner. Teachers can switch off any category in user Settings → Teaching coach.
Preferences are private, versioned records at `settings/context`; the server enforces them rather
than trusting browser flags. Changing preferences clears the current conversation so earlier
excerpts from disabled sources are not retained in its history. Profile and teaching-beliefs completion are checked on
both the client and server before any model call or budget reservation; completing the profile and beliefs does
not override an explicit profile-access opt-out.

For the current chat client (`contextVersion: 2`), the server retrieves up to 40 recent records per
enabled writing category under the caller’s UID, ranks them against the message, and supplies bounded
excerpts of up to three reflections and two inquiries. An explicitly linked older reflection can
be prioritised. Titles are returned as the basis for each response. This is bounded recent retrieval,
not a claim to search unlimited history. Linked Reading Journal titles are references only; reading
bodies, lesson plans, learner records and colleagues’ data are not retrieved. Legacy clients retain
their explicit context flags during rollout.

Prompt/history/context are not persisted in request jobs; only a hash, response and spending metadata
are kept. Retry responses expire after 24 hours; the six-hour cleanup workflow removes expired jobs.
Failed requests retain their reservation when provider usage is unknown. The chat sends only recent
turns and bounds excerpts to stay inside the request envelope.

AI responses are advisory: open questions, alternative interpretations, no teacher ratings, no
fabricated sources and no asserted causal claims from classroom comparisons. User supplied source
links are unverified. There are no automatic reminders, unsolicited prompts or mentor sharing.

## Checks

- `node --test test/coach/*.test.mjs` validates request limits, context IDs and teacher/session access.
- `npm run build` checks types and the production bundle.
- `node test/smoke.mjs --only='Development Studio' --a11y` exercises journal persistence/editing, inquiry
  stages, timeline, context defaults, conversation reset and mobile/desktop accessibility using
  the existing Firebase/provider stand-ins. It does not claim to evaluate a live model response.

Later work from the Drive roadmap includes verifiable research retrieval, learner feedback
collection, optional follow-ups and teacher-controlled sharing. These are not represented as live
features in this release.

## Coaching behaviour and evaluation

The coach uses a dedicated server instruction set plus the dialogue framework in
`functions/ai/coach-contract.js`. This is prompt-based configuration, not a newly fine-tuned model.
It requires inquiry before advice, uses context rather than credentials to infer needs, gives
practical options when invited, permits disagreement and distinguishes observations from
interpretations. It does not claim to have read sources from their titles or links.

`functions/ai/coach-cases.js` contains eight synthetic scenarios and review criteria: plan versus
reality, teaching beliefs, expertise without formal qualifications, small-sample causal claims,
learner voice and anonymity, teacher-trainer feedback, research honesty and context injection.
The optional `functions/ai/evaluate-coach.mjs` runs the production prompt/provider against these
fixtures only when live evaluation and a test key/model/output path are explicitly supplied. A
human must review the report against every criterion; generating a report is not a passing score.
No live evaluation runs automatically in CI or spends a teacher's pilot allowance. Contract/access
and provider tests run in the deployment checks. No claim of live-model evaluation is made by the
unit or mock-browser tests.


## Guided setup and writing

Qualifications use a multi-select with Cambridge CELTA, DELTA and TKT modules, Train the Trainer,
Trinity CertTESOL, DipTESOL, TYLEC, CertPT and CertOT, TEFL, MA TESOL, Other and no formal
qualification. Other requires a description. Beliefs use five open questions about learning,
teacher roles, feedback, inclusion and evidence, with one-line fields that grow with the writing.
Existing free-written beliefs remain valid and editable. Neither qualification nor belief is scored.

All Studio sections share a viewport-sized frame and scroll internally. Chat keeps its composer
visible, bounds its height when writing grows, and shows an accessible animated thinking status
with reduced-motion support. The reflection editor reuses TaskEditor and its inline elements;
rich content is stored alongside plain text for search, exports and bounded coaching excerpts.

The coach can suggest further reading or viewing, but has no live source retrieval and must not
invent books, videos, links or findings. When an idea forms it may offer a journal draft. Drafting
requires teacher agreement. A structured journalDraft response enables Review journal draft;
the teacher edits it in the rich editor and explicitly saves it privately to Reflections. An
idempotent transaction protects against duplicate saves. Normal chat has no journal-save button.
