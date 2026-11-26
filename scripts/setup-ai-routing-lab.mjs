// Create empty key slots and grant the deployed callable only read/add-version access.
// Never prints, accepts, or stores provider API key values.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');
const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
const project = 'lesson-lit', region = 'us-central1';
const api = async (url, method = 'GET', data, allowExists = false) => {
  try { return (await client.request({ url, method, data })).data; }
  catch (error) { if (allowExists && error.response?.status === 409) return null; throw error; }
};
const fn = await api(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions/adminAiRoutingLab`);
if (!fn.serviceConfig?.secretEnvironmentVariables?.some(secret => secret.key === 'OPENAI_API_KEY' && secret.secret === 'OPENAI_API_KEY' && secret.version))
  throw Error('The routing lab was deployed without its current-provider secret binding.');
const runtime = fn.serviceConfig?.serviceAccountEmail;
if (!runtime || !runtime.endsWith('.gserviceaccount.com')) throw Error('The routing lab runtime identity is unavailable.');
for (const name of ['ELT_LAB_DEEPSEEK_API_KEY', 'ELT_LAB_ELEVENLABS_API_KEY']) {
  const resource = `projects/${project}/secrets/${name}`;
  await api(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets?secretId=${name}`, 'POST', {
    replication: { automatic: {} }, labels: { application: 'eltsuite', purpose: 'ai-routing-lab' },
  }, true);
  const base = `https://secretmanager.googleapis.com/v1/${resource}`;
  const policy = await api(`${base}:getIamPolicy`);
  const member = `serviceAccount:${runtime}`;
  const bindings = [...(policy.bindings || [])];
  let changed = false;
  for (const role of ['roles/secretmanager.secretAccessor', 'roles/secretmanager.secretVersionAdder']) {
    let binding = bindings.find(item => item.role === role);
    if (!binding) { binding = { role, members: [] }; bindings.push(binding); }
    if (!binding.members.includes(member)) { binding.members.push(member); changed = true; }
  }
  if (changed) await api(`${base}:setIamPolicy`, 'POST', { policy: { ...policy, bindings } });
  const check = await api(`${base}:getIamPolicy`);
  for (const role of ['roles/secretmanager.secretAccessor', 'roles/secretmanager.secretVersionAdder']) {
    if (!check.bindings?.some(binding => binding.role === role && binding.members?.includes(member)))
      throw Error(`${name}: the runtime still lacks ${role}`);
  }
  console.log(`${name}: empty slot ready; runtime can read and add versions`);
}
