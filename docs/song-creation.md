# Classroom song creation

Recording Studio → Create song asks for audience (young learners / teenagers / adults), CEFR level, musical style, approximate duration, singing style, language, teaching focus and a title. Teachers write/paste exact lyrics or request a separate ChatGPT draft. A draft never silently replaces their existing words: they explicitly choose “Use these lyrics”, can edit them, and must approve the final words before music generation.

## Private setup

Use the existing Firebase project `lesson-lit`. The existing `OPENAI_API_KEY` powers lyric drafts through the OpenAI Responses API. Add the Gemini key through a private terminal prompt:

```sh
npx firebase-tools@14 functions:secrets:set GEMINI_API_KEY --project lesson-lit
```

Paste the Gemini key only into that hidden/private prompt, never into source, chat, a browser setting, a `VITE_` environment variable or a GitHub commit. Enable paid API billing and Lyria access in the Google project associated with that key. Restrict the key to the Generative Language API. The production function binds `GEMINI_API_KEY` through Secret Manager; Firebase deployment grants the function access. Setting a new version requires redeploying `recordingSong`.

Models: 30-second clips use `lyria-3-clip-preview`; 60/90/120/180-second requests use `lyria-3.5`. Longer durations are prompt targets, not precise guarantees. Both model identifiers follow the official music-generation documentation checked 1 November 2026. No external SDK or browser-side provider call is used.

## Boundaries and recovery

Active teachers using their own account only. Proxy sessions, suspended/over-limit accounts and learners are rejected. Server transactions allow one in-flight generation per teacher, 3 songs and 10 lyric drafts per teacher/day, with service-wide daily limits of 50 songs and 300 drafts. A failed provider attempt consumes its reservation; retry is an explicit new attempt, never an automatic second paid request. IDs are scoped to the authenticated UID and reused IDs return the existing job. A separate result callable reads only that teacher's result and never creates music. Direct client reads/writes of songPrivate/songUsage are denied.

The current draft and request ID are kept in per-teacher session storage before the request. Refreshing allows “Recover creation”; an interrupted connection can retrieve completed output without regenerating. Provider requests have bounded timeouts. Expired or failed jobs unlock a new explicit attempt. Temporary results use private Firestore audio parts, matching the existing recording storage architecture, and expire after 24 hours. The existing deployment cleanup deletes expired result documents and private job audio parts; production cleanup frequency is deployment-dependent, so expiration ends retrieval even if physical cleanup runs later. Saving to Resources uses the normal recording save path and its existing storage quota, sharing, bin and retention behavior.

The preview keeps the exact approved text separate from the provider's returned lyrics/structure. There is no automatic claim of exact sung-word matching: teachers listen before use. Generated audio carries Google's SynthID watermark. Artist imitation and voice cloning are not offered. The existing recording timeline is mono; adding a stereo song uses the editor's existing mono conversion. One script block covers the song, with no invented word-level timestamps.

## Validation

Provider and contract tests in `test/speech/songs.test.mjs` verify exact text preservation, invalid briefs, model routing, safe failures and the separate ChatGPT request. Browser journeys cover review, approval reset, preview, timeline insertion, service failure, recovery after refresh, mobile layout and dark mode. Emulator rules tests check that song jobs and spending ledgers are inaccessible to clients. Mock audio validates the product flow; genuine Gemini generation and listening checks require the configured production secret and model access.

Official references: https://ai.google.dev/gemini-api/docs/music-generation and https://developers.openai.com/api/docs/guides/structured-outputs
