# Integrated AI teaching pilot

Status: implementation specification, not a deployed feature.
Branch: feature/integrated-ai-teaching-pilot

## Goal
Build and test one end-to-end teacher experience that combines needs analysis, learner evidence, teaching beliefs, personal memory, pedagogical planning, teacher notes, student materials, and optional image/audio generation. Keep all parts in one coherent workflow, with separate internal modules for maintainability.

## Integrated user journey
1. A signed-in teacher opens a class and chooses **Plan with AI**.
2. The teacher can conduct or review a needs analysis, including learner goals, diagnostic results, teacher observations, completed tasks, homework, writing and portfolio evidence.
3. The teacher can have a friendly beliefs interview. Its draft teaching philosophy summary must be edited or explicitly approved before it influences generation.
4. The teacher's personal profile contributes explicit preferences and inferred preferences from repeated edits. The teacher can inspect, override or delete memories. Current instructions override remembered preferences.
5. The teacher provides objective, CEFR level, duration, topic, methodology choice (or requests a recommendation), and constraints.
6. The server builds a minimal authorised evidence packet. It distinguishes learner self-report from observed performance and attaches evidence provenance.
7. The pedagogical planner proposes aims, methodology, stage sequence, differentiation and rationale.
8. The teacher edits or approves the outline.
9. The generator produces structured stages, detailed teacher notes, anticipated problems, language analysis where relevant, learner-facing tasks, scripts, answer keys, and optional image/audio assets.
10. A second review checks CEFR fit, coherence, timings, linguistic accuracy, answer consistency and task-image/audio alignment. The teacher reviews all content before saving to the existing lesson system.
11. The teacher's edits can generate scoped candidate memories; recurring patterns can be adopted automatically with review/delete controls.

## Quality criteria
Follow the existing repository's British English, UI copy and worksheet style in CLAUDE.md. Support PPP, TTT, task-based, guided discovery, text-based and skills-focused lessons without rigid default methodology. Teacher notes include stage aims, timings, interaction, exact procedures, instructions and checks, monitoring, feedback, anticipated problems/solutions, and answers. Use an expert-calibrated rubric and exemplar briefs. DELTA-level quality is a target, not an automatic claim.

## Architecture proposal
- React/TypeScript interface inside the existing lesson workflow.
- Firebase callable functions for authenticated AI requests, with API secrets stored server-side.
- Firestore records for generation jobs, approved beliefs profiles, memory entries, needs analyses, evidence references and lesson drafts.
- Existing class, task and shared lesson structures remain the destination for approved generated content.
- Media objects in existing storage with linked scripts, captions and generation metadata.
- Separate internal services for context retrieval, planning, generation, review and memory, exposed as one integrated teacher flow.
- Version all generated artifacts; log model usage, enforce per-user limits and bounded costs; allow retry without duplicate saves.

## Privacy and security requirements
Authorise every class and learner record on the server; retrieve only relevant evidence. Do not send full portfolios when a minimal summary suffices. Keep private CPD reflections distinct from institutional observations. Require appropriate consent and safeguards for minors, configurable retention and deletion, audit access, and prevent cross-tenant data leakage. No autonomous high-stakes grading. Do not use real learner records for initial development tests.

## Implementation checkpoints
A. Confirm current schema, Firestore rules and Cloud Functions deployability.
B. Add isolated data contracts and server-side authenticated prototype with synthetic learner records.
C. Build the complete teacher journey behind a private feature flag.
D. Add optional image and speech generation with per-request approval and usage controls.
E. Run unit, integration, privacy, pedagogical and browser tests across the full journey.
F. Review changes from the other concurrent agent, reconcile conflicts and open a pull request. Do not merge or deploy to production without review.

## Acceptance test scenario
A teacher with a synthetic B1 class of six learners has a needs analysis, writing samples, task results and notes. The teacher completes a beliefs conversation and approves the summary, sets a 60-minute objective and requests a methodology recommendation. The engine cites learner evidence, recommends an approach, produces an editable outline, then creates a complete lesson with teacher notes, differentiated tasks, a listening script, optional audio/image, and answer keys. The teacher revises the lesson; the system stores a scoped preference after repeated evidence. A different teacher must be unable to retrieve any of these learners or private reflections.

## Known risks
Cloud Functions deployment currently uses continue-on-error in GitHub Actions; deployment success must be independently verified. Another agent may be changing main concurrently. API access, pricing and credits must be verified before paid calls. All changes remain isolated on this branch.

## Agreed first integrated test brief (30 October 2026)
- Audience: adult English learners.
- Level: B1 (working estimate; test with needs-analysis evidence).
- Class size: six fictional learners for the synthetic test fixture, as originally proposed; teacher can change this later.
- Language focus: contrast **used to + base verb** (past habits or states no longer true), **be used to + noun / -ing** (current familiarity), and **get used to + noun / -ing** (process of becoming familiar).
- Example contexts: changes in jobs, commuting, living arrangements, technology and routines. Do not assume these apply to real learners without needs analysis.
- Proposed communicative outcome: learners describe past routines, current familiar situations and adjustments to changes, choosing the three constructions appropriately.
- Diagnostic evidence: synthetic writing and speaking samples reveal contrasting misconceptions; include learner self-report and teacher observations. Make uncertainty explicit.
- AI flow under test: needs analysis → evidence-linked class profile → friendly teacher beliefs interview and approval → memory-aware methodology recommendation → teacher-approved outline → full lesson with differentiated tasks, detailed teacher notes, language analysis, CCQs, answer key, optional image and audio → review → editable save → preference memory update.
- Language checks: distinguish past habits from familiarity and adaptation; **used to work**, **am used to working**, **am getting used to working**. Check auxiliary and negative forms (e.g. **Did you use to...?**, **didn't use to...**) and ensure -ing after **be/get used to** when followed by a verb.
- Success criteria: grammatical accuracy; natural B1 examples; meaningful personalised communication without invented learner facts; correct answer keys; credible timings; accessible instructions; teacher override and data isolation; safe persistence; no production deployment.
