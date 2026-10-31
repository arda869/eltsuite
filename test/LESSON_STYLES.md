# Class lesson presentation

`lessonStyle` is an optional class field with exactly two values: `adult` and `young`.
Missing values render as Adult. The setting writes only the class document. No lesson,
private key, answer, submission, progress or rich-document migration runs on a toggle.

Screen styles opt in at the lesson frame. Shared documents, messages, app navigation,
class pages and standalone applications do not acquire the style. Existing game stages
retain their own typefaces. Karla headings reuse the bundled font; body text uses local
Atkinson Hyperlegible, short notes use local Kalam, and IPA uses a separate local Noto
Sans face. Font licences accompany the files.

WorksheetDialog carries class style and colour into browser print and PDF. useSheet
carries them into the editor's worksheet preview. Collab's independent document export
remains independent of class presentation. Adult worksheet markup and CSS match the
original main implementation. Young learner dialogue is projected into transient print
bubbles; stored dialogue nodes are untouched. Young pagination keeps ordinary blocks
whole, waits for image dimensions and fonts, and removes unused trailing sheets. A5
PDF downloads now have actual A5 page dimensions.

## Run checks

Start `npx vite --config test/vite.config.ts --port 5184`, then run:

```
node test/lesson-style.mjs
node test/lesson-style-context.mjs
```

`STYLE_ONLY=classes` or `STYLE_ONLY=fixtures` runs either part separately.
`STYLE_OUTPUT` chooses the screenshot/report directory. `SMOKE_BROWSER_PATH` optionally
selects an installed Chromium executable. The Firebase stand-ins are used for browser
journeys; they do not validate security rules.

Run `test/lesson-style-rules.mjs` against a Firestore emulator started with the repository's
`firestore.rules`, project `demo-lesson-style`, host `127.0.0.1`, port `8089`.
`STYLE_FIRESTORE_EMULATOR=host:port` overrides the address. These are real emulator rule
checks, separate from the browser stand-ins.

## Validation record

- TypeScript check and production Vite build passed. Vite reports existing large-chunk
  and mixed static/dynamic-import warnings. A 768 MB build limit was insufficient;
  the successful build used a 2 GB Node heap.
- Existing class fallback; new class creation; settings save/reload in both directions;
  unchanged nested lesson, key, answer, submission, marking and reveal documents.
- Actual teacher editor, preview and worksheet editor; learner autosave and cross-tab
  updates with reloads in both directions, preserving task/key JSON and saved answers.
- 17 Firestore emulator checks: owner/co-teacher writes, learner/viewer/unrelated-account
  denial, invalid values, valid creates, legacy fallback and learner reads.
- 87 of the 93 actual insertion commands rendered. The remaining six open external or
  file pickers: media, image, imported PDF, storyboard, link card and organisation forms.
  Uploaded-file selection and playback were not end-to-end tested. A local picture and
  recording QR code are nevertheless included in print tests.
- Nested controls in email, dialogue, tables, diagrams and subtasks; long speech bubbles
  on both sides; answer lines, word tiles, authored emphasis and IPA. Repeated style
  toggles preserve responses, scoring and an opened reveal.
- Desktop and 390 px fixtures; A4, Letter and A5 pagination; clearer font, large text and
  two columns; original picture, QR code, cutouts, answer keys and notes. Actual PDF
  download rendered to page images and visually inspected.
- Adult source projection and worksheet markup/CSS compared against main commit
  `1933465bbfde70338c4ad0f2e3a93edec3a3bc86` for A4, A5 and Letter. Equal after excluding
  the pagination script and normalising whitespace.
- Existing smoke journeys “Class and learners”, “Learner signs in and opens the lesson”
  and “Mobile class creation and duplicate learner validation” passed.
- Existing “Lesson: diagram with a gap stays” smoke journey failed at its final preview
  gap assertion. The new context fixture's nested diagram preview and saved/reloaded
  learner controls pass. The slash-menu insertion journey remains an explicit gap;
  no claim is made that the entire existing smoke suite passed.

Live Firebase, mobile Safari, uploaded media playback, collaborative multi-user editing,
and every possible teacher-authored document combination were not tested. No deployment,
main-branch push or merge is included.
