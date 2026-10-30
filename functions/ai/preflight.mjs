// Read secret metadata only; never retrieve or log the secret's payload in CI.
import { applicationDefault } from 'firebase-admin/app';
const project = 'lesson-lit';
const credential = applicationDefault();
const { access_token } = await credential.getAccessToken();
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw Error(`Google Cloud preflight failed (${response.status}): ${data.error?.message ?? 'Request rejected'}`);
  return data;
}
const secret = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/OPENAI_API_KEY`;
await request(secret);
const version = await request(`${secret}/versions/latest`);
if (version.state !== 'ENABLED') throw Error('The latest OPENAI_API_KEY version must be enabled.');
console.log('OPENAI_API_KEY exists and has an enabled version. Secret value was not accessed.');

const field = `projects/${project}/databases/(default)/collectionGroups/jobs/fields/expiresAt`;
const api = 'https://firestore.googleapis.com/v1/';
const current = await request(api + field);
if (!['ACTIVE', 'CREATING'].includes(current.ttlConfig?.state)) {
  await request(api + field + '?updateMask=ttlConfig', { method: 'PATCH', body: JSON.stringify({ ttlConfig: {} }) });
  console.log('Requested TTL cleanup for temporary assistant jobs. Google applies TTL asynchronously.');
} else console.log('Temporary job TTL is already configured.');
