# Public website implementation and verification

Source: the user's November 2026 Complete Public Website Experience and Public Homepage and Interactive Demo briefs. Both resent attachments were byte-for-byte identical to the reviewed versions.

## Implemented scope

- Invitation-only public homepage with approved section order and teacher-centred copy.
- Warm neutral / charcoal / terracotta presentation, Fraunces and Karla, light and dark device preferences.
- Hero preview explains planning, learner activity and evidence with selectable working examples and a non-looping objective/activity/note reveal. Reduced motion disables animation.
- Plan / Teach / Understand / Reflect / Grow demonstrations; native task and notes editor components, local reflection/coaching example.
- Separate public Explore, Pricing, About, Sign In, Contact, Privacy and Terms destinations; unknown and restricted-access states.
- Fictional eight-learner class with seven previous lessons; current lesson, role cards, native gap task, prepared evaluation, individual work, next-lesson outlines and local Collab editing.
- Six freely selectable guided steps, independent tool browsing, end-of-demo navigation, reset, session-scoped storage and 30-minute expiry.
- No live AI generation, database queries or production documents in the demo components. Collab surface has no network provider.
- Proposed pricing cards, detailed unapproved entitlement comparison, credit explanation and policy FAQs. No checkout, signup, waitlist or invitation-request form.
- Verified contact email reuses the existing Help Assistant support address.
- Existing invitation and authentication backend retained; signed-in home and teaching routes retained.
- Public page titles, descriptions, canonical and social metadata; unknown/restricted routes noindex.

## Explicit unresolved policy dependencies

Privacy and Terms in the repository are labelled draft placeholders. Their content remains unchanged and visibly marked as draft; this implementation does not fabricate approved legal text. Approval of legal policy, pricing/credit quantities, retention terms and future registration/checkout remains outside this code change.

## Verification status

Live publication has not yet been verified. Do not treat a build or simulated Firebase test as proof of deployed authentication or end-to-end production functionality. See the final PR validation report for completed checks and any remaining limitations.
