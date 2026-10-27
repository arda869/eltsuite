import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { classDates, type ClassDoc, type Item } from '../lib/classes';
import type { Learner } from '../lib/learners';
import { itemResult, useClassAnswers } from '../lib/reports';
import { currentOrg, levelsFor } from '../lib/admin';
import { Bars, Tile } from '../pages/AdminOverview';
import { Select } from './Select';
import { UiIcon } from './UiIcon';
import { ask } from '../lib/ask';
import { PdfPreview } from './PdfPreview';
import { pdfName } from '../lib/pdfMake';

// A portfolio for each learner in the class: their results over the course, the work they handed
// in, pieces the teacher keeps for them with the skill they show, a level for each skill, and the
// teacher's summary. As a PDF for learners, parents or the organisation.

export const SKILLS = ['Speaking', 'Listening', 'Reading', 'Writing', 'Grammar', 'Vocabulary', 'Pronunciation'];
type Piece = { id: string; kind: 'piece'; learnerId: string; title: string; note: string; skill: string; at: number; by: string };
type Profile = { kind: 'profile'; learnerId: string; summary?: string; skills?: Record<string, string> };
type FileRec = { id: string; learnerId: string; name: string; type: string; size: number; at: number };

const col = (classId: string) => collection(db, 'classes', classId, 'portfolio');
const when = (ms: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function PortfolioTab({ c, learners, items }: { c: ClassDoc; learners: Learner[]; items: Item[] }) {
  const { user } = useAuth();
  const answers = useClassAnswers(c.id);
  const [docs, setDocs] = useState<(Piece | (Profile & { id: string }))[]>([]);
  const [files, setFiles] = useState<FileRec[]>([]);
  const [sel, setSel] = useState('');
  useEffect(() => onSnapshot(col(c.id), (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Piece, 'id'>) }))), () => setDocs([])), [c.id]);
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'classes', c.id, 'files'),
        (s) => setFiles(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FileRec, 'id'>), at: d.data().createdAt?.toMillis?.() ?? 0 })).filter((f) => typeof f.name === 'string' && !('part' in f))),
        () => setFiles([]),
      ),
    [c.id],
  );
  const roster = useMemo(() => [...learners].sort((a, b) => a.displayName.localeCompare(b.displayName)), [learners]);
  const cur = roster.find((l) => l.id === sel) ?? roster[0];
  const avgOf = (l: Learner) => {
    const rs = items.map((i) => itemResult(i, answers.filter((a) => a.learnerUid === l.authUid))).filter((r) => r.pct !== null);
    return rs.length ? Math.round(rs.reduce((s, r) => s + (r.pct ?? 0), 0) / rs.length) : null;
  };
  if (!roster.length) return <p className="hint pf-empty">Add learners to the class, and each one gets a portfolio here.</p>;
  return (
    <div className="pf">
      <nav className="pf-list" aria-label="Learners">
        {roster.map((l) => {
          const a = avgOf(l);
          const n = docs.filter((d) => d.kind === 'piece' && d.learnerId === l.id).length;
          return (
            <button key={l.id} type="button" className={l.id === cur?.id ? 'on' : ''} aria-current={l.id === cur?.id ? 'true' : undefined} onClick={() => setSel(l.id)}>
              <span className="pf-av" aria-hidden="true">{l.displayName.trim().slice(0, 1).toUpperCase()}</span>
              <span className="pf-who">
                <b>{l.displayName}</b>
                <span className="hint">{[a === null ? '' : `${a}%`, n ? `${n} kept` : ''].filter(Boolean).join(' · ') || 'Nothing yet'}</span>
              </span>
            </button>
          );
        })}
      </nav>
      {cur && user && <LearnerPortfolio key={cur.id} c={c} l={cur} items={items} answers={answers.filter((a) => a.learnerUid === cur.authUid)} docs={docs.filter((d) => d.learnerId === cur.id)} files={files.filter((f) => f.learnerId === cur.id)} me={user.uid} avg={avgOf(cur)} />}
    </div>
  );
}

