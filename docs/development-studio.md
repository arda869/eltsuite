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

- An optional, editable professional profile and teaching beliefs. Roles can be combined and
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

Every AI request explicitly chooses whether to include profile fields, beliefs, one reflection and
one inquiry. All are off by default. The server retrieves selected records only under the
caller’s UID and selects an allowlist of fields. It never retrieves lesson bodies or learner data.
Changing selections clears the conversation. Conversation history lives in the current browser
window unless the teacher explicitly saves it to the journal. Prompt/history/context are not
persisted in request jobs; only a hash, response and spending metadata are kept. Retry responses
expire after 24 hours; the existing six-hour cleanup workflow removes expired jobs. Failed requests
retain their budget reservation when provider usage is unknown.

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
