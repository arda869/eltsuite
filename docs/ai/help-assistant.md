# ELT Suite help assistant

The Phase 1 platform help pilot follows the Google Drive “ELT Suite AI Assistant — Product Concept and Implementation Roadmap”, reviewed 31 October 2026. It is separate from lesson planning, proactive recommendations and the private Teaching Coach.

## Maintain the help library

Edit `functions/help/library.json`. Each article needs a stable ID, title, search keywords, a short explanation, verified steps, an existing feature or guide link, and the source files checked. Audit the interface before changing instructions. Bump `version` whenever guidance changes. Both the browser and server use this same catalogue; a version mismatch offers browse/support rather than stale AI answers. Only add features that exist. Do not put internal infrastructure guidance or secrets in the catalogue. Changes are reviewed and deployed with the app, rather than edited by teachers.

The model only chooses article IDs. The browser renders the reviewed wording and links, never model-generated instructions or HTML. Unsupported requests return no match and offer support. Video-call recording is not claimed; the current article describes verified listening-audio tools and explicitly states that limitation. Browse topics remains available without calling AI.

## Access, spending and privacy

`helpAssistant` is a server-side Firebase callable, using the existing `OPENAI_API_KEY` secret and `ELT_AI_MODEL`. Only active teacher profiles may call it; proxy sessions and learners are rejected. It does not query classes, learner records, private documents, teaching profiles or lesson-generation quota records. Help is available regardless of plan. It is explanatory and cannot modify teaching data.

The initial abuse guard is 30 AI questions and 30 feedback events per teacher per UTC day. Review this provisional pilot guard against actual usage. `helpBudgets/{YYYY-MM}` has a separate US$20 monthly cap using the existing conservative reservation and price-review checks. Failed or interrupted calls retain reservations to prevent unknown spend escaping the cap. Help never deducts teaching generation units. A single request selects at most two articles, takes at most 1,000 characters, has a 210-second client timeout and bounded backend concurrency. The shared provider disables storage. No question text is written to logs or usage records.

Chat exists in React memory only; reload, sign-out or Clear chat removes it. Only the current question and up to two prior article IDs go to the provider, with the approved catalogue. Feedback saves article IDs, catalogue version, rating and dates without a teacher identifier. The question is included only when the teacher explicitly selects “Include my question when I send feedback”. Do not enter learner details or private teaching material. Support email drafts are opened for the teacher to write and send themselves.

`helpPrivate` counters and `helpFeedback` records expire after 30 days. The scheduled assistant cleanup removes these expired records; spending ledgers remain to enforce cost controls. These collections are server-only under the default deny rules. Review protected feedback in the Firebase console to identify documentation gaps. This help chat does not profile page views or send unsolicited messages. The separately shipped opt-in Discovery feature retains its own tracking and preferences. The shared question-mark Help menu in the header opens Ask ELT Suite, Discover, or the guide; no fixed launcher covers the content. Opening either assistant panel closes the other.

## Verification and release

Run `node --test test/ai/help.test.mjs`, the normal build and the help browser journey. The deployment pipeline deploys the callable before the updated interface. Check desktop and phone layouts, keyboard closing/focus return, topic search, feature links, model-unavailable fallback, no-match handling, feedback failure/retry, chat clearing and sign-out. Confirm unauthenticated callable requests return 401. No live model call is needed for deployment checks.

## Useful feature alternatives

Each reviewed article can list related article IDs. After the direct answer, the chat offers at most one relevant alternative that is not already included in the answer. The teacher can expand “Show me how” without another AI call. Recording help covers both self-recording and AI speech/dialogue creation. Other links connect lesson planning to the AI planning pilot, live lessons to Rooms, resources to Collab, and Collab to reading sources in Development Studio.

The catalogue owns app eligibility, AI availability, pilot flags and the one-sentence benefit. Recommendations respect current app switches, pilot access and over-limit accounts. They do not invent paid plans, promise unavailable features or place sales prompts in troubleshooting and billing answers. Review these associations whenever the product changes.

An animated three-dot reply indicator appears during the request and stops on success or failure. Reduced-motion preferences show stationary dots with a status message.
