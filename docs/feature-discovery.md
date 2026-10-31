# Feature discovery

The floating **Discover** button is available to signed-in teachers. It uses the existing ELT Suite typefaces, colour variables and icons; it supports light/dark themes, reduced motion and a full-screen phone layout. Settings also links to Discovery preferences.

Each feature now has an illustrated, interactive three-step flow tree, accessible from **Your features → Visual guide** or a recommendation’s **Show me how** button. Teachers can move between steps, inspect a theme-aware illustration and branch to the feature or the full Guide. These are labelled illustrations, not screenshots or completion claims. Browsing a visual guide works with tracking off and writes no discovery data. Icon frames use a fixed centred grid, aligned beside the feature heading rather than floating in a card corner.

Personalisation and proactive messages are **off by default**. Opting in starts tracking from that point; earlier use is deliberately not inferred from page visits or imported from admin activity logs. This is a deterministic product-help feature, separate from the AI Lesson Assistant and private teaching reflection. It makes no model calls and consumes no AI allowance.

## Verified catalog and completion hooks

| Feature | Successful action that counts | Repeated writes |
| --- | --- | --- |
| Lessons | Save a task containing text | Once per lesson |
| Teacher notes | Save non-empty teacher notes | Once per task |
| Marking and feedback | Save a mark or comment | Once per learner/task |
| Teach live | Start presenting a lesson | Once per lesson |
| Timetable | Create a session | Once per session |
| Collab | Create a document successfully | Once per document |
| Reading Journal | Create a journal successfully | Once per journal |

The creation workflows for Collab and Reading Journal count creating the file, not completing all of its contents. The catalog intentionally excludes unverified or pilot-only features, including the roadmap examples for differentiation and lesson recording. Add new entries only alongside a real completion hook and verified guidance.

Usage labels are no recorded completion, one, two, and three or more distinct completions. These are product-adoption summaries, not measures of teaching quality or how often someone teaches. Opening a page, following a suggestion, and reading a guide never count as activation. Opening a guide is linked to later real completion for the “Guided workflow completed” indicator.

## Recommendations and controls

The catalog ranks unexplored features by the chosen teaching goal, current route and adjacent completed workflows. It filters current account, global and organisation app switches, and suppresses recommendations for suspended/over-limit accounts. Permission reads fail closed. Normal workflow permissions continue to apply at the destination.

Only one suggestion can be unread at a time. Transactions apply the rolling cap across devices: at most one every 1, 3 or 7 days, default 7. Default quiet hours are 20:00–08:00 in each device’s local time. A visible-page check and a one-minute timer support event-based delivery and check-ins while the app is open. There are no email/push messages or background jobs. Discovery stays out of live lesson editing, calls and studios. Manually opening discovery remains available outside those focused workflows even when proactive suggestions are paused.

Teachers can open a feature, view its walkthrough, snooze it for a week, dismiss it, pause for 30 days, disable proactive delivery, turn tracking off, review/reset recommendation history, or delete all discovery data. Manual browsing records a read suggestion so it does not immediately generate an unread nudge. Resetting recommendation history keeps the existing frequency cooldown and does not erase actual usage.

## Data and access

`featureDiscovery/{uid}` is readable/writable only by that active teacher, excluding proxy sessions. Organisations and super admins have no client read permission. It stores seven bounded feature summaries, day-level UTC last-use dates, settings, recommendation feedback and the last delivery. It contains no lesson text, names, learner answers or private reflections. Resource identifiers are SHA-256 hashed before persistence and the newest 80 tokens per feature provide bounded retry/autosave deduplication. Very old resources outside that bounded window may count again. Counters saturate at 10,000.

Turning tracking off stops collection and proactive delivery. Data stays until the teacher deletes it or deletes their account; no unbounded event history accumulates. Tracking failures never fail the original teaching action. The existing super-admin activity logging is separate and is unaffected by discovery preferences.

## Verification

`node --test test/discovery/*.test.mjs` checks ranking, eligibility, cooldowns, quiet hours, opt-in, deduplication and guided completion. The smoke journey checks real document creation, preference persistence, pause/opt-out, responsive layouts and accessibility. The deployment workflow runs emulator access tests before publishing, including cross-user/admin/proxy denial, invalid schemas, bounds and deletion.
