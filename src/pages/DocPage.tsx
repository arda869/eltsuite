import { HelpMenu } from '../help/HelpMenu';
import { tell } from '../lib/ask';
import { copyText } from '../lib/copyText';
import { OrgLogo } from '../components/OrgLook';
import { PdfFile } from '../pdf/PdfFile';
import { Mark } from '../components/Wordmark';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { CollabDoc } from '../collab/CollabDoc';
import { SlidesDoc } from '../collab/slides/SlidesDoc';
import type { CollabMode } from '../collab/suggest';
import { FlashSet } from '../flash/FlashSet';
import { PdReading } from '../pd/PdReading';
import { LessonFile } from '../lessons/LessonFile';
import { CiteStyleContext } from '../editor/Cite';
import { CITE_STYLES, type CiteStyle } from '../lib/cite';
import { Select, NSelect } from '../components/Select';
import { doc as fsDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ROLES, rolesFor, docLink, measureDoc, KIND_LABEL, type DocKind, modesFor, renameDoc, roleOf, sendDocInChat, setMemberRole, shareWith, touchDoc, unshare, useSharedDoc, type DocRole, type SharedDoc } from '../lib/sharedDocs';
import { useDirectory } from '../lib/directory';
import type { Person } from '../lib/chat';
import { UiIcon } from '../components/UiIcon';
import { FileComments } from '../components/FileComments';
import { StoryboardFile } from '../storyboard/StoryboardFile';
import { FileIcon, setFileFavicon } from '../components/FileIcon';
import { AnyFile } from '../components/AnyFile';

import { loadStart } from '../lib/fileStore';
const DesignFile = lazy(() => import('../design/Editor').then((m) => ({ default: m.DesignFile })));

// A collaborative document or slides on a page of its own, in its own tab: the title at the top,
// sharing, and the whole window for writing.

// The same page icon the file has in Resources, so the tab and the file look alike.
export function DocIcon({ kind }: { kind: DocKind }) {
  return (
    <span className="dp-icon" aria-hidden="true">
      <FileIcon kind={kind} size={24} label={false} />
    </span>
  );
}

