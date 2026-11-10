// Games on the server. A teacher hosts a game: a saved game, a game block inside a class task, or any
// class task with marked questions. It's played either live (the teacher runs one clock for everyone)
// or at each player's own pace. Players join with a 6-digit code (guests with a nickname, class learners
// under their own name), and every answer comes here. The answer key never leaves the server: phones and
// the big screen read only the public state in the Realtime Database (quizLive/{runId}), which only this
// service writes.
//
// Firestore:  quizRuns/{runId}            the run, for its host (title, source, mode, status, timings)
//             quizRuns/{runId}/private/*  slides and the answer key
//             quizRuns/{runId}/players/*  each player: name, score, streak, token (guests' proof)
//             quizRuns/{runId}/answers/*  every answer, one per player per slide
//             quizCodes/{code}            the open join codes
// In a class, every run has its own gameAttempts record. A replay must never replace a learner's
// ordinary task answer or an earlier game attempt.
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { splitKey } from '../ai/import-question-core.js';
import { COUNTDOWN_MS, GRACE_MS, MAX_PLAYERS, SELF_READY_MS, cleanName, cleanResponses, findBlock, newCode, newToken, publicSlide, ranked, revealFor, scoreAnswer, slideLabel, slidesOf, uniqueName } from './engine.js';

const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const idOf = (v, what = 'game') => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : fail('invalid-argument', `Choose a valid ${what}.`));
const get = async (db, path) => (await db.doc(path).get()).data() || null;

/** Who is calling, if anyone: guests have no account. */
async function caller(db, auth) {
  if (!auth?.uid) return null;
  const profile = await get(db, 'users/' + auth.uid);
  if (!profile) return null;
  const learner = String(auth.token?.email || '').endsWith('@learners.lesson-lit.firebaseapp.com');
  return { uid: auth.uid, teacher: profile.role === 'teacher' && !learner && !auth.token?.proxyBy, profile };
}

async function teachesClass(db, uid, classId) {
  const c = await get(db, 'classes/' + classId);
  return !!c && (c.teacherId === uid || c.coTeachers?.[uid]?.role === 'co');
}

const taskContent = async (db, base, task) => (task.restricted ? (await get(db, base + '/private/body'))?.content : task.content);

/** The game to host: its content with answers taken out, the key, and how it splits into slides. */
async function loadSource(db, who, source) {
  if (source?.kind === 'class' || source?.kind === 'block') {
    const classId = idOf(source.classId, 'class');
    const itemId = idOf(source.itemId, 'lesson');
    if (!(await teachesClass(db, who.uid, classId))) fail('permission-denied', 'Only the class’s teachers can start this game.');
    const tasksPath = `classes/${classId}/items/${itemId}/tasks`;
    if (source.kind === 'block') {
      const blockId = idOf(source.blockId, 'game');
      // The block's task: the one named, or the one whose content holds the block.
      const named = typeof source.taskId === 'string' && source.taskId ? [await db.doc(`${tasksPath}/${idOf(source.taskId, 'task')}`).get()] : (await db.collection(tasksPath).get()).docs;
      for (const t of named) {
        const task = t.data();
        if (!task) continue;
        const base = `${tasksPath}/${t.id}`;
        const block = findBlock(await taskContent(db, base, task), blockId);
        if (!block) continue;
        const key = (await get(db, base + '/private/key')) || {};
        const a = block.attrs || {};
        return { title: a.title || task.title || 'Game', content: { type: 'doc', content: block.content || [] }, key, settings: a.settings || [], sizes: a.sizes || null, music: a.music || '', source: { kind: 'block', classId, itemId, taskId: t.id, blockId } };
      }
      return fail('not-found', 'This game isn’t in the lesson any more. Save the lesson, then try again.');
    }
    const taskId = idOf(source.taskId, 'task');
    const base = `${tasksPath}/${taskId}`;
    const task = await get(db, base);
    if (!task) fail('not-found', 'This task isn’t there any more.');
    const key = (await get(db, base + '/private/key')) || {};
    const plan = task.quiz || {};
    return { title: task.title || 'Game', content: await taskContent(db, base, task), key, settings: plan.settings || [], sizes: plan.sizes || null, music: plan.music || '', source: { kind: 'class', classId, itemId, taskId } };
  }
  if (source?.kind === 'doc') {
    const id = idOf(source.id);
    const d = await get(db, 'sharedDocs/' + id);
    if (!d || d.deletedAt || d.kind !== 'game' || !(d.owner === who.uid || d.members?.[who.uid]?.role === 'edit' || d.memberIds?.includes(who.uid))) fail('permission-denied', 'This game isn’t shared with you.');
    const quiz = await get(db, `sharedDocs/${id}/game/main`);
    if (!quiz || quiz.version !== 2 || !Array.isArray(quiz.slides)) fail('failed-precondition', 'Open the game and save it before you start it.');
    const full = { type: 'doc', content: quiz.slides.flatMap((s) => s.content?.content || []) };
    const { content, key } = splitKey(full);
    const used = quiz.slides.filter((s) => (s.content?.content || []).length);
    return {
      title: d.title || 'Game',
      content,
      key,
      sizes: used.map((s) => s.content.content.length),
      settings: used.map((s) => ({ seconds: s.seconds, points: s.points, poll: s.kind === 'poll', skin: s.skin })),
      music: quiz.music || '',
      source: { kind: 'doc', id },
    };
  }
  return fail('invalid-argument', 'Choose a game to start.');
}

