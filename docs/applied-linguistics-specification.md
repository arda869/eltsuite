# ELT Suite: Applied Linguistics Studio and Unified Inline Tools
## Detailed product architecture, workflows and implementation specification
2 November 2026

## 1. Product vision
Applied Linguistics Studio should be ELT Suite's evidence-based language investigation environment. It must not become a disconnected application. Its tools should work both in a dedicated Studio and inline within Collab documents, Classes lessons/tasks, and Messages. Development Studio and the AI Teaching Coach remain the home for professional reflection and action research. Classes and learner portfolios remain the home for teaching, learner work and progress evidence.

This is a proposed implementation specification, not confirmation that these features are currently deployed. The existing repository already includes an action research workflow, a private Teaching Coach, Collab, Classes, portfolios, lesson activity types, and teacher-training forms. Reuse them.

## 2. Six integrated tool families

### A. Corpus Explorer
Purpose: Find and investigate sourced examples of English use.
Features: keyword-in-context concordance, phrase search, case/lemma filters where supported, metadata, selected-example trays, annotations, side-by-side phrase comparison, and source-aware exports. Advanced collocations, frequency and register comparison must be enabled only when the underlying licensed corpus supports valid statistics.
Inline experience: Insert a live corpus investigation block into a Collab document or lesson, with a teacher-defined query, curated examples, noticing prompts, learner highlighting and saved conclusions. In Messages, share a compact investigation card or selected examples with a link to the full workspace.
Conversion: Select examples -> Create Activity -> existing matching, gap fill, categorisation, guided discovery or discussion tasks.
Licensing: Per-example attribution and reuse permissions, separate audio licensing, permitted caching/export limits. Tatoeba may support an example-sentence MVP but must not be presented as a balanced spoken/written corpus. Investigate professional licensing separately.

### B. Discourse Analysis Studio
Purpose: Analyse whole conversations, not only isolated sentences.
Features: upload/paste transcript; speaker labels; timestamp alignment to consented audio/video; annotation layers for turns, adjacency pairs, repair, overlaps, interruptions, discourse markers, cohesion, stance, hedging and speech acts. Allow teacher-defined annotation schemes and inter-rater comparison.
Inline: Embed an annotated transcript with togglable layers, questions and student annotation permissions. Messages show a selected excerpt and comments, not unrestricted private recordings.
AI: Suggest candidate annotations with confidence and evidence spans; human confirmation is mandatory. Distinguish overlap from interruption and avoid inferring intent from text alone.
Activity conversion: transcript noticing, categorisation, reorder exchanges, role-play prompts, reflective comparison.

### C. Language Awareness Lab
Purpose: Investigate meaning, form, pronunciation and use.
Features: structured MFP analysis; grammatical patterns, form breakdowns, ambiguity, phonemic notation, word/sentence stress, connected speech, concept-checking questions, anticipated learner difficulties and solutions. Reuse existing teacher-training analysis forms.
Inline: MFP cards, editable phonemic analysis, CCQ checks, contrastive examples, collapsible explanations and trainee-completed analysis templates.
Evidence: connect to sourced corpus examples where appropriate; clearly label AI-created examples.
Output: lesson language analysis sheets and teacher-training submissions.

### D. Pragmatics Lab
Purpose: Explore context-dependent language choices.
Features: scenario authoring with roles, relationship, power, distance, communicative goal, medium, register and cultural assumptions; compare alternative requests, refusals, apologies, feedback and negotiation moves; annotated speech acts and pragmatic effects.
Inline: decision scenarios and branching responses in lessons or Collab; small role-play cards in Messages. Collect learner reasoning, not merely a single 'correct' answer.
Safeguards: Avoid stereotypes and universal claims about cultures. Show multiple plausible interpretations and allow teachers to tailor context.

### E. Second Language Acquisition / Learner Development Lab
Purpose: Examine learner language and change over time.
Features: connect to Interlanguage Tracker in Classes portfolios, select dated writing/audio/transcripts, compare similar tasks, tag emerging structures, track strengths, recurring patterns, lexical development and teacher-approved targets. Include task context and uncertainty.
Inline: evidence comparison blocks in teacher-only documents or permissioned lesson spaces; learner-safe progress snapshots; no unrestricted learner portfolio exposure in Messages.
Research integration: attach a selected, permission-checked excerpt or anonymised summary to an inquiry, not the entire portfolio by default.
Safeguards: no automatic diagnosis, proficiency label or causal conclusion from sparse samples; teacher review; consent and deletion controls.

