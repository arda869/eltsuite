import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const id = value => typeof value === 'string' && /^[\w-]{1,150}$/.test(value);
const denied = () => new HttpsError('permission-denied', 'This script is not available here.');
const priority = { none: 0, after: 1, button: 2, karaoke: 2 };

// A recording can occur more than once in a task. The strictest placement wins so
// one permissive copy cannot expose a Hidden or After listening copy in that task.
export function savedMediaMode(content, mediaId) {
  const modes = [];
  const visit = node => {
    if (['media', 'inlineMedia'].includes(node?.type) && node.attrs?.media === mediaId) {
      const mode = node.attrs?.scriptMode || (node.type === 'inlineMedia' ? 'none' : 'karaoke');
      modes.push(Object.hasOwn(priority, mode) ? mode : 'none');
    }
    if (Array.isArray(node?.content)) node.content.forEach(visit);
  };
  visit(content);
  return modes.sort((a, b) => priority[a] - priority[b])[0] || null;
}

export async function issueMediaQrGrantForTeacher(db, auth, input) {
  const {classId,itemId,taskId,mediaId}=input||{};
  if (![classId,itemId,taskId,mediaId].every(id)) throw new HttpsError('invalid-argument','Choose a recording in a task.');
  if(!auth?.uid||auth.token?.proxyBy)throw denied();
  const cls=db.doc(`classes/${classId}`),itemRef=cls.collection('items').doc(itemId),taskRef=itemRef.collection('tasks').doc(taskId);
  const [classSnap,itemSnap,taskSnap,accountSnap]=await Promise.all([cls.get(),itemRef.get(),taskRef.get(),db.doc(`accounts/${auth.uid}`).get()]);
  if(accountSnap.get('suspended')===true)throw denied();
  if(!classSnap.exists||!itemSnap.exists||!taskSnap.exists||classSnap.get('status')==='deleted')throw denied();
  const coRole=classSnap.get('coTeachers')?.[auth.uid]?.role;
  if(classSnap.get('teacherId')!==auth.uid&&coRole!=='co')throw denied();
  const task=taskSnap.data(),content=task.restricted?(await taskRef.collection('private').doc('body').get()).get('content'):task.content;
  // A teacher may print before showing the task. The access callable checks
  // this placement's current visibility when a learner scans the QR code.
  if(task.kind==='section'||!savedMediaMode(content,mediaId))throw denied();
  const key=[classId,itemId,taskId,mediaId].join('/');
  const grants=db.collection('mediaQrGrants');
  const old=await grants.where('key','==',key).limit(1).get();
  if(!old.empty)return {grant:old.docs[0].id};
  const ref=grants.doc();
  await ref.set({key,classId,itemId,taskId,mediaId,createdAt:new Date()});
  return {grant:ref.id};
}

export async function accessMediaScript(db, auth, input, now = Date.now()) {
  const { classId, itemId, taskId, mediaId, action = 'read', session = '', grant = '' } = input || {};
  if (![classId, itemId, taskId, mediaId].every(id) || !['read', 'start'].includes(action) || (session && !id(session)) || (grant && !id(grant)))
    throw new HttpsError('invalid-argument', 'Choose a recording in a task.');
  if (auth?.token?.proxyBy) throw denied();
  const cls = db.doc(`classes/${classId}`);
  const itemRef = cls.collection('items').doc(itemId);
  const taskRef = itemRef.collection('tasks').doc(taskId);
  const [classSnap, itemSnap, taskSnap, memberSnap, accountSnap] = await Promise.all([
    cls.get(), itemRef.get(), taskRef.get(), auth?.uid ? cls.collection('members').doc(auth.uid).get() : null,
    auth?.uid ? db.doc(`accounts/${auth.uid}`).get() : null,
  ]);
  if(accountSnap?.get('suspended')===true)throw denied();
  if (!classSnap.exists || !itemSnap.exists || !taskSnap.exists || classSnap.get('status') === 'deleted') throw denied();
  const coRole = classSnap.get('coTeachers')?.[auth?.uid]?.role;
  const teacher = !!auth?.uid && (classSnap.get('teacherId') === auth.uid || coRole === 'co');
  if (!teacher && !memberSnap?.exists) {
    if (!grant) throw denied();
    const qr = await db.doc(`mediaQrGrants/${grant}`).get();
    if (!qr.exists || qr.get('classId') !== classId || qr.get('itemId') !== itemId
        || qr.get('taskId') !== taskId || qr.get('mediaId') !== mediaId) throw denied();
  }
  const item = itemSnap.data(), task = taskSnap.data();
  if (!teacher && (item.hidden || item.locked || task.hidden || task.locked || task.kind === 'section'
      || task.restricted && (!memberSnap?.exists || !(task.allowed ?? []).includes(memberSnap.get('learnerId'))))) throw denied();
  if (!teacher && !memberSnap?.exists && task.restricted) throw denied();
  const content = task.restricted ? (await taskRef.collection('private').doc('body').get()).get('content') : task.content;
  const mode = savedMediaMode(content, mediaId);
  if (!mode) throw denied();
  if (!teacher && mode === 'none') return { mode, script: [] };
  const privateRef = cls.collection('mediaScripts').doc(mediaId);
  const script = (await privateRef.get()).get('script');
  if (!Array.isArray(script) || !script.length) return { mode, script: [] };
  if (teacher || mode !== 'after') return { mode, script };

  if (action === 'start') {
    const media = await cls.collection('media').doc(mediaId).get();
    if (!media.exists) throw denied();
    const seconds = Number(media.get('duration'));
    const waitMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(4 * 3600e3, Math.max(1000, Math.ceil(seconds * 1000))) : 30000;
    const token = randomUUID();
    await db.doc(`mediaScriptSessions/${token}`).set({ classId, itemId, taskId, mediaId, uid: auth?.uid || '', notBefore: now + waitMs, expiresAt: new Date(now + Math.max(waitMs + 3600e3, 2 * 3600e3)) });
    return { mode, session: token, waitMs };
  }
  if (!session) return { mode, script: [], waitMs: 0 };
  const saved = await db.doc(`mediaScriptSessions/${session}`).get();
  const expiresAt = saved.get('expiresAt');
  const expiresMs = expiresAt?.toMillis?.() ?? expiresAt?.getTime?.() ?? 0;
  if (!saved.exists || saved.get('classId') !== classId || saved.get('itemId') !== itemId
      || saved.get('taskId') !== taskId || saved.get('mediaId') !== mediaId || saved.get('uid') !== (auth?.uid || '')
      || expiresMs <= now) throw denied();
  const waitMs = Math.max(0, Number(saved.get('notBefore')) - now);
  return waitMs ? { mode, script: [], waitMs } : { mode, script };
}

export const mediaScriptAccess = onCall({ region: 'us-central1', maxInstances: 10 }, req =>
  accessMediaScript(getFirestore(), req.auth, req.data));

export const issueMediaScriptQr = onCall({region:'us-central1',maxInstances:10},req=>
  issueMediaQrGrantForTeacher(getFirestore(),req.auth,req.data));

// Firestore does not delete an expiresAt field by itself. Keep this bounded and
// independent of the optional project TTL policy.
export const clearMediaScriptSessions = onSchedule({schedule:'every 15 minutes',region:'us-central1',maxInstances:1},async()=>{
  const db=getFirestore();
  const expired=await db.collection('mediaScriptSessions').where('expiresAt','<=',new Date()).limit(400).get();
  if(expired.empty)return;
  const batch=db.batch();
  expired.docs.forEach(s=>batch.delete(s.ref));
  await batch.commit();
});
