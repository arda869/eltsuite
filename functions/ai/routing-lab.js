import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { isGenerationAdmin } from './allowance.js';
import { defineSecret } from 'firebase-functions/params';
const openaiKey = defineSecret('OPENAI_API_KEY');

const PROVIDERS = {
  deepseek: { secret: 'ELT_LAB_DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/models', header: 'Authorization', prefix: 'Bearer ' },
  elevenlabs: { secret: 'ELT_LAB_ELEVENLABS_API_KEY', url: 'https://api.elevenlabs.io/v1/user', header: 'xi-api-key', prefix: '' },
};
const JOBS = {
  tasks: { live: 'openai:gpt-6.1-sol', candidates: ['deepseek:deepseek-v4-pro', 'deepseek:deepseek-flash'] },
  narration: { live: 'openai:gpt-realtime-2.1-mini', candidates: ['elevenlabs:eleven_v4', 'elevenlabs:eleven_v4_turbo'] },
  transcription: { live: 'openai:gpt-4o-transcribe-diarize', candidates: ['elevenlabs:scribe_v3'] },
  music: { live: 'google:lyria-3.5', candidates: ['elevenlabs:music'] },
  images: { live: 'openai:gpt-image-2.5-flare', candidates: ['google:gemini-3.1-flash-image'] },
};

const projectId = () => process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'lesson-lit';
async function googleToken(fetchImpl = fetch) {
  const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new HttpsError('failed-precondition', 'The server cannot access its secret manager identity.');
  const body = await response.json();
  if (typeof body.access_token !== 'string') throw new HttpsError('failed-precondition', 'The server cannot access its secret manager identity.');
  return body.access_token;
}

async function secretRequest(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const token = await googleToken(fetchImpl);
  const response = await fetchImpl('https://secretmanager.googleapis.com/v1/' + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  return response;
}

async function storeSecret(provider, value, fetchImpl = fetch) {
  const name = PROVIDERS[provider].secret, parent = `projects/${projectId()}`;
  const response = await secretRequest(`${parent}/secrets/${name}:addVersion`, {
    method: 'POST', body: { payload: { data: Buffer.from(value, 'utf8').toString('base64') } }, fetchImpl,
  });
  if (!response.ok) throw new HttpsError('failed-precondition', 'The server cannot save the key securely. Check its Secret Manager permissions.');
}

async function readSecret(provider, fetchImpl = fetch) {
  const name = PROVIDERS[provider].secret;
  const response = await secretRequest(`projects/${projectId()}/secrets/${name}/versions/latest:access`, { fetchImpl });
  if (!response.ok) throw new HttpsError('failed-precondition', 'The provider key is unavailable in Secret Manager.');
  const body = await response.json();
  const encoded = body.payload?.data;
  if (typeof encoded !== 'string') throw new HttpsError('failed-precondition', 'The provider key is unavailable in Secret Manager.');
  return Buffer.from(encoded, 'base64').toString('utf8');
}

async function checkCredential(provider, key, fetchImpl = fetch) {
  const config = PROVIDERS[provider];
  const response = await fetchImpl(config.url, {
    headers: { [config.header]: config.prefix + key }, signal: AbortSignal.timeout(12000),
  });
  if (response.status === 401 || response.status === 403) throw new HttpsError('failed-precondition', 'The provider rejected this key. Nothing was saved.');
  if (!response.ok) throw new HttpsError('unavailable', 'The provider did not complete the free account check. Nothing was saved.');
  return true;
}

const trialSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, learnerInstructions: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
    answerKey: { type: 'array', items: { type: 'string' } },
    teacherNotes: { type: 'string' },
  },
  required: ['title', 'learnerInstructions', 'questions', 'answerKey', 'teacherNotes'],
};
const trialPrompt = 'Create one original A2 English information-gap task about two people planning a weekend trip. It must work in pairs and have exactly four questions. Include self-contained learner instructions, the information each learner needs in the question text, a complete answer key and brief teacher notes. Use British English. Do not include real learner data.';
async function trialTaskModel(route, key, fetchImpl = fetch) {
  const [provider, model] = route.split(':');
  const response = await fetchImpl(provider === 'deepseek' ? 'https://api.deepseek.com/responses' : 'https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, store: false, instructions: 'You design original, usable English language activities. Return JSON only. Follow the requested schema.', input: trialPrompt,
      max_output_tokens: 1600, text: { format: { type: 'json_schema', name: 'activity_trial', ...(provider === 'openai' ? { strict: true } : {}), schema: trialSchema } } }),
  });
  if (!response.ok) throw new Error('The provider rejected this trial.');
  const body = await response.json();
  if (body.status !== 'completed') throw new Error('The provider did not finish this trial.');
  const output = (body.output || []).flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('');
  let value;
  try { value = JSON.parse(output); } catch { throw new Error('The provider did not return a readable task.'); }
  if (!value || typeof value.title !== 'string' || !Array.isArray(value.questions) || value.questions.length !== 4 || !Array.isArray(value.answerKey) || value.answerKey.length !== 4 || typeof value.learnerInstructions !== 'string' || typeof value.teacherNotes !== 'string')
    throw new Error('The task did not pass the output check.');
  const inputTokens = Number(body.usage?.input_tokens), outputTokens = Number(body.usage?.output_tokens);
  const rates = { 'openai:gpt-6.1-sol': [2, 10], 'deepseek:deepseek-v4-pro': [1.32, 3.96], 'deepseek:deepseek-flash': [0.3, 1.2] };
  const rate = rates[route];
  const maximumListCostUsd = Number.isFinite(inputTokens) && Number.isFinite(outputTokens) && rate ? +(inputTokens * rate[0] / 1e6 + outputTokens * rate[1] / 1e6).toFixed(5) : null;
  return { route, value, usage: { inputTokens, outputTokens }, maximumListCostUsd };
}