function LearnerPortfolio({ c, l, items, answers, docs, files, me, avg }: { c: ClassDoc; l: Learner; items: Item[]; answers: ReturnType<typeof useClassAnswers>; docs: (Piece | (Profile & { id: string }))[]; files: FileRec[]; me: string; avg: number | null }) {
  const pieces = docs.filter((d): d is Piece => d.kind === 'piece').sort((a, b) => b.at - a.at);
  const profile = docs.find((d) => d.kind === 'profile') as (Profile & { id: string }) | undefined;
  const [adding, setAdding] = useState(false);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const [busy, setBusy] = useState('');
  const levels = levelsFor(currentOrg()).filter((x) => x !== 'Mixed');
  // Results across the course, in the order they were handed in.
  const results = items
    .map((i) => ({ i, r: itemResult(i, answers) }))
    .filter((x) => x.r.pct !== null)
    .sort((a, b) => (a.r.submittedAt ?? 0) - (b.r.submittedAt ?? 0));
  const done = items.filter((i) => ['submitted', 'marked'].includes(itemResult(i, answers).status)).length;
  // Long answers the teacher marked, with the comment.
  const marked = answers.flatMap((a) =>
    Object.values(a.marks ?? {})
      .filter((m) => m.comment?.trim() || m.score !== null)
      .map((m) => ({ title: items.find((i) => i.id === a.itemId)?.title ?? 'A lesson', comment: m.comment ?? '', score: m.score, at: a.submittedAt ?? 0 })),
  );
  const timeline = [
    ...pieces.map((p) => ({ at: p.at, k: 'piece' as const, p })),
    ...files.map((f) => ({ at: f.at, k: 'file' as const, f })),
    ...marked.map((m) => ({ at: m.at, k: 'mark' as const, m })),
  ].sort((a, b) => b.at - a.at);
  const saveProfile = (p: Partial<Profile>) => void setDoc(doc(col(c.id), 'p_' + l.id), { kind: 'profile', learnerId: l.id, learnerUid: l.authUid, ...p }, { merge: true });
  const makePdf = async () => {
    setBusy('Making the portfolio…');
    try {
      const [{ htmlToPdf }, { brandMark }] = await Promise.all([import('../lib/folderExport'), import('../lib/brand')]);
      const skills = Object.entries(profile?.skills ?? {}).filter(([, v]) => v);
      const html = `<h1>${esc(l.displayName)}</h1><p style="text-align:center;color:#6f6a64">${esc([c.name, c.level, classDates(c)].filter(Boolean).join(' · '))}</p>
        <h2>At a glance</h2><table><tr><th>Average</th><th>Lessons completed</th><th>Work kept</th><th>Handed in</th></tr><tr><td>${avg === null ? '–' : avg + '%'}</td><td>${done} of ${items.length}</td><td>${pieces.length}</td><td>${files.length}</td></tr></table>
        ${skills.length ? `<h2>Skills</h2><table>${skills.map(([s, v]) => `<tr><td>${esc(s)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
        ${profile?.summary ? `<h2>From the teacher</h2><p>${esc(profile.summary).replace(/\n/g, '<br>')}</p>` : ''}
        ${results.length ? `<h2>Results</h2><table><tr><th>Lesson</th><th>Score</th><th>Handed in</th></tr>${results.map(({ i, r }) => `<tr><td>${esc(i.title)}</td><td>${r.pct}%</td><td>${when(r.submittedAt ?? 0)}</td></tr>`).join('')}</table>` : ''}
        ${pieces.length ? `<h2>Work kept</h2>${pieces.map((p) => `<h3>${esc(p.title)}</h3><p style="color:#6f6a64">${esc([p.skill, when(p.at)].filter(Boolean).join(' · '))}</p>${p.note ? `<p>${esc(p.note).replace(/\n/g, '<br>')}</p>` : ''}`).join('')}` : ''}
        ${marked.length ? `<h2>Teacher comments on writing</h2>${marked.map((m) => `<p><b>${esc(m.title)}</b>${m.score !== null ? ` · ${m.score}` : ''}<br>${esc(m.comment)}</p>`).join('')}` : ''}`;
      const bytes = await htmlToPdf(html, await brandMark().catch(() => null));
      setPdf({ bytes, name: pdfName(l.displayName, c.name, 'Portfolio') });
      setBusy('');
    } catch (e) {
      console.error(e);
      setBusy('The PDF could not be made. Try again.');
    }
  };
  return (
    <section className="pf-main" aria-label={`${l.displayName}'s portfolio`}>
      <header className="pf-head">
        <span className="pf-av big" aria-hidden="true">{l.displayName.trim().slice(0, 1).toUpperCase()}</span>
        <span className="pf-who">
          <h2>{l.displayName}</h2>
          <span className="hint">{[c.name, classDates(c)].filter(Boolean).join(' · ')}</span>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn small-btn" onClick={() => setAdding(true)}>
          <UiIcon name="plus" size={14} /> Keep a piece of work
        </button>
        <button type="button" className="btn small-btn primary" disabled={!!busy} onClick={() => void makePdf()}>
          <UiIcon name="import" size={14} /> PDF
        </button>
      </header>
      {busy && <span className="hint">{busy}</span>}
      <div className="ov-tiles">
        <Tile n={avg === null ? '–' : `${avg}%`} label="average" sub={results.length ? `over ${results.length} marked` : 'Nothing marked yet'} />
        <Tile n={done} label="lessons completed" sub={`of ${items.length}`} />
        <Tile n={pieces.length} label="pieces kept" />
        <Tile n={files.length} label="handed in" />
      </div>
      <div className="ov-grid">
        <section className="ov-card">
          <header>
            <h2>Results over the course</h2>
          </header>
          <Bars data={results.slice(-12).map(({ i, r }) => ({ label: i.title.slice(0, 14), n: r.pct ?? 0, tip: `${i.title}: ${r.pct}%` }))} unit="%" />
        </section>
        <section className="ov-card">
          <header>
            <h2>Skills</h2>
            <span className="hint">The level you see now</span>
          </header>
          <div className="pf-skills">
            {SKILLS.map((s) => (
              <span key={s} className="pf-skill">
                <span>{s}</span>
                <Select value={profile?.skills?.[s] ?? ''} options={[{ v: '', label: 'Not set' }, ...levels.map((x) => ({ v: x, label: x }))]} onChange={(v) => saveProfile({ skills: { ...(profile?.skills ?? {}), [s]: v } })} label={`${s} level`} />
              </span>
            ))}
          </div>
        </section>
        <section className="ov-card wide">
          <header>
            <h2>From the teacher</h2>
            <span className="hint">In the PDF, above the results</span>
          </header>
          <textarea className="pf-summary" defaultValue={profile?.summary ?? ''} placeholder={`How ${l.displayName.split(' ')[0]} is doing, what has improved and what to work on next.`} rows={4} onBlur={(e) => e.target.value !== (profile?.summary ?? '') && saveProfile({ summary: e.target.value })} />
        </section>
        <section className="ov-card wide">
          <header>
            <h2>Over the course</h2>
          </header>
          {timeline.length ? (
            <ol className="pf-time">
              {timeline.map((t, i) => (
                <li key={i} className={'k-' + t.k}>
                  <span className="pf-dot" aria-hidden="true" />
                  <span className="pf-when">{when(t.at)}</span>
                  {t.k === 'piece' ? (
                    <span className="pf-what">
                      <b>{t.p.title}</b>
                      <span className="hint">{t.p.skill ? `${t.p.skill} · ` : ''}kept by the teacher</span>
                      {t.p.note && <span>{t.p.note}</span>}
                      <button type="button" className="btn link small" onClick={() => void ask(`Remove “${t.p.title}” from the portfolio?`, { ok: 'Remove' }).then((ok) => ok && void deleteDoc(doc(col(c.id), t.p.id)))}>
                        Remove
                      </button>
                    </span>
                  ) : t.k === 'file' ? (
                    <span className="pf-what">
                      <b>{t.f.name}</b>
                      <span className="hint">Handed in</span>
                    </span>
                  ) : (
                    <span className="pf-what">
                      <b>{t.m.title}</b>
                      <span className="hint">Writing marked{t.m.score !== null ? ` · ${t.m.score}` : ''}</span>
                      {t.m.comment && <span>{t.m.comment}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">Work handed in, marked writing and pieces you keep show here as the course goes on.</p>
          )}
        </section>
      </div>
      {adding && <AddPiece onClose={() => setAdding(false)} onSave={(p) => void setDoc(doc(col(c.id)), { kind: 'piece', learnerId: l.id, learnerUid: l.authUid, by: me, at: Date.now(), createdAt: serverTimestamp(), ...p }).then(() => setAdding(false))} />}
      {pdf && <PdfPreview bytes={pdf.bytes} name={pdf.name} onClose={() => setPdf(null)} />}
    </section>
  );
}

function AddPiece({ onClose, onSave }: { onClose: () => void; onSave: (p: { title: string; note: string; skill: string }) => void }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [skill, setSkill] = useState('');
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Keep a piece of work">
        <h2>Keep a piece of work</h2>
        <label className="field">
          What it is
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Presentation about a city" maxLength={100} />
        </label>
        <label className="field">
          Skill
          <Select value={skill} options={[{ v: '', label: 'No skill' }, ...SKILLS.map((s) => ({ v: s, label: s }))]} onChange={setSkill} label="Skill" />
        </label>
        <label className="field">
          Your note
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="What it shows, and what to work on next." />
        </label>
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), note: note.trim(), skill })}>
            Keep it
          </button>
        </span>
      </div>
    </div>
  );
}

// For a learner: their own portfolio entries (read only).
export function useMyPortfolio(classId: string, uid?: string) {
  const [list, setList] = useState<Piece[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(col(classId), where('learnerUid', '==', uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Piece, 'id'>) })).filter((p) => p.kind === 'piece')), () => setList([]));
  }, [classId, uid]);
  return list;
}