export function DocPage() {
  const { id = '', key = '' } = useParams();
  const [qs] = useSearchParams();
  const [slot, setSlot] = useState<HTMLSpanElement | null>(null);
  const [setOpen, setSetOpen] = useState(false);
  const { user, profile } = useAuth();
  const d = useSharedDoc(id || undefined);
  const uid = user?.uid ?? auth.currentUser?.uid ?? '';
  const name = (profile?.role === 'learner' ? profile.displayName : user?.displayName || 'Teacher').split(' ')[0];
  const [sharing, setSharing] = useState(false);
  const [title, setTitle] = useState('');
  useEffect(() => setTitle(d?.title ?? qs.get('t') ?? ''), [d?.title, qs]);
  // A lesson's shared document, opened in its own tab.
  const lesson = !!key;
  const kind = (lesson ? (qs.get('kind') === 'slides' ? 'slides' : 'doc') : d?.kind ?? 'doc') as DocKind;
  const role: DocRole | null = lesson ? null : d && uid ? roleOf(d, uid) : null;
  const teacher = lesson ? profile?.role === 'teacher' : d?.owner === uid;
  const modes: CollabMode[] = lesson ? ((qs.get('m') ?? 'edit').split(',').filter(Boolean) as CollabMode[]) : role ? modesFor(role) : ['view'];
  useEffect(() => {
    document.title = `${title || 'Document'} · ELT Suite`;
  }, [title]);
  useEffect(() => setFileFavicon(kind), [kind]);
  // A document made from a Word file starts with its text.
  const [start, setStart] = useState<string | null | undefined>(undefined);
  const startN = !lesson && d?.kind === 'doc' ? d.start ?? 0 : 0;
  useEffect(() => {
    if (!startN || !d) return setStart(null);
    let on = true;
    loadStart(d.id, startN).then((h) => on && setStart(h || null), () => on && setStart(null));
    return () => void (on = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id, startN]);
  useEffect(() => {
    if (d && d.owner === uid && d.kind !== 'file') {
      const m = () => void measureDoc(d);
      const first = window.setTimeout(m, 4000);
      const t = window.setInterval(m, 3 * 60 * 1000);
      window.addEventListener('pagehide', m);
      return () => (window.clearTimeout(first), window.clearInterval(t), window.removeEventListener('pagehide', m));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id, uid]);
  useEffect(() => {
    if (d && role && role !== 'view' && role !== 'comment') {
      const t = window.setInterval(() => touchDoc(d.id), 5 * 60 * 1000);
      return () => window.clearInterval(t);
    }
  }, [d, role]);

  if (!uid) return <div className="dp-msg">Sign in to open this document.</div>;
  if (!lesson && d === undefined) return <div className="dp-msg">Opening…</div>;
  if (!lesson && d && startN && start === undefined) return <div className="dp-msg">Opening…</div>;
  if (!lesson && d?.deletedAt) return <div className="dp-msg">This file is in the recycle bin.<Link to="/archive?show=bin">Open Resources</Link></div>;
  if (!lesson && (d === null || !role)) return <div className="dp-msg">This document isn’t shared with you, or it’s been deleted.<Link to="/">Back to ELT Suite</Link></div>;
  const docKey = lesson ? key : d!.docKey;
  const cite = ((d as { citeStyle?: CiteStyle } | null | undefined)?.citeStyle ?? 'apa') as CiteStyle;
  const classId = lesson ? qs.get('c') ?? '' : '';
  const canRename = !lesson && role === 'edit' && (teacher || !!d?.folder);
  const others = d ? Object.keys(d.members ?? {}).length : 0;
  const props = { docKey, title, modes, teacher, me: { uid, name }, classId, display: 'inline' as const, canDownload: true };
  // The page title, large at the top of the canvas, as in Loop.
  const heading = canRename ? (
    <textarea className="dp-h1" rows={1} value={title} placeholder="Untitled" onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))} onBlur={() => title.trim() !== d!.title && void renameDoc(d!.id, title).catch((e) => { setTitle(d!.title); void tell(e.message); })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())} aria-label="Title" ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
  ) : (
    <h1 className="dp-h1 ro">{title || 'Untitled'}</h1>
  );
  return (
    <div className={'dp k-' + kind}>
      <header className="dp-bar">
        <Link to={profile?.role === 'learner' ? '/' : kind === 'pd' ? '/development?section=reading' : '/archive?s=docs'} className="dp-home" aria-label={kind === 'pd' ? 'Back to Development Studio' : 'Back to ELT Suite'}>
          <Mark size={30} />
        </Link>
        <OrgLogo />
        <span className="dp-kind" aria-hidden="true">
          <DocIcon kind={kind} />
        </span>
        <span className="dp-names">
          {canRename ? (
            <input className="dp-title" size={Math.max(6, title.length + 2)} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() !== d!.title && void renameDoc(d!.id, title)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Title" />
          ) : (
            <span className="dp-title ro">{title || KIND_LABEL[kind]}</span>
          )}
          <span className="dp-sub">
            {lesson ? `${qs.get('cn') ? qs.get('cn') + ' · ' : ''}Shared with the class` : teacher ? (others ? `Shared with ${others} ${others === 1 ? 'person' : 'people'}` : 'Only you') : `${d!.ownerName}’s ${KIND_LABEL[kind].toLowerCase()} · ${ROLES.find((r) => r.k === role)?.label.toLowerCase()}`}
            {d?.classes && Object.keys(d.classes).length > 0 && ` · in ${Object.values(d.classes).map((c) => c.name).join(', ')}`}
          </span>
        </span>
        <span className="dp-acts">
          <HelpMenu />
          {kind === 'pd' && d && profile?.role === 'teacher' && <Link className="btn" to={`/development?section=reflections&reading=${encodeURIComponent(d.id)}`}>Reflect on this reading</Link>}
          {kind === 'doc' && <span ref={setSlot} className="dp-slot" />}
          {d && role && ['flash', 'lesson', 'pdf', 'storyboard'].includes(kind) && <FileComments d={d} role={role} me={{ uid, name }} />}
          {d && teacher && (
            <button type="button" className="btn primary dp-share" onClick={() => setSharing(true)}>
              <UiIcon name="lock" size={15} /> Share
            </button>
          )}
          {d && (
            <button type="button" className="btn small-btn" aria-label="Copy link" onClick={() => void copyText(docLink(d.id))} data-tip="Only people it’s shared with can open it">
              <UiIcon name="link" size={14} /> <span className="dp-hide-phone">Copy link</span>
            </button>
          )}
          {kind === 'doc' && d && (
            <span className="dp-set-wrap">
              <button type="button" className={'dp-ib' + (setOpen ? ' on' : '')} onClick={() => setSetOpen((v) => !v)} aria-label="Settings" data-tip="Document settings" aria-expanded={setOpen}>
                <UiIcon name="settings" size={17} />
              </button>
              {setOpen && (
                <span className="dp-set" role="dialog" aria-label="Document settings">
                  <strong>Document settings</strong>
                  <div className="field">
                    <span>Citation style</span>
                    <Select label="Citation style" value={cite} disabled={role !== 'edit'} search options={CITE_STYLES.map((c) => ({ v: c.k, label: c.label, hint: c.about }))} onChange={(v) => void updateDoc(fsDoc(db, 'sharedDocs', d.id), { citeStyle: v })} />
                  </div>
                  <span className="hint">Citations in the text and the reference list follow this style, and so do the Word and PDF downloads.{role !== 'edit' ? ' Only people who can edit can change it.' : ''}</span>
                </span>
              )}
            </span>
          )}
        </span>
      </header>
      <CiteStyleContext.Provider value={cite}>
        <main className="dp-main">{kind === 'flash' && d ? <FlashSet d={d} canEdit={role === 'edit'} /> : kind === 'pd' && d ? <PdReading d={d} canEdit={role === 'edit'} /> : kind === 'lesson' && d ? <LessonFile d={d} canEdit={role === 'edit'} /> : kind === 'pdf' && d ? <PdfFile d={d} canEdit={role === 'edit'} me={{ uid, name }} /> : kind === 'slides' ? <SlidesDoc {...props} /> : kind === 'storyboard' && d ? <StoryboardFile d={d} canEdit={role === 'edit'} /> : kind === 'file' && d ? <AnyFile d={d} /> : kind === 'design' && d ? <Suspense fallback={<div className="dp-msg">One moment…</div>}><DesignFile d={d} canEdit={role === 'edit'} /></Suspense> : <CollabDoc {...props} template={start ?? null} page heading={heading} toolSlot={slot} />}</main>
      </CiteStyleContext.Provider>
      {sharing && d && <ShareDialog d={d} onClose={() => setSharing(false)} />}
    </div>
  );
}

