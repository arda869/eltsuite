# AI listening transcript migration

AI-generated listening audio stays in the class `media` collection so learners can play it. Its transcript now lives in `mediaScripts`, where Firestore rules grant teachers access and deny learners access. Task content carries the audio ID, not the spoken words; teacher notes and answer keys remain in task-private documents. This change does not cover ordinary teacher-uploaded recordings or song scripts; those are a separate review because some are intentionally shared through QR playback.

## Rollout

1. Deploy the new rules, `lessonAssistant`, `prepareLessonMedia`, and hosting together. Coordinate this with other pending releases that deploy Firestore rules.
2. Run the **Audit AI audio script migration** GitHub workflow with **Apply** left off. It reads production and reports class, generated-audio, legacy-script, private-copy, conflict, and error counts. Save its run link and counts in B-029.
3. If conflicts or errors are nonzero, inspect those records privately before any migration. Never print transcript contents in logs.
4. After reviewing the counts, run the workflow again with **Apply** on and enter the exact reviewed `legacyScripts` count. The script repeats a complete dry run before writing and aborts if the count changed or if any conflict or read error is present. For local operation with admin credentials, use `node scripts/migrate-ai-audio-scripts.mjs --apply --expected-legacy-count=N` with that same reviewed number. The script only touches `ai_media_…` generated audio. It copies each legacy transcript to `mediaScripts`, reads it back and compares it, then transactionally deletes only the unchanged public field. It skips records changed during the run and reports them as conflicts. Rerunning it is safe after reviewing a fresh dry run.
5. Re-run the dry-run workflow. `legacyScripts` should be zero; inspect any exceptions. Use a signed-in teacher and learner on the published site to check that the teacher can open the script and answer key, the learner can play the audio, and the learner cannot read `mediaScripts` or a script field from the audio manifest. Also verify new AI listening generation through a complete usable result before closing B-019 or B-029.

The private document is the recovery copy. Migration never deletes it. If a rollout must be reversed, restore a manifest's transcript from its verified private document with admin access, then restore the prior frontend/functions/rules release. Do not expose the copied transcript in logs or tracker notes.
