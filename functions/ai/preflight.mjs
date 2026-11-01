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
for (const name of ['OPENAI_API_KEY','GEMINI_API_KEY']) {
  const secret = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${name}`;
  await request(secret);
  const version = await request(`${secret}/versions/latest`);
  if (version.state !== 'ENABLED') throw Error(`The latest ${name} version must be enabled.`);
  console.log(`${name} exists and has an enabled version. Secret value was not accessed.`);
}

// Scheduled cleanup uses existing Firestore data access; no index-admin grant needed.