### F. Research to Classroom Studio
Purpose: Evaluate research and translate it into testable teaching choices.
Features: teacher-uploaded articles or linked reading notes, research question, context, methods, sample, findings, limitations, evidence quality, transferability and classroom implications. Trace every claim to a source excerpt/page where available. Do not invent citations.
Inline: research summary cards, annotated excerpts, evidence-to-practice matrices and editable intervention plans. Messages share links or permissioned excerpts.
Output: create an intervention hypothesis, lesson activity or an action research inquiry in Development Studio, with explicit teacher confirmation.

## 3. One unified inline interaction model
A user should be able to access these tools from:
- Collab: slash command and Insert menu, e.g. /corpus, /discourse, /language-awareness, /pragmatics, /learner-development, /research. Embed interactive blocks within rich documents. Allow teacher preview, inline learner response and collaboration permissions.
- Classes: Add Activity / Insert menu in the existing lesson editor, with the same underlying blocks. Support independent learner work, group work, live teaching and review/marking when relevant.
- Messages: composer '+' / Attach tool card. Share a compact, permissioned interactive card, with clear open-in-Studio and open-in-lesson actions. Messages must not silently grant access to the original evidence.
- Dedicated Applied Linguistics Studio: full-size authoring, analysis, saved investigations and evidence collections.
- Development Studio: 'Attach to Research Inquiry' and 'Discuss selected evidence with Coach' actions, without duplicating inquiries.
- Learner portfolios: 'Analyse selected samples' and 'Attach selected evidence' actions.

An inline block should retain its source investigation ID, schema version, display settings, permissions and provenance. Distinguish (1) a live reference that reflects permitted updates from (2) a frozen snapshot for assessment or archival integrity. Provide a deliberate 'Duplicate and edit' action.

## 4. Example end-to-end workflows

### Workflow 1: DELTA trainer teaches discourse markers
Trainer creates a Corpus Explorer investigation of 'well', 'actually' and 'you know' using appropriately licensed spoken evidence. In Collab, inserts selected concordance lines and an annotation prompt. In Classes, adds a discourse analysis transcript and group noticing task. Trainees annotate, compare patterns and design a classroom task. Trainer sends a Messages card linking to group findings. A trainee attaches their approved work to a Development Studio inquiry and asks the Teaching Coach to challenge their interpretation.

### Workflow 2: Classroom action research
Teacher opens an existing Development Studio inquiry, 'How do noticing tasks affect B1 learners' use of discourse markers?' Coach helps clarify question, intervention and ethical evidence collection. Teacher uses Corpus Studio to curate examples, creates a lesson activity, delivers it in Classes and collects consented portfolio samples. Learner Development Lab compares selected samples. Teacher attaches only chosen anonymised excerpts to the inquiry. Coach discusses competing explanations, task comparability and limitations; teacher saves a reflection and next cycle. Never assert causation from a simple before/after comparison.

### Workflow 3: Pragmatics inside Messages
Teacher sends a scenario card to a class discussion: 'You need an extension from a supervisor.' Learners select a response, justify its suitability and compare alternatives. The teacher can later insert the same scenario into a lesson and review class responses. No automatic universal 'politeness score'.

### Workflow 4: Research to lesson
Teacher reads a study in Development Studio, selects a passage, creates a research evidence card and asks Research to Classroom Studio to draft a limited, testable classroom implication. The teacher reviews the source, edits the proposal, inserts it into Classes and optionally starts an inquiry.

## 5. Relationship with the existing AI Teaching Coach
Development Studio owns professional profile, beliefs, private journal, action research inquiries and timeline. Applied Linguistics Studio owns analysis tools and selected evidence objects. Classes owns teaching and portfolio data. The Coach should not automatically read Collab contents, lesson plans, messages, reading journal bodies or learner records.

Introduce a teacher-initiated 'Discuss with Coach' flow:
1. User selects exact excerpts, results or an anonymised summary.
2. A preview displays what will be shared, source and any personal data.
3. User confirms; backend rechecks ownership, class membership, learner consent and data access.
4. Coach receives a bounded, purpose-limited evidence packet plus source metadata and the active inquiry ID.
5. Coach responds with questions, alternative explanations and limitations, never invented sources or definitive causal judgments.
6. Nothing is added to the permanent journal/inquiry unless the teacher explicitly saves it.
7. Revoke or delete shared references according to source access and retention policy.

