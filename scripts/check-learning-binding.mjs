// Inspect the deployed functions and authenticate their exact bound provider key.
// This read-only check does not request text, speech, image, or other generation.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');

async function main() {
  const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  const names = ['lessonAssistant', 'buildLearningReport', 'prepareLessonMedia', 'recordingSpeech'];

  for (const name of names) {
    const { data } = await client.request({ url: `https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/${name}` });
    const binding = data.serviceConfig?.secretEnvironmentVariables?.find(value => value.key === 'OPENAI_API_KEY');
    if (!binding?.secret || !binding.version) throw Error(`${name} is missing its deployed API key binding.`);
    const secret = `https://secretmanager.googleapis.com/v1/projects/${binding.projectId || 'lesson-lit'}/secrets/${encodeURIComponent(binding.secret)}/versions/${encodeURIComponent(binding.version)}`;
    const { data: metadata } = await client.request({ url: secret });
    if (metadata.state !== 'ENABLED') throw Error(`${name}'s deployed API key version is not enabled.`);
    const { data: access } = await client.request({ url: `${secret}:access` });
    const key = Buffer.from(access.payload?.data || '', 'base64').toString('utf8').trim();
    if (!key) throw Error(`${name}'s deployed API key is empty.`);
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`${name}'s deployed API key was not accepted by the provider.`);
    console.log(`${name}: deployed binding enabled and provider authentication accepted. No generation was requested.`);
  }
}

main().catch(() => {
  console.error('The deployed learning AI binding or authentication check failed. No secret values or provider response bodies were printed.');
  process.exitCode = 1;
});
