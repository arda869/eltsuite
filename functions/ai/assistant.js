import { validateTrainingProfile, trainingActivitySchema, trainingInstructions, trainingActivityInstructions } from './training.js';
import { activitySchema, activityInstructions, checkActivities, nativeTask, nativeVersions } from './activities.js';
import { collectEvidence, classProfile } from './context.js';
import { isAbandonedJob } from './jobs.js';
import { warn } from 'firebase-functions/logger';
import { GenerationError, describeFailure } from './errors.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { canPlan, validateBrief, validate, checkSequence, outlineSchema, planSchema, reviewSchema } from './contract.js';
import { generate, teachingInstructions } from './provider.js';
import { checkModel, isPilotTeacher, reserveBudget, settleBudget } from './budget.js';

const key = defineSecret('OPENAI_API_KEY');
const model = defineString('ELT_AI_MODEL', { default: '' });
const enabled = defineString('ELT_AI_ENABLED', { default: 'false' });
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const fail = message => { throw new HttpsError('invalid-argument', message); };
const criteria = 'objectives and evidence; coherence; level and context; linguistic accuracy; meaningful communication; scaffolding and differentiation; timing and feasibility; instructions and interaction; assessment and feedback; accessibility and inclusion; teacher notes and keys';

export const lessonAssistant = onCall({ region: 'us-central1', secrets: [key], maxInstances: 2, concurrency: 4, timeoutSeconds: 420 }, async req => {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  const db = getFirestore(), uid = req.auth.uid, d = req.data ?? {};
  if (!id(d.classId)) fail('Choose a class.');
  const [profile, account, cls, pilot] = await Promise.all([
    db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get(), db.doc(`classes/${d.classId}`).get(), db.doc(`aiPilot/${uid}`).get(),
  ]);
  if (!canPlan(uid, profile.data(), account.data(), cls.data())) throw new HttpsError('permission-denied', 'You need teaching access to this class.');
  if (enabled.value() !== 'true' || !isPilotTeacher(pilot.get('enabled'))) throw new HttpsError('failed-precondition', 'The lesson assistant is not enabled for this account yet.');
  if (d.action === 'context') return { classContext: { name: cls.get('name'), level: cls.get('level'), kind: cls.get('kind') ?? 'language', trainingProfile:cls.get('trainingProfile') ?? null, profile: cls.get('learningProfile') ?? null }, evidence: await collectEvidence(db,d.classId) };
  if (d.action === 'profile') {
    if(cls.get('kind')==='training') {
      let profile;try{profile=validateTrainingProfile(d.trainingProfile);}catch(e){fail(e.message);}
      await cls.ref.update({trainingProfile:profile,level:profile.programme});return {profileSaved:true};
    }
    let profile; try { profile=classProfile(d.profile); } catch(e) { fail(e.message); }
    if (!['A1','A2','B1','B2','C1','C2','Mixed'].includes(d.level)) fail('Choose a level.');
    await cls.ref.update({level:d.level,learningProfile:profile});
    return { profileSaved:true };
  }
  if (d.action === 'create') {
    if (!id(d.sourceRequestId)) fail('Prepare activities first.');
    const source=db.doc(`aiPrivate/${uid}/jobs/${d.sourceRequestId}`);
    const itemId='ai_'+createHash('sha256').update(uid+':'+d.sourceRequestId).digest('hex').slice(0,32);
    const item=cls.ref.collection('items').doc(itemId);
    await db.runTransaction(async tx => {
      const [j,old,c,p,a,g,last]=await Promise.all([tx.get(source),tx.get(item),tx.get(cls.ref),tx.get(profile.ref),tx.get(account.ref),tx.get(pilot.ref),tx.get(cls.ref.collection('items').orderBy('order','desc').limit(1))]);
      if (!canPlan(uid,p.data(),a.data(),c.data()) || !isPilotTeacher(g.get('enabled'))) throw new HttpsError('permission-denied','Your teaching access changed.');
      if (old.exists) return;
      if (j.get('status') !== 'completed' || j.get('action') !== 'activities' || j.get('classId') !== d.classId) fail('Prepare activities again.');
      const activities=j.get('result.activities'), plan=j.get('sourcePlan'), type=j.get('creationType') ?? 'lesson';
      checkActivities(activities,plan,c.get('kind')==='training');
      tx.create(item,{type,speakingFocus:[plan.mainAim,plan.subsidiaryAims].filter(Boolean).join(' ').slice(0,1000),title:activities.title,topicId:null,order:(last.docs[0]?.get('order') ?? -1)+1,hidden:true,locked:false,taskCount:activities.tasks.length,createdAt:Timestamp.now(),...(type==='exam'?{exam:{minutes:j.get('duration')},examReleased:false}:{})});
      activities.tasks.forEach((task,i)=>{
        const ref=item.collection('tasks').doc('activity_'+i), native=nativeTask(task,i);
        const versions=nativeVersions(task,i,d.createVariants===true,type);
        for (const {suffix,label,instructions,native:version} of versions) {
          const v=item.collection('tasks').doc('activity_'+i+'_'+suffix);
          tx.create(v,{kind:'task',title:task.title,instructions,content:null,restricted:true,allowed:[],family:ref.id,variant:label,order:i,hidden:false,locked:false,createdAt:Timestamp.now()});
          tx.create(v.collection('private').doc('body'),{content:version.content});
          tx.create(v.collection('private').doc('key'),version.key);
          tx.create(v.collection('private').doc('notes'),{text:version.notes,updatedAt:Timestamp.now()});
        }
        tx.create(ref,{...(versions.length?{family:ref.id,variant:'Standard',variants:versions.map(({suffix})=>'activity_'+i+'_'+suffix),dist:{mode:'same',sameId:ref.id}}:{}),kind:'task',title:task.title,instructions:task.instructions,content:native.content,order:i,hidden:false,locked:false,afterCheck:type==='exam'?'reveal':'retry',createdAt:Timestamp.now()});
        tx.create(ref.collection('private').doc('key'),native.key);
        tx.create(ref.collection('private').doc('notes'),{text:[i===0?Object.entries({'Main aim':plan.mainAim,'Language analysis':plan.languageAnalysis,Assessment:plan.assessment,Differentiation:activities.differentiation,Recycling:activities.recycling}).map(([label,text])=>label.toUpperCase()+'\n'+text).join('\n\n'):'',native.notes].filter(Boolean).join('\n\n'),updatedAt:Timestamp.now()});
      });
      tx.update(source,{createdItemId:itemId});
    });
    return {createdItemId:itemId};
  }
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
  try { brief = validateBrief(d.brief,cls.get('kind')==='training'); } catch (e) { fail(e.message); }
  if (d.action === 'save') {
    if (!id(d.draftId) || !Number.isInteger(d.version) || d.version < 0) fail('Choose a plan version.');
    try { checkSequence(validate(planSchema, d.plan), brief.duration); } catch (e) { fail(e.message); }
    if (JSON.stringify(d.plan).length > 180000) fail('This plan is too long.');
    const ref = drafts.doc(d.draftId);
    await db.runTransaction(async tx => {
      const old = await tx.get(ref);
      if (old.exists && old.get('classId') !== d.classId) throw new HttpsError('permission-denied', 'Choose a different plan.');
      if ((old.get('version') ?? 0) !== d.version) throw new HttpsError('aborted', 'This plan changed in another window. Reopen it before saving. Your edits are still here.');
      tx.set(ref, { classId: d.classId, creationType:['lesson','exam','homework','practice'].includes(d.creationType)?d.creationType:'lesson', brief, plan: d.plan, version: d.version + 1, updatedAt: Timestamp.now(), reviewStatus: 'teacher-review-required' });
    });
    return { version: d.version + 1 };
  }
  if (!['outline', 'plan', 'activities'].includes(d.action) || !id(d.requestId)) fail('Choose a generation action.');
  if (!model.value()) throw new HttpsError('failed-precondition', 'Choose a model on the server before enabling generation.');
  try { checkModel(model.value()); } catch (e) { throw new HttpsError('failed-precondition', e.message); }
  if (d.action === 'plan') {
    if (d.approved !== true) fail('Review and approve the outline first.');
    try { checkSequence(validate(outlineSchema, d.outline), brief.duration); } catch (e) { fail(e.message); }
  }
  const creationType=['lesson','exam','homework','practice'].includes(d.creationType) ? d.creationType : 'lesson';
  if (d.action === 'activities') { try { checkSequence(validate(planSchema,d.plan),brief.duration); } catch(e) { fail(e.message); } }
  const evidence=d.useEvidence===true?await collectEvidence(db,d.classId):null;
  const payload = { brief, creationType, classProfile:cls.get('kind')==='training'?null:cls.get('learningProfile') ?? null, trainingProfile:cls.get('kind')==='training'?(cls.get('trainingProfile') ?? {programme:cls.get('level'),experience:'Unspecified',goals:brief.objectives}):null, evidence, ...(d.action==='activities'?{approvedPlan:d.plan}:{}), ...(d.action === 'plan' ? { approvedOutline: d.outline } : {}) };
  if (JSON.stringify(payload).length > 75000) fail('Shorten the brief or outline.');
  const fingerprint = createHash('sha256').update(JSON.stringify({ classId: d.classId, action: d.action, brief, creationType, useEvidence:d.useEvidence===true, ...(d.action==='plan'?{outline:d.outline}:{}), ...(d.action==='activities'?{plan:d.plan}:{}) })).digest('hex');
  const job = db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`);
  const day = new Date().toISOString().slice(0, 10), quota = db.doc(`aiPrivate/${uid}/usage/${day}`), globalQuota = db.doc(`aiUsage/${day}`);
  const month = day.slice(0, 7), budget = db.doc(`aiBudgets/${month}`);
  const units = d.action === 'plan' ? 2 : 1;
  const existing = await db.runTransaction(async tx => {
    const [j, q, g, b] = await Promise.all([tx.get(job), tx.get(quota), tx.get(globalQuota), tx.get(budget)]);
    if (j.exists) {
      if (j.get('fingerprint') !== fingerprint) fail('Use a new request for a changed brief.');
      if (j.get('status') === 'completed') return { kind: 'completed', result: j.get('result') };
      if (isAbandonedJob(j.get('status'), j.get('createdAt')?.toMillis?.())) {
        // Return instead of throwing here so Firestore commits the status change.
        // Leave all money and daily reservations untouched: prior usage is unknown.
        tx.update(job, { status: 'failed', failure: { reason: 'interrupted', phase: 'unknown' } });
        return { kind: 'abandoned' };
      }
      throw new HttpsError('failed-precondition', j.get('status') === 'running' ? 'This request is still running. Retry shortly with the same request.' : 'This request did not finish. Start a new generation.');
    }
    // Reserve both passes before calling the provider; failed calls still consume allowance.
    if ((q.get('calls') ?? 0) + units > 12 || (g.get('calls') ?? 0) + units > 120) throw new HttpsError('resource-exhausted', 'The daily pilot allowance has been reached. Try again tomorrow.');
    let reservation;
    try { reservation = reserveBudget(b.get('committedMicroUsd') ?? 0, units); }
    catch (e) { throw new HttpsError('resource-exhausted', e.message); }
    tx.set(budget, { committedMicroUsd: reservation.balance, limitMicroUsd: 20_000_000, month }, { merge: true });
    tx.set(quota, { calls: (q.get('calls') ?? 0) + units });
    tx.set(globalQuota, { calls: (g.get('calls') ?? 0) + units });
    tx.create(job, { status: 'running', fingerprint, classId:d.classId, action:d.action, creationType, duration:brief.duration, ...(d.action==='activities'?{sourcePlan:d.plan}:{}), budgetMonth: month, reservedMicroUsd: reservation.reserved, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
    return null;
  });
  if (existing?.kind === 'completed') return existing.result;
  if (existing?.kind === 'abandoned') throw new HttpsError('failed-precondition', 'The previous request exceeded its execution window and has been released. Your brief and outline are unchanged. Start a new generation by clicking the generation button again. [request:interrupted]');
  let phase = d.action;
  try {
    const first = await generate({ apiKey: key.value(), model: model.value(), schema: d.action === 'outline' ? outlineSchema : d.action === 'activities' ? (cls.get('kind')==='training'?trainingActivitySchema:activitySchema) : planSchema, name: d.action, input: payload, instructions: d.action === 'activities' ? activityInstructions + (cls.get('kind')==='training'?trainingInstructions+trainingActivityInstructions:'') : (cls.get('kind')==='training'?trainingInstructions:teachingInstructions) + '\nCreation type is authoritative: for exams use assessment stages and marking criteria, for homework/practice use independent instructions. Use class profile and evidence when supplied; never invent evidence. Keep outlines concise.' });
    try { if(d.action==='activities') checkActivities(first.value,d.plan,cls.get('kind')==='training'); else checkSequence(first.value, brief.duration); } catch { throw new GenerationError('sequence'); }
    if (d.action === 'plan' && JSON.stringify(first.value.stages.map(s => [s.id, s.minutes])) !== JSON.stringify(d.outline.stages.map(s => [s.id, s.minutes]))) throw new GenerationError('sequence');
    let result = { [d.action]: first.value, usage: [first.usage] };
    if (d.action === 'plan') {
      phase = 'review';
      const review = await generate({ apiKey: key.value(), model: model.value(), schema: reviewSchema, name: 'review', input: { brief, plan: first.value },
        instructions: `${cls.get('kind')==='training'?trainingInstructions:teachingInstructions}\nReview the supplied plan, with one scored check for each of these 11 criteria: ${criteria}. Cite specific evidence. Mark incorrect language, unsolvable tasks, wrong keys, missing referenced media, premature answer disclosure and inaccessible instructions as critical errors. Scrutinise learner-facing wording, receptive-skills sequencing, discovery before explanation, purposeful visual support, and whether differentiation changes the task rather than adding more work. This is advisory AI review, not human approval.` });
      result = { ...result, review: review.value, usage: [...result.usage, review.usage] };
    }
    phase = 'storage';
    await db.runTransaction(async tx => {
      const [b, j] = await Promise.all([tx.get(budget), tx.get(job)]);
      if (j.get('status') !== 'running') throw Error('This job was already settled.');
      const settled = settleBudget(b.get('committedMicroUsd'), j.get('reservedMicroUsd'), result.usage);
      tx.update(budget, { committedMicroUsd: settled.balance });
      tx.update(job, { status: 'completed', model: model.value(), costMicroUsd: settled.cost, result });
    });
    return result;
  } catch (error) {
    const failure = describeFailure(phase === 'storage' ? new GenerationError('storage') : error, phase);
    warn('lessonAssistant generation failed', { reason: failure.reason, phase: failure.phase });
    try {
      await db.runTransaction(async tx => {
        const j = await tx.get(job);
        if (j.get('status') === 'running') tx.update(job, { status: 'failed', failure: { reason: failure.reason, phase: failure.phase } });
      });
    } catch { warn('lessonAssistant failure status could not be saved'); }
    throw new HttpsError('unavailable', failure.message, { reason: failure.reason, phase: failure.phase });
  }
});
