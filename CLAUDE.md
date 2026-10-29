# ELT Suite

Vite + React + TypeScript on Firebase (Auth, Firestore, Realtime Database). No server code of its own:
`firestore.rules` and `database.rules.json` are the access control, and scheduled jobs in `scripts/` run
from GitHub Actions. `npm run build` type-checks and builds; `npm run smoke` (or `npm run a11y`) runs the
Playwright journeys in `test/smoke.mjs` against stand-ins for Firebase (`test/mock`). Pushing to `main`
deploys.

## How ELT Suite writes

Every word on the site, in emails and in notifications follows this. Read it before you write any copy.

- **Voice:** a good colleague in the staffroom. Friendly and plain, not chatty. Calm, practical, on the
  teacher's side.
- **People:** "you" for the person reading. "Teachers" and "learners" (never "students", "users",
  "members" or "customers"). An organisation's "admins". "We" only for the ELT Suite team, mainly in
  emails, errors and support.
- **Contractions are fine:** you'll, we couldn't, it's, don't. No slang, no exclamation marks, no emoji,
  no hype ("amazing", "powerful", "seamless", "unleash", "revolutionise", "journey").
- **Short sentences, everyday words.** Say what a thing does and what to do next. One idea per sentence.
- **British English:** organisation, colour, centre, programme, licence (noun), enrol, practise (verb).
- **Sentence case** everywhere: buttons, headings, tabs, menus. Only names keep capitals (Classes,
  Studio, Rooms, Collab, Slides, Print, Files, Design, Teach live, Super Admin).
- **Buttons are verbs** that say what happens: "Make a class", "Save", "Send invitation". Not "OK",
  "Submit" or "Click here". Use "make" over "create" in everyday copy.
- **Errors:** say what happened, then what to do, and reassure if work is safe. Never blame the teacher.
  "We couldn't save that just now. Check your connection and try again. Your work is still here."
- **Empty states:** say what will appear and how to get it there. "No learners yet. Share your class code
  and they'll appear here as they join."
- **Confirmations:** name the thing and the consequence. "Delete this lesson? Your learners' answers to it
  go too. You can't undo this."
- **Loading:** "One moment…", or say what's happening ("Saving…", "Uploading…").
- **Learner-facing text** is even simpler: short words, short sentences, nothing a B1 learner would
  stumble on.
- Use the ellipsis character (…) and curly quotes (“ ” ’) in visible text.

## How printed worksheets look

Every printed or PDF worksheet, test, answer key and set of cut-out cards follows this. It is the
house style of `src/lib/worksheetHtml.ts`. The worksheet view in the lesson editor and any new paper
version of a question type must keep to it. Change these rules only when the owner asks.

- **Like a coursebook photocopiable:** calm, generous, precise. Measured in mm and pt, never screen px.
  A4 (or Letter, A5), one column. Nothing is split: a task or card never breaks across pages, and a section
  heading always stays with the task after it.
- **Two typefaces only:** Fraunces (serif) for everything learners read and write, 10.2pt/1.5 (9pt on
  A5); Karla (sans) for labels, headings, numbers in chips, kickers and the footer. Our own font files,
  loaded before the pages are laid out. The clearer-font option swaps both for Atkinson Hyperlegible.
- **Header band** on the first page of each part: a light grey band (#ecebe7), 30mm high, with a white
  Name box, the title in Karla 800 15.5pt, and on the right the class cover graphic fading into the band,
  with the ELT Suite logo (or the organisation's logo) and a kicker (class · level) on a white chip.
- **One accent colour:** the class colour (or the organisation's brand colour), used sparingly: exercise
  and question numbers, section headings and their rule, callout bars, the page-number chip, mark boxes,
  QR labels and scissors. Text is ink #262420; secondary text #66615b; hairlines warm greys (#d6d3cd,
  #a9a49d). No other colours, no gradients except the cover fade and the section rule.
- **Sections:** Karla 800, uppercase, letter-spaced, in the accent, with a thin accent rule to the right.
  **Exercises:** a number in the accent, the instruction as the heading, the body indented under it.
- **Answer space is drawn, not typed:** gaps are underlines, writing is ruled lines 7.4mm apart, matching
  is two lists with short answer lines (1 A), word boxes are pills, tables have hairline rows.
- **Sound and video** print as a QR code (20mm, rounded white tile) with a small accent label, the title
  in Fraunces and the short link under it. **Cut-out cards:** dashed borders, equal sizes on their own
  sheets, scissors in the accent.
- **Footer:** the class and lesson in Karla 6.8pt on the left, the page number in a solid accent chip on
  the right. The answer key and teacher's notes are numbered apart; cut-outs are not numbered.
- **Colour prints exactly** (`print-color-adjust: exact`) and pages have no browser margins.

## Super admins

The owner (a fixed email) is always a super admin; others are in `superAdmins/{email}` and need a verified
email. `isOwner()` in `firestore.rules` and `useSuper()` in `src/lib/admin.ts` mean "a super admin".

## Teachers join by invitation, and organisations' limits

For now a new teacher account needs an invitation. Either an invitation code (`inviteCodes/{code}`,
`src/lib/codes.ts`), typed in on the sign-in page ("I have an invitation", or the `/?code=` link),
made by a super admin in Super Admin → Invitation codes or by an organisation's admins in Organisation
admin → Invitation codes (`src/pages/admin/InviteCodes.tsx`); a code for an organisation also makes the
teacher one of its teachers. Or an organisation's emailed invitation (`orgInvites`, whose id comes with the
new profile as `invite`). `firestore.rules` (`users` create, `codeUsedNow`) enforces it: the account, one
use of the code and the place in the organisation are one write (`loadProfile` in `src/lib/auth.tsx`).
Without an invitation the new sign-in account is taken back and the sign-in page says why.
`scripts/mail.mjs` emails a code made for one email.

A super admin sets each organisation's limits (`orgs/{id}.limits`: teachers, classes, learners,
callMinutes a month; space is `limitGb`) in its Plan and limits page (`src/pages/admin/OrgLimits.tsx`);
its admins see them there. `orgs/{id}.usage` holds what it uses: classes and learners are counted up in
the same write that adds them (`countOne` in `src/lib/limitError.ts`, `countedIn` in the rules) and
recounted every 15 minutes by `scripts/space.mjs`; call minutes come from Daily in `scripts/video.mjs`,
which also pauses the organisation's class rooms past the limit (`video.paused`); the rules stop new
calls (`callRooms`), new teachers joining and codes being made past the limits.

## Design

Design (`src/design/`, kind `design` in `sharedDocs`) makes posters, flashcards, labelled pictures and
worksheets. Pages are `dpages`, every thing on a page is its own record in `dels` (so people editing
together see each other's changes at once), the accent colour is `dmeta/main`, and pictures are the file's
own media (`doc:<id>`). `src/design/render.ts` draws a page on a canvas, the same way on screen and for
downloads. Teaching tools: numbered labels with a learners' copy (words become lines), a word bank, covers
(blur, pixels, a plain cover, a mystery card), learner A / learner B things, cut-out cards, background
removal and print-friendly pictures. Free pictures come from Wikimedia Commons, with a credit line.
