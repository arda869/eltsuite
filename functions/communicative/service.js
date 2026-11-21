import {projectPictures,readActivityPicture,rehomePictures} from './pictures.js';
import { compareVersions } from './comparison.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
const randomInt = (min, max) => { if (max === undefined) { max = min; min = 0; } const range = max - min, limit = Math.floor(4294967296 / range) * range, buffer = new Uint32Array(1); do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit); return min + buffer[0] % range; };
import { configFromNode, configForLearner, initialActivity, stateForLearner, transition, validateActivity, bingoCards, oppositePairs } from './engine.js';

const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(id);
const teacherOf = (c, uid) => c.teacherId === uid || c.coTeachers?.[uid]?.role === 'co';
const deny = () => new HttpsError('permission-denied', 'This activity is not available to you.');
const clone = value => JSON.parse(JSON.stringify(value));
const personalCommands = new Set(['answer','opinion','summary','found','mark','claim','agree']);
const changed = () => new HttpsError('aborted', 'The activity changed. Wait for the update, then try again.');


async function access(db, auth, data) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token?.proxyBy) throw deny();
  const { classId, itemId, taskId, activityId } = data;
  if (![classId, itemId, taskId, activityId].every(validId)) throw new HttpsError('invalid-argument', 'Choose an activity in a saved lesson.');
  const root = db.doc(`classes/${classId}`), itemRef = root.collection('items').doc(itemId), taskRef = itemRef.collection('tasks').doc(taskId);
  const [classSnap, item, task, member, account] = await Promise.all([root.get(), itemRef.get(), taskRef.get(), root.collection('members').doc(auth.uid).get(), db.doc(`accounts/${auth.uid}`).get()]);
  if (account.get('suspended') === true) throw deny();
  if (!classSnap.exists || !item.exists || !task.exists) throw deny();
  const teacher = teacherOf(classSnap.data(), auth.uid);
  const canOpenTask=!task.get('restricted') || (task.get('allowed') ?? []).includes(member.get('learnerId'));
  if (!teacher && (!member.exists || item.get('hidden') || item.get('locked') || task.get('hidden') || task.get('locked') || (!canOpenTask && data.op !== 'picture'))) throw deny();
  if (!teacher && (item.get('type') === 'exam' || task.get('exam'))) throw deny();
  return { root, taskRef, teacher, canOpenTask, context:{classId,itemId,taskId,activityId}, run: root.collection('activities').doc(`${taskId}_${activityId}`), uid: auth.uid };
}

function writeViews(tx, run, roomId, room, context) {
  // The canonical room is teacher-only. Each learner has a separate document;
  // no peer card or unrevealed opinion is present in its network payload.
  for (const p of room.state.people) tx.set(run.collection('views').doc(p.id), clone({
    roomId, roomName: room.name, config: projectPictures(configForLearner(room.config, room.state, p.id),context), state: stateForLearner(room.config, room.state, p.id),
    pending: false,
  }));
}

