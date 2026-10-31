import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { canCoach, coachInstructions, coachRequest, dialogueFramework } from './coach-contract.js';
import { generate } from './provider.js';
import { checkModel, reserveBudget, settleBudget } from './budget.js';

export async function teachingCoach(req, { apiKey, model, enabled }) {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  let input; try { input = coachRequest(req.data); } catch (e) { throw new HttpsError('invalid-argument', e.message); }
  const db = getFirestore(), uid = req.auth.uid;
  const [profile, account, pilot] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get(), db.doc(`aiPilot/${uid}`).get()]);
  if (!canCoach(req.auth, profile.data(), account.data())) throw new HttpsError('permission-denied', 'Sign in with an active teacher account.');
  if (enabled !== 'true' || pilot.get('enabled') !== true) throw new HttpsError('failed-precondition', 'AI conversations are not enabled for this account yet. You can still use your journal and inquiries.');
  try { checkModel(model); } catch(e) { throw new HttpsError('failed-precondition', e.message); }
  const context = {}, basis = [];
  if (input.useProfile || input.useBeliefs) {
    const p = await db.doc(`teachingCoach/${uid}/settings/profile`).get();
    if (input.useProfile && p.exists) { context.profile = Object.fromEntries(['qualifications', 'experience', 'roles', 'context', 'goals'].map(k => [k, p.get(k) ?? ''])); basis.push('Your professional profile'); }
    if (input.useBeliefs && p.get('beliefs')) { context.beliefs = p.get('beliefs'); basis.push('Your teaching beliefs'); }
  }
  for (const [field, kind] of [['entryId', 'reflections'], ['researchId', 'inquiries']]) {
    if (!input[field]) continue;
    const snap = await db.doc(`teachingCoach/${uid}/${kind}/${input[field]}`).get();
    if (!snap.exists) throw new HttpsError('not-found', 'The selected writing is no longer available. Choose the context again.');
    const allowed = kind === 'reflections' ? ['title','text','theme','intention','reality','next','readingTitle'] : ['title','baseline','intervention','evidence','ethics','observations','interpretation','limitations','next','sources'];
    context[kind] = Object.fromEntries(allowed.map(k => [k, snap.get(k) ?? '']));
    basis.push(`${kind === 'reflections' ? 'Reflection' : 'Inquiry'}: ${snap.get('title')}`);
  }
  const payload = { mode: input.mode, prompt: input.prompt, history: input.history, context };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 65000) throw new HttpsError('invalid-argument', 'Choose less context or shorten this conversation. Your writing is still here.');
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const day = new Date().toISOString().slice(0,10), month = day.slice(0,7);
  const job = db.doc(`aiPrivate/${uid}/jobs/coach_${req.data.requestId}`), quota = db.doc(`aiPrivate/${uid}/usage/${day}`), global = db.doc(`aiUsage/${day}`), budget = db.doc(`aiBudgets/${month}`);
  const existing = await db.runTransaction(async tx => {
    const [j,q,g,b] = await Promise.all([tx.get(job),tx.get(quota),tx.get(global),tx.get(budget)]);
    if (j.exists) {
      if (j.get('fingerprint') !== fingerprint) throw new HttpsError('invalid-argument', 'The question or selected context changed. Clear the conversation and try again.');
      if (j.get('expiresAt')?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This response has expired. Clear the conversation and start again.');
      if (j.get('status') === 'completed') return j.get('result');
      throw new HttpsError('failed-precondition', j.get('status') === 'running' ? 'This response is still running. Retry shortly. If it remains unavailable, clear the conversation and start again.' : 'This response could not finish. Clear the conversation and try again.');
    }
    if ((q.get('calls') ?? 0) >= 12 || (g.get('calls') ?? 0) >= 120) throw new HttpsError('resource-exhausted', 'The daily AI pilot allowance has been reached. Your journal and inquiries are still available.');
    let reservation; try { reservation = reserveBudget(b.get('committedMicroUsd') ?? 0, 1); } catch(e) { throw new HttpsError('resource-exhausted', e.message); }
    tx.set(budget, { committedMicroUsd: reservation.balance, month, limitMicroUsd: 20_000_000 }, { merge: true });
    tx.set(quota, { calls: (q.get('calls') ?? 0)+1 }); tx.set(global, { calls: (g.get('calls') ?? 0)+1 });
    tx.create(job, { action: 'coach', status: 'running', fingerprint, reservedMicroUsd: reservation.reserved, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now()+86400000) });
    return null;
  });
  if (existing) return existing;
  try {
    const generated = await generate({ apiKey, model, schema: { type: 'object', additionalProperties: false, properties: { reply: { type: 'string', minLength: 1, maxLength: 6000 } }, required: ['reply'] }, name: 'teaching_coach', input: payload, instructions: coachInstructions + '\n' + dialogueFramework });
    const result = { reply: generated.value.reply, basis };
    await db.runTransaction(async tx => {
      const [b,j] = await Promise.all([tx.get(budget),tx.get(job)]);
      const settled = settleBudget(b.get('committedMicroUsd'), j.get('reservedMicroUsd'), [generated.usage]);
      tx.update(budget, { committedMicroUsd: settled.balance }); tx.update(job, { status: 'completed', result, costMicroUsd: settled.cost });
    });
    return result;
  } catch {
    // Retain the full reservation when provider usage is unknown. Never log private writing.
    await job.update({ status: 'failed' }).catch(() => {});
    throw new HttpsError('unavailable', 'We couldn’t finish that response. Your writing is still here. Clear the conversation to start a fresh request.');
  }
}
