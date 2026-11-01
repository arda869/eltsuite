# Rebuild existing materials

Teachers with lesson-assistant pilot access can select **Import existing materials**
next to Create with AI in Classes or beside Suggest an outline in the creation studio.
Choose Lesson, Homework, Exam or Practice. In a lesson, New task offers Start blank
or Import existing materials, with a direct import action beside the task controls.
Task imports append one new task; whole-item imports create a hidden item.

Upload PDF (including scans), DOCX, PPTX, XLSX, TXT, Markdown, CSV, HTML or JPEG/PNG/WebP,
or paste text. Raw files are bounded at 20 MB. PDF/slide selection is limited to six
pages; longer files need an explicit range. The AI request contains up to 30,000
characters and six JPEG previews, each up to 1536 pixels on its longest side,
400 KB each and 2 MB combined. Older Office formats need conversion. Audio/video
need a pasted transcript. This is not arbitrary-format or whole-book conversion.

The reader shows its limitations before sending. PDFs include text and rendered
page previews; images are read with vision. Word includes text and up to six embedded
pictures. Slides preserve extracted text, not visual layout. Spreadsheets use cell
values, which may contain stale cached formula results. Scripts and external assets
in HTML are not executed/fetched. Unsupported or excessive content fails explicitly.
Pictures, recordings and exact page design are not copied into the rebuilt tasks.

Teachers confirm upload/adaptation permission before a server request. The notice
explains ELT Suite's tool role, retained existing rights and third-party rights,
AI-output limitations, and that extracted text/images go to OpenAI. Consent version
and timestamp are recorded. Originals are not stored in the class or generation job;
the job keeps a source name, hash and bounded result. No learner evidence is read.

The model rebuilds into a strict activity schema. The server verifies questions,
tables, keys and single-task scope. Native nodes are constructed by trusted code;
correct keys and teacher notes are written separately in teacher-only documents.
The teacher can edit titles, instructions, passages, options, keys, tables and notes
before a required review confirmation. Import warnings remain visible and are saved
with private notes. Saved work is hidden at item level until deliberately shared.
Task imports inherit their existing item's access settings.

Generation uses the existing teacher/class/pilot permissions and shared AI budget.
Request fingerprints make generation retries idempotent. Saved-request recovery is
available after reopening the dialog. Creation uses a transaction and stable IDs,
so repeated save attempts cannot append duplicates. Revoked access is rechecked.
No automatic provider retry or additional media generation occurs.

## Verification

- `node --test test/ai/*.test.mjs`: contract, key separation, provider request and AI regressions.
- `firebase emulators:exec --only firestore --project demo-material-import "node test/ai/materials-integration.mjs"`:
  actual callable and database transaction paths, all four modes, permissions, edits,
  private keys, append-only task imports, status recovery and idempotence. Model HTTP is stubbed.
- `node test/material-import.mjs`: browser journeys with Firebase/model stand-ins,
  source-only forms with optional fields blank, review/edit/save/reopen, task append,
  actual document/image/PDF readers and accessibility checks.
- Existing `npm run a11y` journeys and a production build.

These do not prove real AI quality or live availability. A production teacher must
complete a real source → rebuild → review/edit → save → reopen/usable output check.
Record that separately; successful deployment alone is not feature verification.
The dedicated release workflow deploys only lessonAssistant and Hosting, leaving
unrelated optional scheduled-worker permissions outside this feature release.