Existing coach context preferences must remain respected. Avoid creating an implicit bypass through new tool links.

## 6. Shared technical design
Frontend: reusable React/TypeScript analysis block components, a common insertion gallery, a full Studio workspace and compact Messages cards. Use existing editor conventions and class activity rendering.
Backend: Firebase Cloud Functions as an authenticated gateway for corpus providers, AI analysis and evidence transformations. Keep provider credentials in server-side secrets.
Suggested logical entities:
- investigations: id, type, owner, title, query/config, created/updated, schemaVersion
- evidenceRefs: sourceType, sourceId, permittedExcerpt, provenance, licence, consent/permission metadata
- annotations: investigationId, evidenceRefId, author, span/timestamp, tag, note, status
- inlineEmbeds: targetType (collab/class/message), targetId, investigationId, snapshot/reference mode, displayConfig, access policy
- inquiryLinks: existing Development Studio inquiry ID, selected evidence refs, purpose, attachedBy
- generatedActivities: source investigation ID, selected evidence, task type, reviewedBy, provenance
These are conceptual entities; map them against existing Firestore collections before adding anything.

Security: enforce access in Firestore rules and Cloud Functions, not just UI. Prevent cross-class and cross-organisation leakage. Learner evidence and recordings require explicit consent and appropriate retention. Consider minors and restricted data. Signed or bounded links should not act as unrestricted public URLs. Use audit logs for sensitive sharing and deletion.

Performance: lazy-load advanced tools, paginate concordances, cache only when licensing allows, avoid loading full transcripts in Messages, handle offline/slow connections gracefully, and budget AI/provider usage.

Accessibility: keyboard navigation, screen-reader-readable concordances, captions/transcripts, non-visual alternatives to graphs, mobile layout and reduced-motion support.

## 7. AI trust and research integrity
Every AI-generated annotation or interpretation must be labelled as a suggestion. Sourced examples must retain attribution; generated examples must never masquerade as corpus evidence. Display uncertainty, alternative explanations and source limitations. Do not infer teacher competence or learner ability from isolated artifacts. No automated pass/fail, unreviewed coaching decisions or fabricated research citations.

## 8. Build phases
Phase 0: Audit current Collab editor schema, Classes task model, Messages attachments, Development Studio inquiry model, portfolio permissions and Teaching Coach context contract. Identify reusable components and constraints.
Phase 1: Common inline embed framework, permission checks and 'Attach to Research Inquiry'. Implement a simple sourced Corpus Explorer block end to end in Collab and Classes, with Messages preview/link.
Phase 2: Discourse Analysis and Language Awareness blocks, including annotation and existing training-form reuse.
Phase 3: Pragmatics scenarios and Research to Classroom evidence cards.
Phase 4: Portfolio-connected Learner Development evidence comparisons with stricter access and consent.
Phase 5: Advanced corpus statistics and deeper analytics only after suitable licensed data and validated evaluation.

## 9. Acceptance criteria
- A teacher creates an investigation once and can insert it in a Collab document and a Classes lesson without reauthoring.
- A Messages card opens only data the recipient is entitled to see.
- An inline block works in teacher preview and learner view with correct permissions.
- A selected example converted to an activity retains provenance and required attribution.
- 'Attach to Research Inquiry' links to an existing inquiry rather than creating a duplicate.
- 'Discuss with Coach' shows an exact evidence preview and requires explicit confirmation.
- Disabling a Coach context category prevents that context from entering future calls.
- Deleting or revoking sensitive evidence prevents further access through embedded references.
- AI-generated statements are distinguishable from sourced evidence.
- The feature passes functional, security, accessibility and regression tests before deployment.

## 10. Priority and definition of success
Prioritise the shared inline infrastructure over building six disconnected feature screens. Measure time from investigation to usable activity, reuse across Collab/Classes/Messages, successful research-inquiry links, teacher satisfaction, permissions incidents (target zero), and cost per active user.

This is the target product design. It has not been implemented or deployed by sending this email. The next engineering step is a repository-level architecture audit and a first vertical slice: Corpus Explorer -> inline Collab block -> Classes activity -> permissioned Messages card -> Development Studio inquiry link.