/** Where a class's learners find a running game: in the class's live state, by block or task. */
const classSlot = (src) => (src.kind === 'block' ? src.blockId : src.taskId);

/** A learner's game attempt, separate from their ordinary task answer. */
function classWrite(db, run, runId, player, responses, totals, now) {
  const src = run.source;
  if (!player.uid || !src || (src.kind !== 'class' && src.kind !== 'block')) return null;
  const ref = db.doc(`classes/${src.classId}/gameAttempts/${runId}_${player.uid}`);
  return { ref, data: {
    runId, learnerUid: player.uid, learnerId: player.learnerId || '', itemId: src.itemId,
    taskId: src.taskId, blockId: src.blockId || null, mode: run.mode || 'live',
    responses, points: totals.score, score: totals.got, total: totals.max, updatedAt: FieldValue.serverTimestamp(),
  } };
}

export async function quizService(db, rtdb, auth, data, now = Date.now()) {
  const action = data?.action;
  const live = (runId) => rtdb.ref('quizLive/' + runId);
  const loadPrivate = async (ref) => {
    const p = (await ref.collection('private').doc('quiz').get()).data();
    return { slides: p.slides.map((s) => ({ ...s, blocks: JSON.parse(s.blocks) })), key: typeof p.key === 'string' ? JSON.parse(p.key) : p.key || {} };
  };

  // ---- The host starts a game ---------------------------------------------------------------------
  if (action === 'host') {
    const who = await caller(db, auth);
    if (!who?.teacher) fail('permission-denied', 'Sign in as a teacher to start a game.');
    const src = await loadSource(db, who, data.source);
    const slides = slidesOf(src.content, src.settings, src.sizes);
    if (!slides.length) fail('failed-precondition', 'This game has no questions that can be marked. Add a question, then try again.');
    const mode = data.mode === 'self' ? 'self' : 'live';
    const ref = db.collection('quizRuns').doc();
    let code = '';
    for (let i = 0; i < 8 && !code; i++) {
      const c = newCode();
      if (!(await db.doc('quizCodes/' + c).get()).exists) code = c;
    }
    if (!code) fail('resource-exhausted', 'We couldn’t make a join code just now. Try again in a moment.');
    const total = slides.length;
    const inClass = src.source.kind === 'class' || src.source.kind === 'block';
    const guests = inClass ? data.guests === true : true;
    const music = typeof data.music === 'string' ? data.music.slice(0, 40) : src.music;
    const run = { owner: who.uid, ownerName: who.profile.displayName || 'Teacher', title: src.title, source: src.source, classId: src.source.classId || null, code, guests, mode, status: mode === 'self' ? 'open' : 'lobby', slide: -1, startsAt: 0, endsAt: 0, slides: total, labels: slides.map(slideLabel), kinds: slides.map((s) => (s.poll ? 'poll' : s.types.join(','))), players: 0, music, createdAt: now };
    const batch = db.batch();
    batch.set(ref, run);
    batch.set(ref.collection('private').doc('quiz'), { slides: slides.map((s) => ({ ...s, blocks: JSON.stringify(s.blocks) })), key: JSON.stringify(src.key || {}) });
    batch.set(db.doc('quizCodes/' + code), { runId: ref.id, at: now });
    if (inClass) {
      const pointer = { runId: ref.id, code, title: src.title, mode, itemId: src.source.itemId, taskId: src.source.taskId, blockId: src.source.blockId || null, at: now };
      batch.set(db.doc(`classes/${src.source.classId}/live/state`), { ...(mode === 'live' ? { liveQuiz: pointer } : {}), games: { [classSlot(src.source)]: pointer } }, { merge: true });
    }
    await batch.commit();
    await live(ref.id).set({ title: src.title, code, total, mode, phase: mode === 'self' ? 'self' : 'lobby', slide: -1, guests, locked: false, music, host: run.ownerName, classId: run.classId, at: now });
    return { runId: ref.id, code };
  }

  // ---- A player joins --------------------------------------------------------------------------------
  if (action === 'join') {
    let runId = typeof data.runId === 'string' ? idOf(data.runId) : '';
    if (!runId) {
      const code = String(data.code || '').replace(/\D/g, '');
      if (code.length !== 6) fail('invalid-argument', 'Type the 6-digit code from the screen.');
      runId = (await get(db, 'quizCodes/' + code))?.runId;
      if (!runId) fail('not-found', 'We can’t find a game with that code. Check the number on the screen.');
    }
    const ref = db.doc('quizRuns/' + runId);
    const run = (await ref.get()).data();
    if (!run || run.status === 'ended') fail('not-found', 'This game has finished.');
    const who = await caller(db, auth);
    // A learner in the game's class plays under their own name, and their answers are kept with the class.
    let member = null;
    if (who && run.classId) {
      const m = await get(db, `classes/${run.classId}/members/${who.uid}`);
      if (m) member = { uid: who.uid, learnerId: m.learnerId || '', name: m.displayName || who.profile.displayName || 'Learner' };
    }
    const state = (await live(runId).get()).val() || {};
    if (!member) {
      if (!run.guests) fail('permission-denied', 'This game is for the class. Sign in with your class account to join.');
    }
    if (member) {
      const existing = (await ref.collection('players').doc(member.uid).get()).data();
      if (existing && !existing.kicked) return { runId, pid: member.uid, token: existing.token, name: existing.name, member: true };
    }
    if (state.locked) fail('permission-denied', 'The teacher has closed this game to new players.');
    if (run.players >= MAX_PLAYERS) fail('resource-exhausted', 'This game is full.');
    let name;
    if (member) name = member.name;
    else {
      const c = cleanName(data.name);
      if (c.error) fail('invalid-argument', c.error);
      name = c.name;
    }
    name = uniqueName(name, Object.values(state.players || {}).map((p) => p.n));
    const pid = member ? member.uid : ref.collection('players').doc().id;
    const token = newToken();
    await ref.collection('players').doc(pid).set({ name, token, score: 0, streak: 0, got: 0, max: 0, joinedAt: now, kicked: false, slide: -1, ...(member ? { uid: member.uid, learnerId: member.learnerId } : {}) });
    await ref.update({ players: FieldValue.increment(1) });
    await live(runId).child('players/' + pid).set({ n: name, s: 0, k: 0, d: 0, ...(member ? { m: 1 } : {}) });
    return { runId, pid, token, name, member: !!member };
  }

  // ---- A player at their own pace moves to their next question ----------------------------------------
  if (action === 'self-next') {
    const { ref, run, player, playerRef } = await seat(db, data);
    if (run.mode !== 'self') fail('failed-precondition', 'This game is played live.');
    const { slides } = await loadPrivate(ref);
    const total = slides.length;
    // Without "advance", hand back the question in play (after a refresh), or start the first.
    let i = player.slide ?? -1;
    if (data.advance === true || i < 0) {
      if (i >= 0 && !player.slides?.[i]) {
        // Moving on without answering: the question counts as not answered.
        await playerRef.update({ [`slides.${i}`]: { pts: 0, frac: null, answered: false }, streak: 0 });
      }
      i += 1;
      if (i >= total) {
        await playerRef.update({ slide: total, finished: true, finishedAt: now });
        await live(run.id).child('players/' + player.id).update({ d: total, f: 1 });
        return { done: true, total };
      }
      const startsAt = now + SELF_READY_MS;
      await playerRef.update({ slide: i, startsAt, endsAt: startsAt + slides[i].seconds * 1000 });
      return { done: false, total, startsAt, endsAt: startsAt + slides[i].seconds * 1000, q: publicSlide(slides[i], total) };
    }
    if (i >= total) return { done: true, total };
    return { done: false, total, startsAt: player.startsAt, endsAt: player.endsAt, q: publicSlide(slides[i], total), answered: !!player.slides?.[i], result: player.slides?.[i] || null };
  }

  // ---- A player answers --------------------------------------------------------------------------------
  if (action === 'answer') {
    const { ref, run, player, playerRef } = await seat(db, data);
    const self = run.mode === 'self';
    const answerRef = ref.collection('answers').doc(`${data.slide}_${player.id}`);
    const previous = (await answerRef.get()).data();
    if (previous && !self && run.slide !== data.slide) return { ok: true };
    const at = self ? player : run;
    const current = self ? player.slide : run.slide;
    if (!previous && ((!self && run.status !== 'question') || current !== data.slide)) fail('failed-precondition', 'This question has closed.');
    if (!previous && now < at.startsAt - 500) fail('failed-precondition', 'Wait for the question to start.');
    const late = now > at.endsAt + GRACE_MS;
    if (late && !self && !previous) fail('deadline-exceeded', 'Time ran out.');
    const { slides, key } = self ? await loadPrivate(ref) : { slides: null, key: null };
    const qids = self ? slides[data.slide].qids : Array.isArray(run.qids) ? run.qids : [];
    if (previous && !self && JSON.stringify(previous.responses) !== JSON.stringify(cleanResponses(data.responses, qids))) fail('already-exists', 'You’ve already answered this one.');
    const answer = { pid: player.id, slide: data.slide, responses: late ? {} : cleanResponses(data.responses, qids), at: now, ms: Math.max(0, now - at.startsAt), late };
    let saved = previous || answer;
    if (!previous) {
      try {
        await answerRef.create(answer);
      } catch (error) {
        const existing = (await answerRef.get()).data();
        if (!existing) throw error;
        if (JSON.stringify(existing.responses) !== JSON.stringify(answer.responses)) fail('already-exists', 'You’ve already answered this one.');
        saved = existing;
      }
    }
    if (!self) {
      // A receipt per player gives both screens an accurate count and survives retries.
      // A transaction on the whole live state can see an uncached null first and abort,
      // even though the game exists; that left the counter at zero for saved answers.
      await live(run.id).child(`answeredBy/${data.slide}/${player.id}`).set(true);
      return { ok: true };
    }
    // At their own pace, the answer is marked straight away.
    const slide = slides[data.slide];
    const result = await db.runTransaction(async (tx) => {
      const current = (await tx.get(playerRef)).data();
      if (!current) fail('not-found', 'This player is no longer in the game.');
      if (current.slides?.[data.slide]?.processed) return { next: current, gained: current.slides[data.slide].pts, frac: current.slides[data.slide].frac, scored: true };
      const s = scoreAnswer(slide, key, { ...current, id: player.id }, saved.late ? null : saved);
      tx.update(playerRef, { ...s.next, [`slides.${data.slide}`]: { pts: s.gained, frac: s.frac, answered: !saved.late, processed: true } });
      const w = classWrite(db, run, run.id, { ...current, id: player.id }, saved.responses, s.next, now);
      if (w) tx.set(w.ref, w.data, { merge: true });
      return s;
    });
    await live(run.id).child('players/' + player.id).update({ s: result.next.score, k: result.next.streak, g: result.gained, d: data.slide + 1, ok: !result.scored ? null : result.frac === 1 ? 1 : result.frac > 0 ? 0.5 : 0 });
    const reveal = revealFor(slide, key, [saved]);
    return { ok: true, late: saved.late, gained: result.gained, score: result.next.score, streak: result.next.streak, frac: result.frac, scored: result.scored, reveal: { key: reveal.key, correct: reveal.correct ?? null }, last: data.slide + 1 >= slides.length };
  }

  // ---- Everything else is the host's ------------------------------------------------------------------
  const runId = idOf(data?.runId);
  const ref = db.doc('quizRuns/' + runId);
  const run = (await ref.get()).data();
  const who = await caller(db, auth);
  if (!run || !who || (run.owner !== who.uid && !(run.classId && (await teachesClass(db, who.uid, run.classId))))) fail('permission-denied', 'Only the game’s host can do that.');
  if (run.status === 'ended' && action !== 'end') fail('failed-precondition', 'This game has finished.');

  if (action === 'next') {
    // From the lobby, the leaderboard or a reveal: open the next question, or finish on the podium.
    if (run.mode === 'self') fail('failed-precondition', 'Players move on by themselves in this game.');
    if (run.status === 'question' || run.status === 'scoring') fail('failed-precondition', 'Close this question first.');
    const { slides } = await loadPrivate(ref);
    const i = run.slide + 1;
    if (i >= run.slides) {
      await ref.update({ status: 'podium' });
      await live(runId).update({ phase: 'podium', at: now });
      return { ok: true, phase: 'podium' };
    }
    const slide = slides[i];
    const startsAt = now + COUNTDOWN_MS;
    const endsAt = startsAt + slide.seconds * 1000;
    await ref.update({ status: 'question', slide: i, startsAt, endsAt, qids: slide.qids });
    await live(runId).update({ phase: 'question', slide: i, startsAt, endsAt, q: JSON.stringify(publicSlide(slide, run.slides)), reveal: null, at: now });
    return { ok: true, phase: 'question', startsAt, endsAt };
  }

  if (action === 'close') {
    // Claim the round before scoring. Each player and class attempt are committed together in
    // one transaction, so a concurrent close or an interrupted retry cannot award points twice.
    if (!['question', 'scoring', 'reveal'].includes(run.status)) return { ok: true };
    const round = await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (!current || !['question', 'scoring', 'reveal'].includes(current.status)) return null;
      if (current.status === 'question') tx.update(ref, { status: 'scoring', scoringSlide: current.slide });
      return { ...current, id: runId };
    });
    if (!round) return { ok: true };
    const [{ slides, key }, answersSnap, playersSnap] = await Promise.all([loadPrivate(ref), ref.collection('answers').where('slide', '==', run.slide).get(), ref.collection('players').get()]);
    const slide = slides[round.slide];
    const answers = answersSnap.docs.map((d) => d.data());
    const byPid = new Map(answers.map((a) => [a.pid, a]));
    if (round.status !== 'reveal') {
      for (const d of playersSnap.docs) {
        const a = byPid.get(d.id);
        await db.runTransaction(async (tx) => {
          const current = (await tx.get(d.ref)).data();
          if (!current || current.kicked || current.slides?.[round.slide]?.processed) return;
          const s = scoreAnswer(slide, key, { ...current, id: d.id }, a);
          tx.update(d.ref, { ...s.next, [`slides.${round.slide}`]: { pts: s.gained, frac: s.frac, answered: !!a, processed: true } });
          const w = classWrite(db, round, runId, { ...current, id: d.id }, a?.responses || {}, s.next, now);
          if (w) tx.set(w.ref, w.data, { merge: true });
        });
      }
    }
    const fresh = await ref.collection('players').get();
    const players = Object.fromEntries(fresh.docs.filter((d) => !d.data().kicked).map((d) => [d.id, { name: d.data().name, score: d.data().score }]));
    const places = new Map(ranked(players).map((p) => [p.id, p.place]));
    const pub = {};
    for (const d of fresh.docs) {
      const p = d.data();
      if (p.kicked) continue;
      const result = p.slides?.[round.slide] || {};
      pub[d.id] = { n: p.name, s: p.score, k: p.streak, g: result.pts || 0, r: places.get(d.id), a: result.answered ? 1 : 0, d: round.slide + 1, ok: result.frac == null ? null : result.frac === 1 ? 1 : result.frac > 0 ? 0.5 : 0, ...(p.uid ? { m: 1 } : {}) };
    }
    const reveal = revealFor(slide, key, answers);
    await ref.update({ status: 'reveal', [`summary.${round.slide}`]: { right: reveal.right, partly: reveal.partly, wrong: reveal.wrong, answered: reveal.answered } });
    await live(runId).update({ phase: 'reveal', reveal: JSON.stringify(reveal), players: pub, at: now });
    return { ok: true };
  }

  if (action === 'board') {
    if (run.status !== 'reveal') return { ok: true };
    await ref.update({ status: 'board' });
    await live(runId).update({ phase: 'board', at: now });
    return { ok: true };
  }

  if (action === 'kick') {
    const pid = idOf(data.pid, 'player');
    await ref.collection('players').doc(pid).update({ kicked: true });
    await ref.update({ players: FieldValue.increment(-1) });
    await live(runId).child('players/' + pid).remove();
    await live(runId).child('kicked/' + pid).set(true);
    return { ok: true };
  }

  if (action === 'lock') {
    await live(runId).update({ locked: data.locked === true });
    return { ok: true };
  }

  if (action === 'music') {
    await ref.update({ music: String(data.music || '').slice(0, 40) });
    await live(runId).update({ music: String(data.music || '').slice(0, 40) });
    return { ok: true };
  }

  if (action === 'end') {
    const batch = db.batch();
    batch.update(ref, { status: 'ended', endedAt: now });
    batch.delete(db.doc('quizCodes/' + run.code));
    if (run.classId) {
      const st = await get(db, `classes/${run.classId}/live/state`);
      const slot = run.source ? classSlot(run.source) : null;
      const patch = {};
      if (st?.liveQuiz?.runId === runId) patch.liveQuiz = null;
      if (slot && st?.games?.[slot]?.runId === runId) patch.games = { [slot]: null };
      if (Object.keys(patch).length) batch.set(db.doc(`classes/${run.classId}/live/state`), patch, { merge: true });
    }
    await batch.commit();
    await live(runId).update({ phase: 'ended', at: now });
    return { ok: true };
  }

  return fail('invalid-argument', 'Unknown game action.');

  // ---- helpers ------------------------------------------------------------------------------------------
  /** A player's seat: their run and player record, checked against their token. */
  async function seat(dbx, d) {
    const id = idOf(d.runId);
    const pid = idOf(d.pid, 'player');
    const rref = dbx.doc('quizRuns/' + id);
    const playerRef = rref.collection('players').doc(pid);
    const [runSnap, playerSnap] = await Promise.all([rref.get(), playerRef.get()]);
    const r = runSnap.data();
    const p = playerSnap.data();
    if (!r || !p || p.kicked || p.token !== d.token) fail('permission-denied', 'You’re not in this game. Join again with the code.');
    if (r.status === 'ended') fail('failed-precondition', 'This game has finished.');
    return { ref: rref, run: { ...r, id }, player: { ...p, id: pid }, playerRef };
  }
}
