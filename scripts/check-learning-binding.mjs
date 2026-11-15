// Inspect the deployed functions and authenticate their exact bound provider key.
// This read-only check does not request text, speech, image, or other generation.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');

async function main() {
  const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  const names = ['lessonAssistant', 'buildLearningReport', 'prepareLessonMedia'];
  let mediaBinding;

  for (const name of names) {
    const { data } = await client.request({ url: `https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/${name}` });
    const binding = data.serviceConfig?.secretEnvironmentVariables?.find(value => value.key === 'OPENAI_API_KEY');
    if (!binding?.secret || !binding.version) throw Error(`${name} is missing its deployed API key binding.`);
    if (name === 'prepareLessonMedia') mediaBinding = binding;
    console.log(`${name}: deployed secret binding verified.`);
  }

  const secret = `https://secretmanager.googleapis.com/v1/projects/${mediaBinding.projectId || 'lesson-lit'}/secrets/${encodeURIComponent(mediaBinding.secret)}/versions/${encodeURIComponent(mediaBinding.version)}`;
  const { data: metadata } = await client.request({ url: secret });
  if (metadata.state !== 'ENABLED') throw Error('The deployed lesson-media API key version is not enabled.');
  const { data: access } = await client.request({ url: `${secret}:access` });
  const key = Buffer.from(access.payload?.data || '', 'base64').toString('utf8').trim();
  if (!key) throw Error('The deployed lesson-media API key is empty.');
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error('The deployed lesson-media key was not accepted by the provider.');
  console.log('Lesson-media provider authentication accepted. No generation was requested.');
}

main().catch(() => {
  console.error('The deployed learning AI binding or authentication check failed. No secret values or provider response bodies were printed.');
  process.exitCode = 1;
});
