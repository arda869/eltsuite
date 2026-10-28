# ELT Suite

Vite + React + TypeScript on Firebase (Auth, Firestore, Realtime Database). No server code of its own:
`firestore.rules` and `database.rules.json` are the access control, and scheduled jobs in `scripts/` run
from GitHub Actions. `npm run build` type-checks and builds; `npm run smoke` (or `npm run a11y`) runs the
Playwright journeys in `test/smoke.mjs` against stand-ins for Firebase (`test/mock`). Pushing to `main`
deploys.

## Support tickets

Organisation admins (and the owner) open tickets with screenshots at `/support` (`src/pages/SupportPage.tsx`,
`src/lib/tickets.ts`). When asked to "look at the tickets" or work on them:

1. `git fetch origin support-tickets` and read `README.md` on that branch
   (`git show origin/support-tickets:README.md`). Each ticket not done yet has a folder `<id>/` with
   `ticket.md` and its screenshots (`shot-01.png`, …). Check the screenshots out to a scratch folder to look at them
   (`git archive origin/support-tickets <id> | tar -x -C <scratch>`).
   The branch is refreshed every hour by `.github/workflows/tickets.yml`; run that workflow by hand
   (no inputs) for a fresh copy.
2. Make the changes on the working branch as usual, with the ticket id in the commit message.
3. To answer a ticket in the app, run the "Support tickets" workflow with `ticket` (the id), `status`
   (`doing` or `done`) and `note` (what changed, in plain words for a school admin). It runs
   `scripts/tickets.mjs answer`, which adds the note from "ELT Suite support" and moves the ticket.
   Mark a ticket done only once the change is on `main`.