export async function runCommunicativeActivity(db, auth, data, now = Date.now()) {
  const a = await access(db, auth, data ?? {});
  const op = data.op ?? 'command';
  if(op==='picture')return readActivityPicture(db,a,data);
  if (['previewVersions','compareVersions','hideVersions'].includes(op)) return compareVersions(db,a,data);
  if (op === 'prepare') {
    if (!a.teacher) throw deny();
    const source = await a.taskRef.collection('private').doc('activities').get();
    const node = source.get('nodes')?.[data.activityId];
    if (!node) throw new HttpsError('failed-precondition', 'Save the activity before starting.');
    const config = await rehomePictures(db,a,configFromNode(node)), issues = validateActivity(config);
    if (issues.length) throw new HttpsError('failed-precondition', issues[0].message, { issues });
    if (new TextEncoder().encode(JSON.stringify(config)).length > 650000) throw new HttpsError('failed-precondition', 'The activity is too large to play live. Use uploaded pictures instead of pasted picture data.');
    const [roster, live] = await Promise.all([a.root.collection('learners').get(), a.root.collection('live').doc('state').get()]);
    const people = roster.docs.map(d => ({ id: d.get('authUid'), learnerId: d.id, name: String(d.get('displayName') || 'Learner') })).filter(p => validId(p.id));
    if (!people.length) throw new HttpsError('failed-precondition', 'Add learners to the class before starting.');
    if (people.length > 100) throw new HttpsError('failed-precondition', 'Use a class of up to 100 learners for this activity.');
    const groupSetId = data.groupSetId || live.get('groupSetId') || null;
    if (config.settings.turnOrderIds?.length) people.sort((x,y)=>{const order=config.settings.turnOrderIds,xi=order.indexOf(x.learnerId),yi=order.indexOf(y.learnerId);return (xi<0?order.length:xi)-(yi<0?order.length:yi);});
    if (config.settings.teamScoring) {
      if (!validId(groupSetId)) throw new HttpsError('failed-precondition','Choose the class groups to use as teams before starting.');
      const set=await a.root.collection('groupSets').doc(groupSetId).get(),teams=set.get('groups')??[];
      if (!teams.length || people.some(p=>!teams.some(g=>(g.members??[]).includes(p.learnerId)))) throw new HttpsError('failed-precondition','Put each learner in a team in Manage pairs and groups before starting.');
      config.settings.teamNames=Object.fromEntries(teams.map(g=>[g.id,g.name]));
      for (const p of people) p.teamId=teams.find(g=>(g.members??[]).includes(p.learnerId)).id;
    }
    let rooms;
    if (config.settings.mode === 'groups') {
      if (!validId(groupSetId)) throw new HttpsError('failed-precondition', 'Choose pairs or groups in Teach live before starting.');
      const set = await a.root.collection('groupSets').doc(groupSetId).get();
      if (!set.exists) throw new HttpsError('failed-precondition', 'Choose an available group set.');
      const used = new Set();
      rooms = (set.get('groups') ?? []).map(g => ({ id: g.id, name: g.name, people: people.filter(p => (g.members ?? []).includes(p.learnerId)).filter(p => { if (!p || used.has(p.id)) return false; used.add(p.id); return true; }) })).filter(g => g.people.length && validId(g.id));
      if (!rooms.length) throw new HttpsError('failed-precondition', 'Put learners into the groups before starting.');
    } else if (config.settings.mode === 'individual') rooms = people.map(p => ({ id: `solo-${p.learnerId}`, name: p.name, people: [p] }));
    else rooms = [{ id: 'class', name: 'Whole class', people }];
    const distributed = new Set(rooms.flatMap(r => r.people.map(p => p.id)));
    await db.runTransaction(async tx => {
      const existing = await tx.get(a.run);
      if (existing.exists && data.replace !== true) throw new HttpsError('already-exists', 'This activity has already started. Open its current run.');
      const oldRooms = existing.get('roomIds') ?? [];
      const oldSnapshots = oldRooms.length ? await tx.getAll(...oldRooms.map(id => a.run.collection('rooms').doc(id))) : [];
      for (const uid of new Set([...oldSnapshots.flatMap(s => (s.get('state.people') ?? []).map(p => p.id)), ...(existing.get('unassigned') ?? []).map(p => p.id)])) if (!people.some(p => p.id === uid)) tx.delete(a.run.collection('views').doc(uid));
      for (const roomId of oldRooms) if (!rooms.some(r => r.id === roomId)) tx.delete(a.run.collection('rooms').doc(roomId));
      for (const room of rooms) {
        let state = initialActivity(config, room.people);
        state = transition(config, state, { type: 'start' }, { id: a.uid, teacher: true }, now);
        const value = { name: room.name, config, state };
        tx.set(a.run.collection('rooms').doc(room.id), clone(value)); writeViews(tx, a.run, room.id, value,a.context);
      }
      for (const p of people.filter(p => !distributed.has(p.id))) tx.set(a.run.collection('views').doc(p.id), { pending: true, message: 'Your teacher will choose a group for you.' });
      tx.set(a.run, { itemId: data.itemId, taskId: data.taskId, activityId: data.activityId, groupSetId, roomIds: rooms.map(r => r.id), unassigned: people.filter(p => !distributed.has(p.id)), updatedAt: FieldValue.serverTimestamp() });
    });
    return { started: true };
  }
  if (op === 'allRooms' || op === 'pairOpinions' || op === 'spotlight') {
    if (!a.teacher) throw deny();
    const roster = op === 'pairOpinions' ? await a.root.collection('learners').get() : null;
    return db.runTransaction(async tx => {
      const meta = await tx.get(a.run);
      if (!meta.exists) throw deny();
      const snapshots = await tx.getAll(...(meta.get('roomIds') ?? []).map(id => a.run.collection('rooms').doc(id)));
      if (op === 'pairOpinions') {
        if (snapshots.some(s => s.get('config.kind') !== 'opinion')) throw deny();
        const values = snapshots.flatMap(s => Object.entries(s.get('state.opinions') ?? {}).map(([id, v]) => ({ id, value: v.value })));
        if (values.length < 2) throw new HttpsError('failed-precondition', 'Wait for at least two learners to choose a position.');
        const members = new Map(roster.docs.map(d => [d.get('authUid'), d.id]));
        const pairs = oppositePairs(values), setId = `opinions_${data.activityId}`;
        tx.set(a.root.collection('groupSets').doc(setId), { name: 'Opposite views', groups: pairs.map((ids, n) => ({ id: `pair${n}`, name: `Pair ${n + 1}`, members: ids.map(id => members.get(id)).filter(Boolean) })), createdAt: FieldValue.serverTimestamp() });
        tx.set(a.root.collection('live').doc('state'), { groupSetId: setId }, { merge: true });
        return { paired: pairs.length };
      }
      if (op === 'spotlight') {
        const room = snapshots.find(s => s.id === data.roomId)?.data();
        if (!room) throw deny();
        const selected=room.state.people.find(p=>p.id===data.learnerUid)??room.state.people[0];
        if (!selected) throw new HttpsError('failed-precondition','Choose a learner’s screen to share.');
        if(room.config.kind==='opinion'&&room.state.phase!=='revealed')throw new HttpsError('failed-precondition','Reveal the positions before sharing this screen.');
        if(['cue','spot','taboo'].includes(room.config.kind)&&room.state.phase!=='revealed'&&data.confirmPrivate!==true)throw new HttpsError('failed-precondition','Use Share private screen to make this learner’s card visible to the class.');
        const config=projectPictures(configForLearner(room.config,room.state,selected.id),a.context),state=stateForLearner(room.config,room.state,selected.id);
        const spotlight={taskId:data.taskId,qid:data.activityId,text:room.name,at:now,activity:{config,state,selfId:room.config.kind==='opinion'&&room.config.settings.showNames===false?'':selected.id,classId:data.classId}};
        if(new TextEncoder().encode(JSON.stringify(spotlight)).length>850000)throw new HttpsError('resource-exhausted','This screen is too large to share. Use uploaded pictures or shorter cards.');
        tx.set(a.root.collection('live').doc('state'), {spotlight}, {merge:true});
        return { shown: true };
      }
      if (!['reveal', 'end', 'reset'].includes(data.command?.type)) throw deny();
      for (const snap of snapshots) {
        const room = snap.data();
        if (data.revisions?.[snap.id] !== room.state.seq) throw new HttpsError('aborted', 'A group has updated. Wait for the update, then try again.');
        room.state = transition(room.config, room.state, data.command, { id: a.uid, teacher: true }, now);
        if (new TextEncoder().encode(JSON.stringify(room)).length > 950000) throw new HttpsError('resource-exhausted','This activity has reached its shared response limit. Keep extra details short, or use smaller groups.');
    tx.set(snap.ref, clone(room)); writeViews(tx, a.run, snap.id, room,a.context);
      }
      tx.update(a.run, { updatedAt: FieldValue.serverTimestamp() });
      return { updated: snapshots.length };
    });
  }
  if (op === 'join') {
    if (!a.teacher || !validId(data.learnerUid) || !validId(data.roomId)) throw deny();
    const member = await a.root.collection('members').doc(data.learnerUid).get();
    if (!member.exists) throw deny();
    const person = await a.root.collection('learners').doc(member.get('learnerId')).get();
    if (!person.exists) throw deny();
    await db.runTransaction(async tx => {
      const meta = await tx.get(a.run);
      if (!meta.exists || !(meta.get('roomIds') ?? []).includes(data.roomId)) throw deny();
      const refs = meta.get('roomIds').map(id => a.run.collection('rooms').doc(id));
      const snapshots = await tx.getAll(...refs);
      const to = snapshots.find(s => s.id === data.roomId), room = to?.data();
      if (!room) throw deny();
      if (snapshots.some(s => s.get('state.people')?.some(p => p.id === data.learnerUid))) throw new HttpsError('failed-precondition', 'This learner already has a group. Reset the activity to change its groups.');
      const p = { id: data.learnerUid, learnerId: person.id, name: String(person.get('displayName') || 'Learner') };
      if (room.config.settings.teamScoring) {
        const teams=await tx.get(a.root.collection('groupSets').doc(meta.get('groupSetId'))),team=(teams.get('groups')??[]).find(g=>(g.members??[]).includes(person.id));
        if(!team)throw new HttpsError('failed-precondition','Add this learner to a team in Manage pairs and groups first.');
        p.teamId=team.id;room.config.settings.teamNames={...room.config.settings.teamNames,[team.id]:team.name};
      }
      room.state.people.push(p); room.state.positions[p.id] = 0;
      if (room.config.kind === 'ranking') room.state.submitted = false;
      if (room.config.kind === 'bingo') {
        const used = new Set(Object.values(room.state.cards).map(card => card.join('|')));
        let card;
        for (let n = 0; n < 1000; n++) { card = bingoCards(room.config, [p])[p.id]; if (!used.has(card.join('|'))) break; if (n === 999) throw new HttpsError('resource-exhausted', 'Shuffle again to make another different card.'); }
        room.state.cards[p.id] = card;
      }
      if (room.config.kind === 'cue' && room.config.items.length) room.state.assignments[p.id] = [room.config.items[(room.state.people.length - 1) % room.config.items.length].id];
      if (room.config.kind === 'spot') room.state.assignments[p.id] = [String((room.state.people.length - 1) % 2)];
      room.state.seq++; tx.set(to.ref, clone(room)); writeViews(tx, a.run, data.roomId, room,a.context);
      tx.update(a.run, { unassigned: (meta.get('unassigned') ?? []).filter(p => p.id !== data.learnerUid), updatedAt: FieldValue.serverTimestamp() });
    });
    return { joined: true };
  }
  if (op !== 'command' || !validId(data.roomId) || !data.command || typeof data.command.type !== 'string' || !Number.isInteger(data.expectedSeq)) throw new HttpsError('invalid-argument', 'Choose a running activity.');
  return db.runTransaction(async tx => {
    const [meta, snap] = await Promise.all([tx.get(a.run), tx.get(a.run.collection('rooms').doc(data.roomId))]);
    if (!meta.exists || !snap.exists || !(meta.get('roomIds') ?? []).includes(data.roomId)) throw deny();
    const room = snap.data();
    if (!a.teacher && !room.state.people.some(p => p.id === a.uid)) throw deny();
    const personal = !a.teacher && personalCommands.has(data.command.type);
    const actorRevision = room.state.actorRevisions?.[a.uid] ?? 0;
    const hasPersonalEnvelope = data.expectedStartedAt !== undefined || data.expectedActorRevision !== undefined || data.expectedOrder !== undefined;
    const samePersonalRevision = personal && room.state.phase === 'running' && room.state.startedAt !== null
      && data.expectedStartedAt === room.state.startedAt && Number.isInteger(data.expectedActorRevision)
      && data.expectedActorRevision === actorRevision
      && (data.command.type !== 'agree' || Array.isArray(data.expectedOrder) && JSON.stringify(data.expectedOrder) === JSON.stringify(room.state.order));
    // Independent answers may share an older global snapshot. Their own revision
    // still prevents duplicate toggles/writes, and startedAt identifies this run.
    if (personal && hasPersonalEnvelope && !samePersonalRevision) throw changed();
    if (room.state.seq !== data.expectedSeq && !(samePersonalRevision && data.expectedSeq < room.state.seq)) throw changed();
    const command = clone(data.command);
    if (command.type === 'roll') command.die = randomInt(1, 7);
    if (command.type === 'call' && !command.itemId) {
      const options = room.config.items.filter(i => !room.state.called.includes(i.id));
      if (!options.length) throw new HttpsError('failed-precondition', 'Every item has been called.');
      command.itemId = options[randomInt(options.length)].id;
    }
    try { room.state = transition(room.config, room.state, command, { id: a.uid, teacher: a.teacher }, now); }
    catch (e) { throw new HttpsError('failed-precondition', e.message || 'Try the next step.'); }
    if (personal) room.state.actorRevisions = {...room.state.actorRevisions, [a.uid]: actorRevision + 1};
    if (new TextEncoder().encode(JSON.stringify(room)).length > 950000) throw new HttpsError('resource-exhausted','This activity has reached its shared response limit. Keep extra details short, or use smaller groups.');
    tx.set(snap.ref, clone(room)); writeViews(tx, a.run, data.roomId, room,a.context);
    tx.update(a.run, { updatedAt: FieldValue.serverTimestamp() });
    return { seq: room.state.seq };
  });
}
