// The live quiz show on the server. A teacher hosts a quiz (a saved quiz or a task in a class), players
// join with a 6-digit code (guests with a nickname, class learners under their own name), and every
// answer comes here. The answer key never leaves the server: phones and the big screen read only the
// public state in the Realtime Database (quizLive/{runId}), which only this service writes.
//
// Firestore:  quizRuns/{runId}            the run, for its host (title, source, status, timings)
//             quizRuns/{runId}/private/*  slides and the answer key
//             quizRuns/{runId}/players/*  each player: name, score, streak, token (guests' proof)
//             quizRuns/{runId}/answers/*  every answer, one per player per slide
//             quizCodes/{code}            the open join codes
// In a class, each learner's answers also go into classes/{classId}/answers/{taskId}_{uid}, the same
// record as any other task, so the teacher sees them with every other answer and they're kept.
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { ServerValue } from 'firebase-admin/database';
import { splitKey } from '../ai/import-question-core.js';
import { slideLabel, COUNTDOWN_MS, GRACE_MS, MAX_PLAYERS, cleanName, cleanResponses, markSlide, newCode, newToken, pointsFor, publicSlide, ranked, revealFor, slidesOf, streakBonus, uniqueName } from './engine.js';

const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const idOf = (v, what = 'quiz') => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : fail('invalid-argument', `Choose a valid ${what}.`));
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

/** The quiz to host: its content with answers taken out, the key, and how it splits into slides. */
async function loadSource(db, who, source) {
  if (source?.kind === 'class') {
    const classId = idOf(source.classId, 'class');
    const itemId = idOf(source.itemId, 'lesson');
    const taskId = idOf(source.taskId, 'task');
    if (!(await teachesClass(db, who.uid, classId))) fail('permission-denied', 'Only the class’s teachers can host this quiz.');
    const base = `classes/${classId}/items/${itemId}/tasks/${taskId}`;
    const task = await get(db, base);
    if (!task) fail('not-found', 'This task isn’t there any more.');
    const content = task.restricted ? (await get(db, base + '/private/body'))?.content : task.content;
    const key = (await get(db, base + '/private/key')) || {};
    const plan = task.quiz || {};
    return { title: task.title || 'Live quiz', content, key, settings: plan.settings || [], sizes: plan.sizes || null, music: plan.music || '', source: { kind: 'class', classId, itemId, taskId } };
  }
  if (source?.kind === 'doc') {
    const id = idOf(source.id);
    const d = await get(db, 'sharedDocs/' + id);
    if (!d || d.deletedAt || d.kind !== 'game' || !(d.owner === who.uid || d.members?.[who.uid]?.role === 'edit' || d.memberIds?.includes(who.uid))) fail('permission-denied', 'This quiz isn’t shared with you.');
    const quiz = await get(db, `sharedDocs/${id}/game/main`);
    if (!quiz || quiz.version !== 2 || !Array.isArray(quiz.slides)) fail('failed-precondition', 'Open the quiz and save it before hosting it.');
    const full = { type: 'doc', content: quiz.slides.flatMap((s) => s.content?.content || []) };
    const { content, key } = splitKey(full);
    return {
      title: d.title || 'Live quiz',
      content,
      key,
      sizes: quiz.slides.map((s) => (s.content?.content || []).length).filter((n) => n > 0),
      settings: quiz.slides.filter((s) => (s.content?.content || []).length).map((s) => ({ seconds: s.seconds, points: s.points, poll: s.kind === 'poll' })),
      music: quiz.music || '',
      source: { kind: 'doc', id },
    };
  }
  return fail('invalid-argument', 'Choose a quiz to host.');
}