export async function routingLab(db, auth, data = {}, deps = {}) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to use the AI routing lab.');
  if (!await isGenerationAdmin(db, auth)) throw new HttpsError('permission-denied', 'Only verified super admins can use the AI routing lab.');
  const action = data.action || 'status';
  if (action === 'status') {
    const [routeSnap, credentialSnap] = await Promise.all([
      db.doc('aiRoutingLab/control').get(), db.collection('aiRoutingLabCredentials').get(),
    ]);
    const credentials = Object.fromEntries(credentialSnap.docs.filter(doc => PROVIDERS[doc.id]).map(doc => [doc.id, {
      connected: doc.get('connected') === true, checkedAt: doc.get('checkedAt') || null,
    }]));
    return { jobs: JOBS, draft: routeSnap.get('draft') || {}, credentials };
  }
  if (action === 'connect') {
    const provider = data.provider;
    if (!Object.hasOwn(PROVIDERS, provider)) throw new HttpsError('invalid-argument', 'Choose a supported provider.');
    const key = data.key;
    if (typeof key !== 'string' || key.length < 12 || key.length > 500 || /[\r\n\u0000]/.test(key))
      throw new HttpsError('invalid-argument', 'Paste a valid API key.');
    await checkCredential(provider, key, deps.fetchImpl);
    await (deps.storeSecret || storeSecret)(provider, key, deps.fetchImpl);
    const checkedAt = Date.now();
    await db.doc('aiRoutingLabCredentials/' + provider).set({ connected: true, checkedAt, updatedBy: auth.uid });
    await db.collection('aiRoutingLabAudit').add({ action: 'connect', provider, at: checkedAt, by: auth.uid });
    return { connected: true, checkedAt };
  }
  if (action === 'check') {
    const provider = data.provider;
    if (!Object.hasOwn(PROVIDERS, provider)) throw new HttpsError('invalid-argument', 'Choose a supported provider.');
    const key = await (deps.readSecret || readSecret)(provider, deps.fetchImpl);
    await checkCredential(provider, key, deps.fetchImpl);
    const checkedAt = Date.now();
    await db.doc('aiRoutingLabCredentials/' + provider).set({ connected: true, checkedAt, updatedBy: auth.uid }, { merge: true });
    return { connected: true, checkedAt };
  }
  if (action === 'saveDraft') {
    const { job, candidate } = data;
    if (!Object.hasOwn(JOBS, job) || !JOBS[job].candidates.includes(candidate)) throw new HttpsError('invalid-argument', 'Choose a candidate listed for this job.');
    const provider = candidate.split(':')[0];
    if (provider !== 'google') {
      const connected = await db.doc('aiRoutingLabCredentials/' + provider).get();
      if (connected.get('connected') !== true) throw new HttpsError('failed-precondition', 'Connect and check this provider first.');
    }
    const ref = db.doc('aiRoutingLab/control'), at = Date.now();
    await ref.set({ draft: { [job]: candidate }, updatedAt: at, updatedBy: auth.uid }, { merge: true });
    await db.collection('aiRoutingLabAudit').add({ action: 'saveDraft', job, candidate, at, by: auth.uid });
    return { job, candidate, draftOnly: true };
  }
  if (action === 'trialTasks') {
    if ((await db.doc('aiRoutingLabCredentials/deepseek').get()).get('connected') !== true)
      throw new HttpsError('failed-precondition', 'Connect and check DeepSeek before comparing task creators.');
    const day = new Date().toISOString().slice(0, 10), limitRef = db.doc(`aiRoutingLabTrialLimits/${auth.uid}_${day}`);
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(limitRef), count = snap.get('comparisons') || 0;
      if (count >= 5) throw new HttpsError('resource-exhausted', 'Five comparisons have run today. Try again tomorrow.');
      transaction.set(limitRef, { comparisons: count + 1, day, uid: auth.uid });
    });
    const deepseek = await (deps.readSecret || readSecret)('deepseek', deps.fetchImpl);
    const current = deps.openaiKey || openaiKey.value();
    if (!current) throw new HttpsError('failed-precondition', 'The current OpenAI key is not bound to this function.');
    const routes = ['openai:gpt-6.1-sol', 'deepseek:deepseek-v4-pro', 'deepseek:deepseek-flash'];
    const results = await Promise.all(routes.map(async route => {
      try { return await trialTaskModel(route, route.startsWith('openai:') ? current : deepseek, deps.fetchImpl); }
      catch { return { route, error: 'This model did not return a complete valid task. The other results are still available.' }; }
    }));
    const at = Date.now();
    await db.collection('aiRoutingLabTrials').add({ by: auth.uid, at, job: 'tasks', results });
    await db.collection('aiRoutingLabAudit').add({ action: 'trialTasks', at, by: auth.uid });
    return { results, at, trialOnly: true };
  }
  throw new HttpsError('invalid-argument', 'Choose an AI routing lab action.');
}

export const adminAiRoutingLab = onCall({ region: 'us-central1', secrets: [openaiKey], maxInstances: 2, timeoutSeconds: 150 }, req =>
  routingLab(getFirestore(), req.auth, req.data));
