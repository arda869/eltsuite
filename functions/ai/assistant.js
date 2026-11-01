import { stageContract, allocateMinutes } from './sequence.js';
import { generateChecked } from './recovery.js';
import { mediaRequests, mediaInstructions } from './media-contract.js';
import { collectMemories, selectedMemories } from './memories.js';
import { contentReviewStandard } from './pedagogy.js';
import { isGenerationAdmin, dailyAllowanceReached, dailyGlobalUsage } from './allowance.js';
import { encodeGenerationResult, readGenerationResult } from './storage.js';
import { teachingCoach } from './coach.js';
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
  if (req.data?.action === 'coach') return teachingCoach(req, { apiKey: key.value(), model: model.value(), enabled: enabled.value() });
  const db = getFirestore(), uid = req.auth.uid, d = req.data ?? {};
  if (!id(d.classId)) fail('Choose a class.');
  const [profile, account, cls, pilot] = await Promise.all([
    db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get(), db.doc(`classes/${d.classId}`).get(), db.doc(`aiPilot/${uid}`).get(),
  ]);
  if (!canPlan(uid, profile.data(), account.data(), cls.data())) throw new HttpsError('permission-denied', 'You need teaching access to this class.');
  if (enabled.value() !== 'true' || !isPilotTeacher(pilot.get('enabled'))) throw new HttpsError('failed-precondition', 'The lesson assistant is not enabled for this account yet.');
  if (d.action === 'memories') return {memories: await collectMemories(db,d.classId)};
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
  if (d.action === 'mediaStatus' || d.action === 'retryMedia' || d.action === 'resumeActivities') {
    if(!id(d.sourceRequestId)) fail('Choose prepared activities.');
    const job=db.doc(`aiPrivate/${uid}/jobs/${d.sourceRequestId}`),j=await job.get();
    if(j.get('classId')!==d.classId||j.get('action')!=='activities'||j.get('status')!=='completed')fail('Prepare activities first.');
    if(d.action==='retryMedia'){
      if(!id(d.assetId))fail('Choose an asset.');
      await db.runTransaction(async tx=>{const ref=job.collection('media').doc(d.assetId),asset=await tx.get(ref);
        const stale=['running','queued'].includes(asset.get('status'))&&Date.now()-((asset.get('startedAt')??asset.get('createdAt'))?.toMillis()??Date.now())>600000;
        if(asset.get('status')!=='failed'&&!stale)fail('This asset is already prepared or still running.');
        tx.update(ref,{status:'queued',error:''});
      });
    }
    const media=await job.collection('media').get();
    return {...(d.action==='resumeActivities'?{activities:readGenerationResult(j.data()).activities,plan:j.get('sourcePlan'),brief:j.get('brief')??null,createdItemId:j.get('createdItemId')??''}:{}),media:media.docs.map(m=>({id:m.id,kind:m.get('kind'),title:m.get('title'),status:['running','queued'].includes(m.get('status'))&&Date.now()-((m.get('startedAt')??m.get('createdAt'))?.toMillis()??Date.now())>600000?'failed':m.get('status'),completedLines:m.get('completedLines')??0,totalLines:m.get('lines')?.length??0,error:m.get('error')||'Preparation was interrupted. Retry this asset.',mediaId:m.get('mediaId')??''}))};
  }
  if (d.action === 'create') {
    if (!id(d.sourceRequestId)) fail('Prepare activities first.');
    const source=db.doc(`aiPrivate/${uid}/jobs/${d.sourceRequestId}`);
    const itemId='ai_'+createHash('sha256').update(uid+':'+d.sourceRequestId).digest('hex').slice(0,32);
    const item=cls.ref.collection('items').doc(itemId);
    await db.runTransaction(async tx => {
      const [j,old,c,p,a,g,last,media]=await Promise.all([tx.get(source),tx.get(item),tx.get(cls.ref),tx.get(profile.ref),tx.get(account.ref),tx.get(pilot.ref),tx.get(cls.ref.collection('items').orderBy('order','desc').limit(1)),tx.get(source.collection('media'))]);
      if (!canPlan(uid,p.data(),a.data(),c.data()) || !isPilotTeacher(g.get('enabled'))) throw new HttpsError('permission-denied','Your teaching access changed.');
      if (old.exists) return;
      if (j.get('status') !== 'completed' || j.get('action') !== 'activities' || j.get('classId') !== d.classId) fail('Prepare activities again.');
      const activities=readGenerationResult(j.data())?.activities, plan=j.get('sourcePlan'), type=j.get('creationType') ?? 'lesson';
      checkActivities(activities,plan,c.get('kind')==='training');
      const requests=mediaRequests(activities);
      if(requests.some(r=>!media.docs.some(m=>m.id===r.id&&m.get('status')==='ready')))throw new HttpsError('failed-precondition','Finish preparing the lesson images and recordings before creating it.');
      activities.tasks.forEach((t,i)=>{t.preparedMedia=media.docs.filter(m=>m.get('taskIndex')===i).map(m=>({kind:m.get('kind'),title:m.get('title'),alt:m.get('alt'),mediaId:m.get('mediaId')}));});
      tx.create(item,{type,speakingFocus:[plan.mainAim,plan.subsidiaryAims].filter(Boolean).join(' ').slice(0,1000),title:activities.title,topicId:null,order:(last.docs[0]?.get('order') ?? -1)+1,hidden:true,locked:false,taskCount:activities.tasks.length,createdAt:Timestamp.now(),...(type==='exam'?{exam:{minutes:j.get('duration')},examReleased:false}:{})});
      activities.tasks.forEach((task,i)=>{
        const ref=item.collection('tasks').doc('activity_'+i), native=nativeTask(task,i);
        const versions=nativeVersions(task,i,d.createVariants===true,type);
        for (const {suffix,label,instructions,native:version} of versions) {
          const v=item.collection('tasks').doc('activity_'+i+'_'+suffix);
          tx.create(v,{kind:'task',layout:task.layout==='columns'?'two':'single',title:task.title,instructions,content:null,restricted:true,allowed:[],family:ref.id,variant:label,order:i,hidden:false,locked:false,createdAt:Timestamp.now()});
          tx.create(v.collection('private').doc('body'),{content:version.content});
          tx.create(v.collection('private').doc('key'),version.key);
          tx.create(v.collection('private').doc('notes'),{text:version.notes,updatedAt:Timestamp.now()});
        }
        tx.create(ref,{...(versions.length?{family:ref.id,variant:'Standard',variants:versions.map(({suffix})=>'activity_'+i+'_'+suffix),dist:{mode:'same',sameId:ref.id}}:{}),kind:'task',layout:task.layout==='columns'?'two':'single',title:task.title,instructions:task.instructions,content:native.content,order:i,hidden:false,locked:false,afterCheck:type==='exam'?'reveal':'retry',createdAt:Timestamp.now()});
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
  let learnerMemories; try { learnerMemories=await selectedMemories(db,d.classId,d.useLearnerMemories,d.memoryIds); } catch(e) { fail(e.message); }
  const payload = { brief, creationType, learnerMemories, classProfile:cls.get('kind')==='training'?null:cls.get('learningProfile') ?? null, trainingProfile:cls.get('kind')==='training'?(cls.get('trainingProfile') ?? {programme:cls.get('level'),experience:'Unspecified',goals:brief.objectives}):null, evidence, ...(d.action==='activities'?{approvedPlan:d.plan}:{}), ...(d.action === 'plan' ? { approvedOutline: d.outline } : {}) };
  if (JSON.stringify(payload).length > 75000) fail('Shorten the brief or outline.');
  const fingerprint = createHash('sha256').update(JSON.stringify({ classId: d.classId, action: d.action, brief, creationType, useEvidence:d.useEvidence===true, useLearnerMemories:d.useLearnerMemories===true, memoryIds:d.useLearnerMemories===true?d.memoryIds:[], ...(d.action==='plan'?{outline:d.outline}:{}), ...(d.action==='activities'?{plan:d.plan}:{}) })).digest('hex');
  const job = db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`);
  const day = new Date().toISOString().slice(0, 10), quota = db.doc(`aiPrivate/${uid}/usage/${day}`), globalQuota = db.doc(`aiUsage/${day}`);
  const month = day.slice(0, 7), budget = db.doc(`aiBudgets/${month}`);
  const units = d.action === 'plan' ? 2 : 1;
  const generationAdmin = await isGenerationAdmin(db,req.auth);
  const existing = await db.runTransaction(async tx => {
    const [j, q, g, b] = await Promise.all([tx.get(job), tx.get(quota), tx.get(globalQuota), tx.get(budget)]);
    if (j.exists) {
      if (j.get('fingerprint') !== fingerprint) fail('Use a new request for a changed brief.');
      if (j.get('status') === 'completed') return { kind: 'completed', result: readGenerationResult(j.data()) };
      if (isAbandonedJob(j.get('status'), j.get('createdAt')?.toMillis?.())) {
        // Return instead of throwing here so Firestore commits the status change.
        // Leave all money and daily reservations untouched: prior usage is unknown.
        tx.update(job, { status: 'failed', failure: { reason: 'interrupted', phase: 'unknown' } });
        return { kind: 'abandoned' };
      }
      throw new HttpsError('failed-precondition', j.get('status') === 'running' ? 'This request is still running. Retry shortly with the same request.' : 'This request did not finish. Start a new generation.');
    }
    // Reserve both passes before calling the provider; failed calls still consume allowance.
    if (dailyAllowanceReached(q.get('calls') ?? 0,g.get('calls') ?? 0,units,generationAdmin)) throw new HttpsError('resource-exhausted', 'The daily pilot allowance has been reached. Try again tomorrow.');
    let reservation;
    try { reservation = reserveBudget(b.get('committedMicroUsd') ?? 0, units); }
    catch (e) { throw new HttpsError('resource-exhausted', e.message); }
    tx.set(budget, { committedMicroUsd: reservation.balance, limitMicroUsd: 20_000_000, month }, { merge: true });
    tx.set(quota, { calls: (q.get('calls') ?? 0) + units });
    tx.set(globalQuota, dailyGlobalUsage(g.data(),units,generationAdmin), {merge:true});
    tx.create(job, { status: 'running', brief, fingerprint, classId:d.classId, action:d.action, creationType, duration:brief.duration, ...(d.action==='activities'?{sourcePlan:d.plan}:{}), budgetMonth: month, reservedMicroUsd: reservation.reserved, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
    return null;
  });
  if (existing?.kind === 'completed') return existing.result;
  if (existing?.kind === 'abandoned') throw new HttpsError('failed-precondition', 'The previous request exceeded its execution window and has been released. Your brief and outline are unchanged. Start a new generation by clicking the generation button again. [request:interrupted]');
  const generationDeadline=Date.now()+390000;
  let phase = d.action;
  try {
    const schema=d.action==='outline'?outlineSchema:d.action==='activities'?(cls.get('kind')==='training'?trainingActivitySchema:activitySchema):planSchema;
    const contract=stageContract(d.action,schema,d.action==='plan'?d.outline:d.plan);
    const first = await generateChecked({generate, args: { apiKey: key.value(), model: model.value(), schema: contract.schema, name: d.action, input: {...payload,...contract.input}, instructions: (d.action === 'activities' ? activityInstructions + (cls.get('kind')==='training'?trainingInstructions+trainingActivityInstructions:'') : (cls.get('kind')==='training'?trainingInstructions:teachingInstructions) + '\n' + mediaInstructions + '\nUse the main and additional learning objectives as priorities. Choose a suitable situation from the context; a topic is optional.\nCreation type is authoritative: for exams use assessment stages and marking criteria, for homework/practice use independent instructions. Use class profile and evidence when supplied; never invent evidence. Keep outlines concise.') + contract.instructions },
      decode: value => {
        const decoded=contract.decode(value);
        if(d.action==='outline' && decoded.stages.reduce((n,s)=>n+s.minutes,0)!==brief.duration) {
          const minutes=allocateMinutes(decoded.stages.map(s=>s.minutes),brief.duration);
          decoded.stages=decoded.stages.map((s,i)=>({...s,minutes:minutes[i]}));
        }
        return decoded;
      },
      check: value => {
        if(d.action==='activities') {
          checkActivities(value,d.plan,cls.get('kind')==='training');
          if(value.tasks.some(t=>t.format==='listening'&&!(t.mediaPlan??[]).some(m=>m.kind==='audio'))) throw Error('Every listening activity needs an audio mediaPlan matching its private script.');
        } else checkSequence(value,brief.duration);
      },
      reserveRepair: () => db.runTransaction(async tx => {
        const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]);
        if(j.get('status')!=='running') throw new GenerationError('content');
        const reservation=reserveBudget(b.get('committedMicroUsd')??0,1);
        tx.update(budget,{committedMicroUsd:reservation.balance});
        tx.update(job,{reservedMicroUsd:j.get('reservedMicroUsd')+reservation.reserved,repairing:true});
      })
    });
    let result = { [d.action]: first.value, usage: first.usage };
    if (d.action === 'plan') {
      phase = 'review';
      const review = await generate({ apiKey: key.value(), model: model.value(), schema: reviewSchema, timeoutMs: Math.max(1000,Math.min(180000,generationDeadline-Date.now())), name: 'review', input: { brief, creationType, learnerMemories: payload.learnerMemories, classProfile: payload.classProfile, trainingProfile: payload.trainingProfile, plan: first.value },
        instructions: `${cls.get('kind')==='training'?trainingInstructions:teachingInstructions}\nReview the supplied plan, with one scored check for each of these 11 criteria: ${criteria}. Cite specific evidence. This is a pre-media planning review: the application generates and saves specified images and recordings in the next activity stage, and blocks lesson creation until those assets are ready. A complete image specification or exact recording script is a planned dependency, not a missing-media critical error merely because its file has not been generated yet. Flag missing specifications, mismatched scripts, impossible visual requirements and references with no planned asset. Do not replace planned recordings with teacher-read input just because media preparation is pending. Never certify media quality without inspecting the finished asset. Mark incorrect language, unsolvable tasks, wrong keys, missing referenced media, premature answer disclosure and inaccessible instructions as critical errors. Scrutinise learner-facing wording, receptive-skills sequencing, discovery before explanation, purposeful visual support, and whether differentiation changes the task rather than adding more work. ${contentReviewStandard} This is advisory AI review, not human approval.` });
      result = { ...result, review: review.value, usage: [...result.usage, review.usage] };
    }
    phase = 'storage';
    await db.runTransaction(async tx => {
      const [b, j] = await Promise.all([tx.get(budget), tx.get(job)]);
      if (j.get('status') !== 'running') throw Error('This job was already settled.');
      const settled = settleBudget(b.get('committedMicroUsd'), j.get('reservedMicroUsd'), result.usage);
      tx.update(budget, { committedMicroUsd: settled.balance });
      if(d.action==='activities')for(const asset of mediaRequests(first.value))tx.create(job.collection('media').doc(asset.id),{...asset,classId:d.classId,status:'queued',createdAt:Timestamp.now()});
      tx.update(job, { status: 'completed', model: model.value(), costMicroUsd: settled.cost, ...encodeGenerationResult(result) });
    });
    return result;
  } catch (error) {
    const failure = describeFailure(phase === 'storage' ? new GenerationError('storage') : error, phase);
    warn('lessonAssistant generation failed', { reason: failure.reason, phase: failure.phase, ...(phase==='storage'?{storageCode:typeof error?.code==='number'||typeof error?.code==='string'?error.code:'unknown'}:{}) });
    try {
      await db.runTransaction(async tx => {
        const j = await tx.get(job);
        if (j.get('status') === 'running') tx.update(job, { status: 'failed', failure: { reason: failure.reason, phase: failure.phase } });
      });
    } catch { warn('lessonAssistant failure status could not be saved'); }
    throw new HttpsError('unavailable', failure.message, { reason: failure.reason, phase: failure.phase });
  }
});