export async function quizService(db, rtdb, auth, data, now = Date.now()) {
  const action = data?.action;
  const live = (runId) => rtdb.ref('quizLive/' + runId);

  // ---- The host makes a run -------------------------------------------------------------------------
  if (action === 'host') {
    const who = await caller(db, auth);
    if (!who?.teacher) fail('permission-denied', 'Sign in as a teacher to host a quiz.');
    const src = await loadSource(db, who, data.source);
    const slides = slidesOf(src.content, src.settings, src.sizes);
    if (!slides.length) fail('failed-precondition', 'This quiz has no questions that can be marked. Add a question, then try again.');
    const ref = db.collection('quizRuns').doc();
    let code = '';
    for (let i = 0; i < 8 && !code; i++) {
      const c = newCode();
      const taken = await db.doc('quizCodes/' + c).get();
      if (!taken.exists) code = c;
    }
    if (!code) fail('resource-exhausted', 'We couldn’t make a join code just now. Try again in a moment.');
    const total = slides.length;
    const guests = src.source.kind === 'doc' ? true : data.guests === true;
    const run = { owner: who.uid, ownerName: who.profile.displayName || 'Teacher', title: src.title, source: src.source, classId: src.source.classId || null, code, guests, status: 'lobby', slide: -1, startsAt: 0, endsAt: 0, slides: total, labels: slides.map(slideLabel), kinds: slides.map((s) => (s.poll ? 'poll' : s.types.join(','))), players: 0, music: typeof data.music === 'string' ? data.music.slice(0, 40) : src.music, createdAt: now };
    const batch = db.batch();
    batch.set(ref, run);
    batch.set(ref.collection('private').doc('quiz'), { slides: slides.map((s) => ({ ...s, blocks: JSON.stringify(s.blocks) })), key: JSON.stringify(src.key || {}) });
    batch.set(db.doc('quizCodes/' + code), { runId: ref.id, at: now });
    if (src.source.kind === 'class') batch.set(db.doc(`classes/${src.source.classId}/live/state`), { liveQuiz: { runId: ref.id, code, title: src.title, itemId: src.source.itemId, taskId: src.source.taskId, at: now } }, { merge: true });
    await batch.commit();
    await live(ref.id).set({ title: src.title, code, total, phase: 'lobby', slide: -1, guests, locked: false, music: run.music, host: run.ownerName, at: now });
    return { runId: ref.id, code };
  }

  // ---- A player joins ----------------------------------------------------------------------------------
  if (action === 'join') {
    let runId = typeof data.runId === 'string' ? idOf(data.runId) : '';
    if (!runId) {
      const code = String(data.code || '').replace(/\D/g, '');
      if (code.length !== 6) fail('invalid-argument', 'Type the 6-digit code from the screen.');
      runId = (await get(db, 'quizCodes/' + code))?.runId;
      if (!runId) fail('not-found', 'We can’t find a quiz with that code. Check the number on the screen.');
    }
    const ref = db.doc('quizRuns/' + runId);
    const run = (await ref.get()).data();
    if (!run || run.status === 'ended') fail('not-found', 'This quiz has finished.');
    const who = await caller(db, auth);
    // A learner in the quiz's class plays under their own name, and their answers are kept with the class.
    let member = null;
    if (who && run.classId) {
      const m = await get(db, `classes/${run.classId}/members/${who.uid}`);
      if (m) member = { uid: who.uid, learnerId: m.learnerId || '', name: m.displayName || who.profile.displayName || 'Learner' };
    }
    const state = (await live(runId).get()).val() || {};
    if (!member) {
      if (!run.guests) fail('permission-denied', 'This quiz is for the class. Sign in with your class account to join.');
      if (state.locked) fail('permission-denied', 'The teacher has closed this quiz to new players.');
    }
    if (member) {
      const existing = (await ref.collection('players').doc(member.uid).get()).data();
      if (existing && !existing.kicked) return { runId, pid: member.uid, token: existing.token, name: existing.name, member: true };
    }
    if (run.players >= MAX_PLAYERS) fail('resource-exhausted', 'This quiz is full.');
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
    await ref.collection('players').doc(pid).set({ name, token, score: 0, streak: 0, got: 0, max: 0, joinedAt: now, kicked: false, ...(member ? { uid: member.uid, learnerId: member.learnerId } : {}) });
    await ref.update({ players: FieldValue.increment(1) });
    await live(runId).child('players/' + pid).set({ n: name, s: 0, k: 0, ...(member ? { m: 1 } : {}) });
    return { runId, pid, token, name, member: !!member };
  }

  // ---- A player answers --------------------------------------------------------------------------------
  if (action === 'answer') {
    const runId = idOf(data.runId);
    const pid = idOf(data.pid, 'player');
    const ref = db.doc('quizRuns/' + runId);
    const [runSnap, playerSnap] = await Promise.all([ref.get(), ref.collection('players').doc(pid).get()]);
    const run = runSnap.data();
    const player = playerSnap.data();
    if (!run || !player || player.kicked || player.token !== data.token) fail('permission-denied', 'You’re not in this quiz. Join again with the code.');
    if (run.status !== 'question' || run.slide !== data.slide) fail('failed-precondition', 'This question has closed.');
    if (now < run.startsAt - 500) fail('failed-precondition', 'Wait for the question to start.');
    if (now > run.endsAt + GRACE_MS) fail('deadline-exceeded', 'Time ran out.');
    const qids = Array.isArray(run.qids) ? run.qids : [];
    try {
      await ref.collection('answers').doc(`${data.slide}_${pid}`).create({ pid, slide: data.slide, responses: cleanResponses(data.responses, qids), at: now, ms: Math.max(0, now - run.startsAt) });
    } catch {
      fail('already-exists', 'You’ve already answered this one.');
    }
    await live(runId).child('answered/' + data.slide).set(ServerValue.increment(1));
    return { ok: true };
  }

  // ---- Everything else is the host's ------------------------------------------------------------------
  const runId = idOf(data?.runId);
  const ref = db.doc('quizRuns/' + runId);
  const run = (await ref.get()).data();
  const who = await caller(db, auth);
  if (!run || !who || (run.owner !== who.uid && !(run.classId && (await teachesClass(db, who.uid, run.classId))))) fail('permission-denied', 'Only the quiz’s host can do that.');
  if (run.status === 'ended' && action !== 'end') fail('failed-precondition', 'This quiz has finished.');

  if (action === 'next') {
    // From the lobby, the leaderboard or a reveal: open the next question, or finish on the podium.
    if (run.status === 'question') fail('failed-precondition', 'Close this question first.');
    const priv = (await ref.collection('private').doc('quiz').get()).data();
    const i = run.slide + 1;
    if (i >= run.slides) {
      await ref.update({ status: 'podium' });
      await live(runId).update({ phase: 'podium', at: now });
      return { ok: true, phase: 'podium' };
    }
    const s = priv.slides[i];
    const slide = { ...s, blocks: JSON.parse(s.blocks) };
    const startsAt = now + COUNTDOWN_MS;
    const endsAt = startsAt + slide.seconds * 1000;
    await ref.update({ status: 'question', slide: i, startsAt, endsAt, qids: slide.qids });
    await live(runId).update({ phase: 'question', slide: i, startsAt, endsAt, q: JSON.stringify(publicSlide(slide, run.slides)), reveal: null, at: now });
    return { ok: true, phase: 'question', startsAt, endsAt };
  }

  if (action === 'close') {
    // Mark every answer to the open question, update scores and places, then show the reveal.
    if (run.status !== 'question') return { ok: true };
    const [priv, answersSnap, playersSnap] = await Promise.all([
      ref.collection('private').doc('quiz').get().then((s) => s.data()),
      ref.collection('answers').where('slide', '==', run.slide).get(),
      ref.collection('players').get(),
    ]);
    const s = priv.slides[run.slide];
    const slide = { ...s, blocks: JSON.parse(s.blocks) };
    const key = typeof priv.key === 'string' ? JSON.parse(priv.key) : priv.key || {};
    const answers = answersSnap.docs.map((d) => d.data());
    const byPid = new Map(answers.map((a) => [a.pid, a]));
    const players = {};
    const updates = [];
    const pub = {};
    for (const d of playersSnap.docs) {
      const p = d.data();
      if (p.kicked) continue;
      const a = byPid.get(d.id);
      const m = a ? markSlide(key, slide, a.responses) : { got: 0, max: 0, frac: null };
      const scored = !slide.poll && m.frac !== null;
      const right = scored && m.frac === 1;
      const streak = slide.poll ? p.streak || 0 : right ? (p.streak || 0) + 1 : 0;
      const gained = a ? pointsFor(slide, m.frac, a.ms) + (right && slide.points ? streakBonus(streak) : 0) : 0;
      const score = (p.score || 0) + gained;
      // Points the slide could give, for the class record: polls and unanswered slides still count once marked.
      const maxHere = slide.poll ? 0 : slide.qids.reduce((n, q) => n + (key[q] ? 1 : 0), 0);
      const next = { score, streak, got: (p.got || 0) + (scored ? m.got : 0), max: (p.max || 0) + (slide.poll ? 0 : m.max || maxHere) };
      players[d.id] = { name: p.name, score };
      updates.push({ ref: d.ref, data: { ...next, [`slides.${run.slide}`]: { pts: gained, frac: m.frac, answered: !!a } }, player: p, answer: a, gained, right, scored, frac: m.frac, next });
    }
    const places = new Map(ranked(players).map((p) => [p.id, p.place]));
    for (const u of updates) {
      const id = u.ref.id;
      pub[id] = { n: u.player.name, s: u.next.score, k: u.next.streak, g: u.gained, r: places.get(id), a: u.answer ? 1 : 0, ok: !u.scored ? null : u.frac === 1 ? 1 : u.frac > 0 ? 0.5 : 0, ...(u.player.uid ? { m: 1 } : {}) };
    }
    // Firestore batches hold up to 500 writes.
    const writes = [];
    for (const u of updates) {
      writes.push((b) => b.update(u.ref, u.data));
      if (run.source?.kind === 'class' && u.player.uid) {
        const src = run.source;
        const answerId = `${src.taskId}_${u.player.uid}`;
        const responses = Object.fromEntries(Object.entries(u.answer?.responses || {}));
        writes.push((b) =>
          b.set(
            db.doc(`classes/${src.classId}/answers/${answerId}`),
            {
              learnerUid: u.player.uid,
              learnerId: u.player.learnerId || '',
              itemId: src.itemId,
              taskId: src.taskId,
              responses,
              checked: true,
              score: u.next.got,
              total: u.next.max,
              quiz: { runId, points: u.next.score },
              submittedAt: now,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { mergeFields: ['learnerUid', 'learnerId', 'itemId', 'taskId', 'checked', 'score', 'total', 'quiz', 'submittedAt', 'updatedAt', ...Object.keys(responses).map((q) => `responses.${q}`)] },
          ),
        );
      }
    }
    for (let i = 0; i < writes.length; i += 450) {
      const b = db.batch();
      writes.slice(i, i + 450).forEach((w) => w(b));
      await b.commit();
    }
    const reveal = revealFor(slide, key, answers);
    await ref.update({ status: 'reveal', [`summary.${run.slide}`]: { right: reveal.right, partly: reveal.partly, wrong: reveal.wrong, answered: reveal.answered } });
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
      if (st?.liveQuiz?.runId === runId) batch.set(db.doc(`classes/${run.classId}/live/state`), { liveQuiz: null }, { merge: true });
    }
    await batch.commit();
    await live(runId).update({ phase: 'ended', at: now });
    return { ok: true };
  }

  return fail('invalid-argument', 'Unknown quiz action.');
}