// Sharing: people and what each can do, with a chat message that carries the link.
export function ShareDialog({ d, onClose }: { d: SharedDoc; onClose: () => void }) {
  const dir = useDirectory();
  return (
    <SharePeople
      roles={rolesFor(d.kind)}
      teachersOnly={!['doc', 'slides', 'pdf', 'file', 'design'].includes(d.kind)}
      title={`Share “${d.title}”`}
      ownerName={d.ownerName}
      members={d.members ?? {}}
      extra={Object.entries(d.classes ?? {}).map(([k, c]) => ({ k, name: c.name, about: `Whole class, in a lesson · ${ROLES.find((r) => r.k === c.role)?.label.toLowerCase()}` }))}
      onShare={async (people, role, tell, note) => {
        await shareWith(d, people, role);
        if (tell && dir) await sendDocInChat(d, dir.me, people, note);
      }}
      onRole={(k, r) => void setMemberRole(d, k, r)}
      onRemove={(k) => void unshare(d, k)}
      onClose={onClose}
    />
  );
}

export function SharePeople({ title, ownerName, members, extra = [], onShare, onRole, onRemove, onClose, chatLabel = 'Send them a message with the link', teachersOnly, noRoles, roles = ROLES }: { roles?: typeof ROLES; teachersOnly?: boolean; noRoles?: boolean; title: string; ownerName: string; members: SharedDoc['members']; extra?: { k: string; name: string; about: string }[]; onShare: (p: Person[], role: DocRole, tell: boolean, note: string) => Promise<void>; onRole?: (uid: string, r: DocRole) => void; onRemove: (uid: string) => void; onClose: () => void; chatLabel?: string }) {
  const dir = useDirectory();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Person[]>([]);
  const [role, setRole] = useState<DocRole>('edit');
  const [tell, setTell] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const people = useMemo(() => {
    const all = new Map<string, Person & { where: string }>();
    for (const g of dir?.groups ?? []) for (const p of g.people) if (p.key !== dir?.me.key && !all.has(p.key) && (!teachersOnly || p.role === 'teacher')) all.set(p.key, { ...p, where: g.label });
    return [...all.values()];
  }, [dir, teachersOnly]);
  const s = q.trim().toLowerCase();
  const found = people.filter((p) => !members?.[p.key] && !picked.some((x) => x.key === p.key) && (!s || `${p.name} ${p.where}`.toLowerCase().includes(s))).slice(0, 8);
  const go = async () => {
    if (!picked.length) return;
    setBusy(true);
    try {
      await onShare(picked, role, tell, note);
      setDone(`Shared with ${picked.map((p) => p.name.split(' ')[0]).join(', ')}.`);
      setPicked([]);
      setNote('');
    } catch (e) {
      console.error(e);
      setDone('We couldn’t share it. Try again.');
    }
    setBusy(false);
  };
  const list = Object.entries(members ?? {});
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dp-dialog" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {teachersOnly && <span className="hint">You can share this with other teachers. Documents, slides, designs, PDFs and uploaded files can also be shared with learners.</span>}
        <div className="dp-add">
          <span className="dp-chips">
            {picked.map((p) => (
              <span key={p.key} className="lang-chip">
                {p.name}
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPicked((x) => x.filter((y) => y.key !== p.key))}>
                  ×
                </button>
              </span>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={picked.length ? 'Add more' : teachersOnly ? 'Colleagues' : 'Colleagues or learners'} aria-label="Find people" autoFocus />
          </span>
          {(s || !picked.length) && found.length > 0 && (
            <span className="dp-found">
              {found.map((p) => (
                <button key={p.key} type="button" onClick={() => (setPicked((x) => [...x, p]), setQ(''))}>
                  <b>{p.name}</b>
                  <span className="hint">{p.role === 'teacher' ? 'Teacher' : 'Learner'} · {p.where}</span>
                </button>
              ))}
            </span>
          )}
        </div>
        {picked.length > 0 && (
          <>
            {!noRoles && <span className="dp-roles" role="radiogroup" aria-label="What they can do">
              {roles.map((r) => (
                <button key={r.k} type="button" role="radio" aria-checked={role === r.k} className={role === r.k ? 'on' : ''} onClick={() => setRole(r.k)}>
                  <b>{r.label}</b>
                  <span className="hint">{r.about}</span>
                </button>
              ))}
            </span>}
            <label className="switch-row">
              <span>
                {chatLabel}
                <span className="hint">In your chat with each of them</span>
              </span>
              <input type="checkbox" checked={tell} onChange={() => setTell((v) => !v)} />
            </label>
            {tell && <textarea aria-label="A note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note (optional)" />}
            <button type="button" className="btn primary" disabled={busy} onClick={() => void go()}>
              {busy ? 'Sharing…' : `Share with ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`}
            </button>
          </>
        )}
        {done && <span className="hint dp-done">{done}</span>}
        <div className="dp-members">
          <span className="dp-mem">
            <b>{ownerName || 'You'}</b>
            <span className="hint">Owner</span>
          </span>
          {list.map(([k, m]) => (
            <span key={k} className="dp-mem">
              <b>{m.name}</b>
              <span className="hint">{m.kind === 'learner' ? 'Learner' : 'Teacher'}</span>
              {noRoles ? <span className="hint">Can edit</span> : onRole ? (
                <NSelect value={m.role} onChange={(e) => onRole(k, e.target.value as DocRole)} aria-label={`What ${m.name} can do`}>
                  {roles.map((r) => (
                    <option key={r.k} value={r.k}>
                      {r.label}
                    </option>
                  ))}
                </NSelect>
              ) : (
                <span className="hint">{ROLES.find((r) => r.k === m.role)?.label}</span>
              )}
              <button type="button" className="btn link small" onClick={() => onRemove(k)}>
                Remove
              </button>
            </span>
          ))}
          {extra.map((x) => (
            <span key={x.k} className="dp-mem">
              <b>{x.name}</b>
              <span className="hint">{x.about}</span>
            </span>
          ))}
        </div>
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
