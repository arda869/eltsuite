import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { canPlan, validateBrief, validate, checkSequence, outlineSchema, planSchema, reviewSchema } from './contract.js';
import { generate, teachingInstructions } from './provider.js';

const key = defineSecret('OPENAI_API_KEY');
const model = defineString('ELT_AI_MODEL', { default: '' });
const enabled = defineString('ELT_AI_ENABLED', { default: 'false' });
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const fail = message => { throw new HttpsError('invalid-argument', message); };
const criteria = 'objectives and evidence; coherence; level and context; linguistic accuracy; meaningful communication; scaffolding and differentiation; timing and feasibility; instructions and interaction; assessment and feedback; accessibility and inclusion; teacher notes and keys';

export const lessonAssistant = onCall({ region: 'us-central1', secrets: [key], maxInstances: 2, concurrency: 4, timeoutSeconds: 300 }, async req => {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  const db = getFirestore(), uid = req.auth.uid, d = req.data ?? {};
  if (!id(d.classId)) fail('Choose a class.');
  const [profile, account, cls, pilot] = await Promise.all([
    db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get(), db.doc(`classes/${d.classId}`).get(), db.doc(`aiPilot/${uid}`).get(),
  ]);
  if (!canPlan(uid, profile.data(), account.data(), cls.data())) throw new HttpsError('permission-denied', 'You need teaching access to this class.');
  if (enabled.value() !== 'true' || pilot.get('enabled') !== true) throw new HttpsError('failed-precondition', 'The lesson assistant is not enabled for this account yet.');
  const drafts = db.collection('aiPrivate').doc(uid).collection('drafts');
  if (d.action === 'list') {
    const snap = await drafts.where('classId', '==', d.classId).limit(50).get();
    return { drafts: snap.docs.map(s => ({ id: s.id, title: s.get('plan.title'), version: s.get('version') })) };
  }
  if (d.action === 'load' || d.action === 'delete') {
    if (!id(d.draftId)) fail('Choose a saved plan.');
    const ref = drafts.doc(d.draftId), snap = await ref.get();
    if (!snap.exists || snap.get('classId') !== d.classId) throw new HttpsError('not-found', 'That plan is not available.');
    if (d.action === 'delete') { await ref.delete(); return { deleted: true }; }
    return { draft: snap.data() };
  }
  let brief;
  try { brief = validateBrief(d.brief); } catch (e) { fail(e.message); }
  if (d.action === 'save') {
    if (!id(d.draftId) || !Number.isInteger(d.version) || d.version < 0) fail('Choose a plan version.');
    try { checkSequence(validate(planSchema, d.plan), brief.duration); } catch (e) { fail(e.message); }
    if (JSON.stringify(d.plan).length > 180000) fail('This plan is too long.');
    const ref = drafts.doc(d.draftId);
    await db.runTransaction(async tx => {
      const old = await tx.get(ref);
      if (old.exists && old.get('classId') !== d.classId) throw new HttpsError('permission-denied', 'Choose a different plan.');
      if ((old.get('version') ?? 0) !== d.version) throw new HttpsError('aborted', 'This plan changed in another window. Reopen it before saving. Your edits are still here.');
      tx.set(ref, { classId: d.classId, brief, plan: d.plan, version: d.version + 1, updatedAt: Timestamp.now(), reviewStatus: 'teacher-review-required' });
    });
    return { version: d.version + 1 };
  }
  if (!['outline', 'plan'].includes(d.action) || !id(d.requestId)) fail('Choose a generation action.');
  if (!model.value()) throw new HttpsError('failed-precondition', 'Choose a model on the server before enabling generation.');
  if (d.action === 'plan') {
    if (d.approved !== true) fail('Review and approve the outline first.');
    try { checkSequence(validate(outlineSchema, d.outline), brief.duration); } catch (e) { fail(e.message); }
  }
  const payload = { brief, ...(d.action === 'plan' ? { approvedOutline: d.outline } : {}) };
  if (JSON.stringify(payload).length > 30000) fail('Shorten the brief or outline.');
  const fingerprint = createHash('sha256').update(JSON.stringify({ classId: d.classId, action: d.action, payload })).digest('hex');
  const job = db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`);
  const day = new Date().toISOString().slice(0, 10), quota = db.doc(`aiPrivate/${uid}/usage/${day}`), globalQuota = db.doc(`aiUsage/${day}`);
  const existing = await db.runTransaction(async tx => {
    const [j, q, g] = await Promise.all([tx.get(job), tx.get(quota), tx.get(globalQuota)]);
    if (j.exists) {
      if (j.get('fingerprint') !== fingerprint) fail('Use a new request for a changed brief.');
      if (j.get('status') === 'completed') return j.get('result');
      throw new HttpsError('failed-precondition', j.get('status') === 'running' ? 'This request is still running. Retry shortly with the same request.' : 'This request did not finish. Start a new generation.');
    }
    // Reserve both passes before calling the provider; failed calls still consume allowance.
    const units = d.action === 'plan' ? 2 : 1;
    if ((q.get('calls') ?? 0) + units > 12 || (g.get('calls') ?? 0) + units > 120) throw new HttpsError('resource-exhausted', 'The daily pilot allowance has been reached. Try again tomorrow.');
    tx.set(quota, { calls: (q.get('calls') ?? 0) + units });
    tx.set(globalQuota, { calls: (g.get('calls') ?? 0) + units });
    tx.create(job, { status: 'running', fingerprint, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
    return null;
  });
  if (existing) return existing;
  try {
    const first = await generate({ apiKey: key.value(), model: model.value(), schema: d.action === 'outline' ? outlineSchema : planSchema, name: d.action, input: payload });
    checkSequence(first.value, brief.duration);
    if (d.action === 'plan' && JSON.stringify(first.value.stages.map(s => [s.id, s.minutes])) !== JSON.stringify(d.outline.stages.map(s => [s.id, s.minutes]))) throw Error('The plan changed the approved sequence.');
    let result = { [d.action]: first.value, usage: [first.usage] };
    if (d.action === 'plan') {
      const review = await generate({ apiKey: key.value(), model: model.value(), schema: reviewSchema, name: 'review', input: { brief, plan: first.value },
        instructions: `${teachingInstructions}\nReview the supplied plan, with one scored check for each of these 11 criteria: ${criteria}. Cite specific evidence. Mark incorrect language, unsolvable tasks, wrong keys and inaccessible instructions as critical errors. This is advisory AI review, not human approval.` });
      result = { ...result, review: review.value, usage: [...result.usage, review.usage] };
    }
    await job.update({ status: 'completed', model: model.value(), result });
    return result;
  } catch {
    await job.update({ status: 'failed' });
    throw new HttpsError('unavailable', 'We couldn’t finish this generation. Your existing work is still here. Start a new generation to try again.');
  }
});
