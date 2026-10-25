// Publishes firestore.rules through the Firebase Rules API directly.
// Used because the Firebase CLI also needs Service Usage permissions.
import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const project = 'lesson-lit';
const base = `https://firebaserules.googleapis.com/v1/projects/${project}`;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();

async function call(method, url, body) {
  const res = await client.request({ method, url, data: body, validateStatus: () => true });
  return res;
}

const content = readFileSync('firestore.rules', 'utf8');
const rs = await call('POST', `${base}/rulesets`, { source: { files: [{ name: 'firestore.rules', content }] } });
if (rs.status >= 300) {
  console.error(`::error::Rules were rejected (${rs.status}): ${JSON.stringify(rs.data?.error?.message ?? rs.data).slice(0, 400)}`);
  process.exit(1);
}
const rulesetName = rs.data.name;
const releaseName = `projects/${project}/releases/cloud.firestore`;
let rel = await call('PATCH', `https://firebaserules.googleapis.com/v1/${releaseName}`, { release: { name: releaseName, rulesetName } });
if (rel.status === 404) rel = await call('POST', `${base}/releases`, { name: releaseName, rulesetName });
if (rel.status >= 300) {
  console.error(`::error::Rules release failed (${rel.status}): ${JSON.stringify(rel.data?.error?.message ?? rel.data).slice(0, 400)}`);
  process.exit(1);
}
console.log('Firestore rules published:', rulesetName);

// Realtime Database rules (live pointer, hand raise and other quick signals).
try {
  const dbAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email'] });
  const dbClient = await dbAuth.getClient();
  const rules = readFileSync('database.rules.json', 'utf8');
  const res = await dbClient.request({ method: 'PUT', url: 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app/.settings/rules.json', data: rules, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true });
  if (res.status >= 300) {
    console.error(`::error::Realtime Database rules were rejected (${res.status}): ${JSON.stringify(res.data).slice(0, 400)}`);
    process.exit(1);
  }
  console.log('Realtime Database rules published');
} catch (e) {
  console.error('::error::Realtime Database rules could not be published: ' + (e?.message ?? e));
  process.exit(1);
}
