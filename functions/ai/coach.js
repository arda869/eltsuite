import { usageContext, chargeFeature } from './feature-usage.js';
import { dailyGlobalUsage } from './allowance.js';
import { contextPermissions, profileComplete, beliefsComplete, relevantWriting, writingExcerpt } from './coach-context.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { canCoach, coachInstructions, coachRequest, coachReplySchema, dialogueFramework } from './coach-contract.js';
import { generate } from './provider.js';
import { checkModel, reserveBudget, settleBudget } from './budget.js';

export async function teachingCoach(req, { apiKey, model, enabled }) {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  let input; try { input = coachRequest(req.data); } catch (e) { throw new HttpsError('invalid-argument', e.message); }
  const db = getFirestore(), uid = req.auth.uid;
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get()]);
  if (!canCoach(req.auth, profile.data(), account.data())) throw new HttpsError('permission-denied', 'Sign in with an active teacher account.');
  if (enabled !== 'true') throw new HttpsError('failed-precondition', 'AI conversations are temporarily unavailable. You can still use your journal and inquiries.');
  try { checkModel(model); } catch(e) { throw new HttpsError('failed-precondition', e.message); }
  const [professional, preferences] = await Promise.all([
    db.doc(`teachingCoach/${uid}/settings/profile`).get(), db.doc(`teachingCoach/${uid}/settings/context`).get(),
  ]);
  if (!profileComplete(professional.data())) throw new HttpsError('failed-precondition', 'Complete your teaching profile before starting a coaching conversation.');
  if (!beliefsComplete(professional.data())) throw new HttpsError('failed-precondition', 'Add your teaching beliefs before starting a coaching conversation.');
  const preferencesData = preferences.data();
  const permissions = contextPermissions(preferencesData);
  if (['Reflect with me','Challenge my thinking','Help me experiment','Teacher trainer mode'].includes(preferencesData?.mode)) input.mode = preferencesData.mode;
  const context = {}, basis = [];
  if (input.useProfile && permissions.profile) {
    context.profile = Object.fromEntries(['qualifications','experience','roles','context','goals'].map(k => [k, typeof professional.get(k) === 'string' ? professional.get(k).slice(0,3000) : professional.get(k) ?? '']));
    basis.push('Your professional profile');
  }
  if (input.useBeliefs && permissions.beliefs && professional.get('beliefs')) { context.beliefs = String(professional.get('beliefs')).slice(0,4000); basis.push('Your teaching beliefs'); }
  for (const [field, kind] of [['entryId', 'reflections'], ['researchId', 'inquiries']]) {
    if (!permissions[kind]) continue;
    if (input.contextVersion === 2) {
      const recent = await db.collection(`teachingCoach/${uid}/${kind}`).orderBy('at', 'desc').limit(40).get();
      const rows = recent.docs.map(d => ({ ...d.data(), id: d.id }));
      if (input[field] && !rows.some(r => r.id === input[field])) {
        const selected = await db.doc(`teachingCoach/${uid}/${kind}/${input[field]}`).get();
        if (selected.exists) rows.push({ ...selected.data(), id: selected.id });
      }
      const selected = relevantWriting(rows, input.prompt, kind === 'reflections' ? 3 : 2, input[field]);
      if (selected.length) context[kind] = selected.map(row => writingExcerpt(row, kind));
      selected.forEach(row => basis.push(`${kind === 'reflections' ? 'Reflection' : 'Inquiry'}: ${String(row.title ?? 'Untitled').slice(0,200)}`));
    } else if (input[field]) {
      const snap = await db.doc(`teachingCoach/${uid}/${kind}/${input[field]}`).get();
      if (!snap.exists) throw new HttpsError('not-found', 'The selected writing is no longer available.');
      context[kind] = writingExcerpt(snap.data(), kind);
      basis.push(`${kind === 'reflections' ? 'Reflection' : 'Inquiry'}: ${snap.get('title')}`);
    }
  }
  // Use bounded excerpts, and keep recent conversation turns within the provider envelope.
  const shorten = (value, size) => typeof value === 'string' ? value.slice(0,size) : Array.isArray(value) ? value.map(v => shorten(v,size)) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,shorten(v,size)])) : value;
  let bounded = context;
  for (const size of [900,450,220,100]) if (Buffer.byteLength(JSON.stringify(bounded),'utf8') > 22000) bounded = shorten(context,size);
  const payload = { mode: input.mode, prompt: input.prompt, history: [...input.history], context: bounded };
  while (Buffer.byteLength(JSON.stringify(payload),'utf8') > 64000 && payload.history.length) payload.history.splice(0,2);
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 65000) throw new HttpsError('invalid-argument', 'Choose less context or shorten this conversation. Your writing is still here.');
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const day = new Date().toISOString().slice(0,10), month = day.slice(0,7);
  const usagePolicy = await usageContext(db,req.auth);
  const job = db.doc(`aiPrivate/${uid}/jobs/coach_${req.data.requestId}`), quota = db.doc(`aiPrivate/${uid}/usage/${day}`), global = db.doc(`aiUsage/${day}`), budget = db.doc(`${usagePolicy.isAdmin ? 'aiAdminBudgets' : 'aiBudgets'}/${month}`);
  const generationAdmin = usagePolicy.isAdmin;
  const existing = await db.runTransaction(async tx => {
    const [j,q,g,b] = await Promise.all([tx.get(job),tx.get(quota),tx.get(global),tx.get(budget)]);
    if (j.exists) {
      if (j.get('fingerprint') !== fingerprint) throw new HttpsError('invalid-argument', 'The question or selected context changed. Clear the conversation and try again.');
      if (j.get('expiresAt')?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This response has expired. Clear the conversation and start again.');
      if (j.get('status') === 'completed') return j.get('result');
      throw new HttpsError('failed-precondition', j.get('status') === 'running' ? 'This response is still running. Retry shortly. If it remains unavailable, clear the conversation and start again.' : 'This response could not finish. Clear the conversation and try again.');
    }
    await chargeFeature(tx,db,usagePolicy,'coach');
    let reservation; try { reservation = reserveBudget(b.get('committedMicroUsd') ?? 0, 1, usagePolicy.isAdmin); } catch(e) { throw new HttpsError('resource-exhausted', e.message); }
    tx.set(budget, { committedMicroUsd: reservation.balance, month, limitMicroUsd: 20_000_000 }, { merge: true });
    tx.set(quota, { calls: (q.get('calls') ?? 0)+1 }); tx.set(global, dailyGlobalUsage(g.data(),1,generationAdmin), {merge:true});
    tx.create(job, { action: 'coach', status: 'running', fingerprint, reservedMicroUsd: reservation.reserved, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now()+86400000) });
    return null;
  });
  if (existing) return existing;
  try {
    const generated = await generate({ apiKey, model, schema: coachReplySchema, name: 'teaching_coach', input: payload, instructions: coachInstructions + '\n' + dialogueFramework });
    const result = { reply: generated.value.reply, journalDraft: generated.value.journalDraft ?? null, basis };
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
