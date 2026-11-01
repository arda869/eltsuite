# Applied Linguistics Studio connection setup

The manual investigation workflow does not require a corpus API key. AI interpretation uses the existing server-side OpenAI connection and allowance controls. It must not describe generated examples as corpus findings.

## Optional corpus provider

The initial adapter targets the [Sketch Engine API](https://www.sketchengine.eu/apidoc/), using its [current OpenAPI contract](https://www.sketchengine.eu/apidoc/openapi.yaml). The connection is disabled by default. An API subscription does not by itself establish permission to redistribute corpus extracts in ELT Suite.

Before enabling it, confirm the corpus identifiers and the provider's terms for commercial use, storage, classroom sharing and AI processing. Store the API key in Google Secret Manager as `SKETCH_ENGINE_API_KEY`, never in client settings or a repository. Set the server-only Firestore document `admin/corpus`:

```json
{
  "enabled": true,
  "corpora": [{
    "id": "provider-confirmed-corpus-id",
    "name": "Display name",
    "licensed": true,
    "attribution": "Required attribution",
    "licence": "Approved reuse terms",
    "allowCache": false,
    "allowExport": false,
    "allowAI": false,
    "lemma": false
  }]
}
```

Set each permission to true only when permitted by the licence; `lemma` also requires corpus support. Unapproved corpus rows are excluded. Search results cannot be saved without `allowCache`, shared without `allowExport`, or sent to AI without `allowAI`. Existing provider evidence is rechecked against current configuration. Teacher-entered examples rely on the author's explicit rights confirmation.

Run `node functions/linguistics/preflight.mjs` after writing `functions/.env.lesson-lit`, export that environment for Firebase source discovery, and deploy `appliedLinguistics` and `appliedLinguisticsAnalysis`. The preflight checks metadata without printing the key. It sets `ELT_CORPUS_CONNECTED`; the callable binds the secret only when configured.

After deployment, run `node functions/linguistics/check-connection.mjs` with deployment credentials. This checks the actual deployed binding and authenticates a corpus metadata request without AI generation. Then verify a real search, selection, save/reopen and permitted classroom share. A successful metadata check alone is not end-to-end verification.

Corpus-wide frequency, collocation, register statistics and analytical validity are not enabled by this initial adapter. They need a separate validated implementation. No estimated statistics are shown in their place.
