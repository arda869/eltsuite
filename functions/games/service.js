import { cleanState } from './state.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { actor, targetAccess } from '../linguistics/service.js';
const idOf = v => { if (typeof v !== 'string' || !v || v.length > 160 || v.includes('/'))
    throw new HttpsError('invalid-argument', 'Choose a valid game.'); return v; };
const deny = () => { throw new HttpsError('permission-denied', 'This game is not shared with you.'); };
const modes = ['teacher', 'selected', 'multiplayer', 'individual'];
export async function gamesService(db, auth, data) {
    const who = await actor(db, auth);
    const action = data.action;
    if (action === 'publish') {
        const id = idOf(data.id);
        if (!await targetAccess(db, who, { type: 'doc', id }, true) || !await targetAccess(db, who, data.target, true))
            deny();
        const [source, settings] = await Promise.all([db.doc('sharedDocs/' + id).get(), db.doc(`sharedDocs/${id}/game/main`).get()]);
        if (source.data()?.kind !== 'game' || !settings.exists || !settings.data().rounds?.length)
            throw new HttpsError('failed-precondition', 'Save questions in the game first.');
        const ref = db.collection('gameSessions').doc();
        await ref.set({ owner: who.uid, sourceId: id, title: source.data().title, target: data.target, game: settings.data(), mode: 'teacher', selected: [], state: null, revision: 0, ended: false, createdAt: Date.now() });
        return { id: ref.id };
    }
    const id = idOf(data.id), ref = db.doc('gameSessions/' + id);
    const snap = await ref.get(), session = snap.data();
    if (!session || !await targetAccess(db, who, session.target))
        deny();
    const teacher = await targetAccess(db, who, session.target, true);
    if (action === 'open') {
        const scores = await ref.collection('players').get();
        return { session: { ...session, id }, teacher, uid: who.uid, players: scores.docs.map(d => { const p = d.data(); return { id: d.id, name: p.name, state: teacher || d.id === who.uid ? p.state : { finished: !!p.state?.finished, score: p.state?.finished ? p.state.score : 0 } }; }) };
    }
    if (action === 'configure') {
        if (!teacher)
            deny();
        if (!modes.includes(data.mode))
            throw new HttpsError('invalid-argument', 'Choose a play mode.');
        const selected = Array.isArray(data.selected) ? [...new Set(data.selected.map(idOf))].slice(0, 100) : [];
        if (data.mode === 'selected' && selected.length !== 1)
            throw new HttpsError('invalid-argument', 'Choose one learner.');
        if (data.mode === 'multiplayer' && selected.length < 2)
            throw new HttpsError('invalid-argument', 'Choose at least two learners.');
        for (const uid of selected)
            if (!await targetAccess(db, { uid, teacher: false, profile: {} }, session.target))
                deny();
        const oldPlayers = await ref.collection('players').get();
        const batch = db.batch();
        for (const p of oldPlayers.docs)
            batch.delete(p.ref);
        batch.update(ref, { mode: data.mode, selected, state: null, revision: session.revision + 1, ended: false, pointer: null });
        await batch.commit();
        return { ok: true };
    }
    if (action === 'state') {
        if (session.ended || !(teacher || session.mode === 'individual' || session.selected.includes(who.uid)))
            deny();
        let state;
        try {
            state = cleanState(data.state, session.game.rounds.length);
        }
        catch {
            throw new HttpsError('invalid-argument', 'This move could not be saved.');
        }
        // Optimistic revision prevents two selected players from overwriting the same move.
        if (session.mode === 'individual') {
            return db.runTransaction(async tx => {
                const current = (await tx.get(ref)).data();
                if(current.ended || current.mode !== 'individual' || current.revision !== data.revision) throw new HttpsError('aborted', 'The play mode changed. Your board will refresh.');
                tx.set(ref.collection('players').doc(who.uid), { name: who.profile.displayName || 'Player', state, updatedAt: Date.now() });
                return {ok:true};
            });
        }
        return db.runTransaction(async (tx) => { const current = (await tx.get(ref)).data(); if (current.ended || !(teacher || current.selected.includes(who.uid)))
            deny(); if (current.revision !== data.revision)
            throw new HttpsError('aborted', 'Another player has just moved. Your board will refresh.'); tx.update(ref, { state, revision: current.revision + 1, actor: who.uid }); return { ok: true }; });
    }
    if (action === 'pointer') {
        if (!teacher && !session.selected.includes(who.uid))
            deny();
        const x = Number(data.x), y = Number(data.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
            throw new HttpsError('invalid-argument', 'Invalid cursor.');
        await ref.update({ pointer: { x, y, clicked: data.clicked === true, at: Date.now(), by: who.uid } });
        return { ok: true };
    }
    if (action === 'end') {
        if (!teacher)
            deny();
        await ref.update({ ended: true });
        return { ok: true };
    }
    throw new HttpsError('invalid-argument', 'Unknown game action.');
}
