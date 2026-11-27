import { AccessRow, AddPeople, GeneralAccess, RoleMenu, ShareShell } from '../components/ShareShell';
import { HelpMenu } from '../help/HelpMenu';
import { TopBar } from '../components/TopBar';
import { TextSizeControl } from '../components/TextSizeControl';
import { tell } from '../lib/ask';
import { OrgLogo } from '../components/OrgLook';
import { PdfFile } from '../pdf/PdfFile';
import { Mark } from '../components/Wordmark';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { CollabDoc } from '../collab/CollabDoc';
import type { CollabMode } from '../collab/suggest';
import { FlashSet } from '../flash/FlashSet';
import { PdReading } from '../pd/PdReading';
import { LessonFile } from '../lessons/LessonFile';
import { CiteStyleContext } from '../editor/Cite';
import { CITE_STYLES, type CiteStyle } from '../lib/cite';
import { Select, NSelect } from '../components/Select';
import { doc as fsDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ROLES, rolesFor, docLink, documentAccessLink, openDocumentLink, setDocumentLink, measureDoc, KIND_LABEL, type DocKind, modesFor, renameDoc, roleOf, sendDocInChat, setMemberRole, shareWith, touchDoc, unshare, useSharedDoc, type DocRole, type SharedDoc } from '../lib/sharedDocs';
import { useMyOrg } from '../lib/admin';
import { useDirectory } from '../lib/directory';
import type { Person } from '../lib/chat';
import { UiIcon } from '../components/UiIcon';
import { FileComments } from '../components/FileComments';
import { isImageFile } from '../design/files';
import { FileIcon, setFileFavicon } from '../components/FileIcon';
import { PersonFace } from '../components/avatars';
import { AnyFile } from '../components/AnyFile';
import '../lessons/lessonFileHeader.css';

import { loadStart } from '../lib/fileStore';
const DesignFile = lazy(() => import('../design/DesignerFile').then((m) => ({ default: m.DesignerFile })));

// A collaborative document or slides on a page of its own, in its own tab: the title at the top,
// sharing, and the whole window for writing.

// The same page icon the file has in My Files, so the tab and the file look alike.
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
  const [lessonSlot, setLessonSlot] = useState<HTMLSpanElement | null>(null);
  const [lessonViewSlot, setLessonViewSlot] = useState<HTMLSpanElement | null>(null);
  const [setOpen, setSetOpen] = useState(false);
  const { user, profile } = useAuth();
  const shareToken = qs.get('share') ?? '';
  const [linkRetry, setLinkRetry] = useState(0);
  const [linkState, setLinkState] = useState<'idle' | 'opening' | 'ready' | 'error'>('idle');
  const [linkError, setLinkError] = useState('');
  const d = useSharedDoc(id || undefined, linkRetry);
  const uid = user?.uid ?? auth.currentUser?.uid ?? '';
  useEffect(() => {
    if (!id || !shareToken || !uid) return;
    let current = true;
    setLinkState('opening');
    void openDocumentLink(id, shareToken).then(() => {
      if (current) { setLinkRetry((v) => v + 1); setLinkState('ready'); }
    }).catch((e) => {
      if (current) { setLinkError(String(e?.message || 'This link could not be opened.')); setLinkState('error'); }
    });
    return () => { current = false; };
  }, [id, shareToken, uid]);
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
  if (shareToken && (linkState === 'idle' || linkState === 'opening')) return <div className="dp-msg">Opening shared document…</div>;
  if (shareToken && linkState === 'error' && !role) return <div className="dp-msg">{linkError}<Link to="/">Back to ELT Suite</Link></div>;
  if (!lesson && d === undefined) return <div className="dp-msg">Opening…</div>;
  if (!lesson && d && startN && start === undefined) return <div className="dp-msg">Opening…</div>;
  if (!lesson && d?.deletedAt) return <div className="dp-msg">This file is in the recycle bin.<Link to="/archive?show=bin">Open My Files</Link></div>;
  if (!lesson && (d === null || !role)) return <div className="dp-msg">This document isn’t shared with you, or it’s been deleted.<Link to="/">Back to ELT Suite</Link></div>;
  const docKey = lesson ? key : d!.docKey;
  const cite = ((d as { citeStyle?: CiteStyle } | null | undefined)?.citeStyle ?? 'apa') as CiteStyle;
  const classId = lesson ? qs.get('c') ?? '' : '';
  const canRename = !lesson && role === 'edit' && (teacher || !!d?.folder);
  const others = d ? Object.keys(d.members ?? {}).length : 0;
  const inDesigner = kind === 'design' || !!(d && isImageFile(d));
  const props = { docKey, title, modes, teacher, me: { uid, name }, classId, mediaSpace: lesson ? classId : 'doc:' + d!.id, display: 'inline' as const, canDownload: true };
  // The page title, large at the top of the canvas, as in Loop.
  const heading = canRename ? (
    <textarea className="dp-h1" rows={1} value={title} placeholder="Untitled" onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))} onBlur={() => title.trim() !== d!.title && void renameDoc(d!.id, title).catch((e) => { setTitle(d!.title); void tell(e.message); })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())} aria-label="Title" ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
  ) : (
    <h1 className="dp-h1 ro">{title || 'Untitled'}</h1>
  );
  return (
    <div className={'dp k-' + kind}>
      {kind === 'lesson' ? (
        <TopBar>
          <nav aria-label="Breadcrumb" className="crumbs lf-crumbs">
            <Link to="/archive?s=docs">My Files</Link>
            <span aria-hidden="true">/</span>
            {canRename ? (
              <input className="lf-crumb-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() !== d!.title && void renameDoc(d!.id, title)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Title" />
            ) : (
              <span className="here lf-crumb-title" title={title}>{title || KIND_LABEL[kind]}</span>
            )}
          </nav>
          <span ref={setLessonSlot} className="dp-lesson-slot" />
          <span className="lf-topbar-actions">
            <span ref={setLessonViewSlot} className="lf-view-slot" />
            <TextSizeControl />
            {d && role && <FileComments d={d} role={role} me={{ uid, name }} />}
            {d && teacher && <button type="button" className="btn primary dp-share" data-shared={others > 0 || !!d.link} onClick={() => setSharing(true)}><UiIcon name={others || d.link ? 'groups' : 'lock'} size={15} /> Share</button>}
          </span>
        </TopBar>
      ) : (
      <header className="dp-bar">
<Link to={profile?.role === 'learner' ? '/' : inDesigner ? '/design' : '/archive?s=docs'} className="dp-home" aria-label={inDesigner ? 'Back to Designer' : 'Back to My Files'}>
          <Mark size={30} />
        </Link>
        <OrgLogo />
        <span className="dp-kind" aria-hidden="true"><DocIcon kind={kind} /></span>
        <span className="dp-names">
          {canRename ? (
            <input className="dp-title" size={Math.max(6, title.length + 2)} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() !== d!.title && void renameDoc(d!.id, title)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Title" />
          ) : (
            <span className="dp-title ro">{title || KIND_LABEL[kind]}</span>
          )}
          <span className="dp-sub">
            {kind === 'pd' && <>Reading Journal · </>}
            {lesson ? `${qs.get('cn') ? qs.get('cn') + ' · ' : ''}Shared with the class` : teacher ? (others ? `Shared with ${others} ${others === 1 ? 'person' : 'people'}` : 'Only you') : `${d!.ownerName}’s ${KIND_LABEL[kind].toLowerCase()} · ${ROLES.find((r) => r.k === role)?.label.toLowerCase()}`}
            {d?.classes && Object.keys(d.classes).length > 0 && ` · in ${Object.values(d.classes).map((c) => c.name).join(', ')}`}
          </span>
        </span>
        <span className="dp-acts">
          <HelpMenu />
          {kind === 'doc' && <span ref={setSlot} className="dp-slot" />}
          {kind === 'design' && role === 'edit' && <span ref={setSlot} className="dp-slot dp-dz-slot" />}
          {d && role && ['flash', 'lesson', 'pdf'].includes(kind) && <FileComments d={d} role={role} me={{ uid, name }} />}
          {d && teacher && (
            <button type="button" className="btn primary dp-share" data-shared={others > 0 || !!d.link} onClick={() => setSharing(true)}>
              <UiIcon name={others || d.link ? 'groups' : 'lock'} size={15} /> Share
            </button>
          )}

        </span>
      </header>
      )}
      <CiteStyleContext.Provider value={cite}>
        <main className="dp-main">{kind === 'game' && d ? <div className="dp-msg">Standalone Games have moved into lessons. This saved game is still in My Files and can be added to a lesson task.</div> : kind === 'flash' && d ? <FlashSet d={d} canEdit={role === 'edit'} /> : kind === 'pd' && d ? <PdReading d={d} canEdit={role === 'edit'} /> : kind === 'lesson' && d ? <LessonFile d={d} canEdit={role === 'edit'} headerSlot={lessonSlot} viewSlot={lessonViewSlot} /> : kind === 'pdf' && d ? <PdfFile d={d} canEdit={role === 'edit'} canComment={role === 'edit' || role === 'comment' || role === 'suggest'} me={{ uid, name }} /> : kind === ('slides' as string) || kind === ('storyboard' as string) ? <div className="dp-msg">{kind === ('slides' as string) ? 'Slides are' : 'Storyboards are'} no longer part of ELT Suite.</div> : kind === 'file' && d && !isImageFile(d) ? <AnyFile d={d} /> : d && (kind === 'design' || isImageFile(d)) ? <Suspense fallback={<div className="dp-msg">One moment…</div>}><DesignFile d={d} canEdit={role === 'edit'} toolSlot={kind === 'design' && role === 'edit' ? slot : undefined} /></Suspense> : <CollabDoc {...props} template={start ?? null} page heading={heading} onCitationStyle={d ? ()=>setSetOpen(true) : undefined} toolSlot={slot} />}</main>
      </CiteStyleContext.Provider>

      {setOpen && kind==='doc' && d && <div className="scrim" onClick={()=>setSetOpen(false)} onKeyDown={e=>{if(e.key==='Escape')setSetOpen(false);}}><div className="dialog" role="dialog" aria-modal="true" aria-label="Citation style" onClick={e=>e.stopPropagation()}><h2>Citation style</h2><label className="field"><span>Citation style</span><Select label="Citation style" value={cite} disabled={role!=='edit'} search options={CITE_STYLES.map(c=>({v:c.k,label:c.label,hint:c.about}))} onChange={v=>void updateDoc(fsDoc(db,'sharedDocs',d.id),{citeStyle:v}).catch(e=>void tell(e.message))}/></label><p className="hint">Citations, the reference list and Word and PDF downloads follow this style.{role!=='edit'?' Only people who can edit can change it.':''}</p><button type="button" className="btn" onClick={()=>setSetOpen(false)}>Done</button></div></div>}
      {sharing && d && <ShareDialog d={d} onClose={() => setSharing(false)} />}
    </div>
  );
}

// Sharing: people and what each can do, with a chat message that carries the link.
export function ShareDialog({ d, onClose }: { d: SharedDoc; onClose: () => void }) {
  const dir = useDirectory();
  const org = useMyOrg();
  const live = useSharedDoc(d.id) ?? d;
  const orgOnly = live.kind === 'doc' && !!org && (org.outside === 'org' || org.policy?.docLinks === 'org');
  const allowedTeacherIds = orgOnly ? new Set(Object.keys(org.teachers ?? {})) : undefined;
  return (
    <SharePeople
      roles={rolesFor(live.kind)}
      teachersOnly={!['doc', 'pdf', 'file', 'design'].includes(live.kind)}
      title="Share document"
      itemName={live.title}
      ownerId={live.owner}
      ownerName={live.ownerName}
      members={live.members ?? {}}
      allowedTeacherIds={allowedTeacherIds}
      extra={Object.entries(live.classes ?? {}).map(([k, c]) => ({ k, name: c.name, about: `Whole class, in a lesson · ${ROLES.find((r) => r.k === c.role)?.label.toLowerCase()}` }))}
      accessPanel={live.kind === 'doc' ? <DocumentLinkAccess d={live} org={org} /> : undefined}
      onShare={async (people, role, tell, note) => {
        if (allowedTeacherIds && people.some((p) => p.role === 'teacher' && !allowedTeacherIds.has(p.authUid || p.key))) throw new Error('Your organisation only allows sharing this document with its teachers.');
        await shareWith(live, people, role);
        if (tell && dir) {
          try { await sendDocInChat(live, dir.me, people, note); }
          catch (e) { console.error('Document access was granted, but the chat notification failed', e); return 'The document is shared, but we couldn’t send the message with its link. You can copy the link and send it yourself.'; }
        }
      }}
      onRole={(k, r) => void setMemberRole(live, k, r)}
      onRemove={(k) => void unshare(live, k)}
      onClose={onClose}
      link={live.link?.token ? documentAccessLink(live) : docLink(live.id)}
    />
  );
}

function DocumentLinkAccess({ d, org }: { d: SharedDoc; org: ReturnType<typeof useMyOrg> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inOrg = !!org?.teachers?.[auth.currentUser?.uid || ''];
  const restricted = !!org && (org.policy?.docLinks === 'org' || (!org.policy?.docLinks && org.outside === 'org'));
  const current = d.link?.mode ?? 'off';
  const currentRole = d.link?.role ?? 'view';
  const options: { mode: 'off' | 'org' | 'anyone'; label: string }[] = [
    { mode: 'off', label: 'Restricted' },
    ...(org && inOrg ? [{ mode: 'org' as const, label: org.name }] : []),
    ...(!restricted ? [{ mode: 'anyone' as const, label: 'Anyone with the link' }] : []),
  ];
  const change = async (mode: 'off' | 'org' | 'anyone', role: DocRole = currentRole) => {
    if (busy || (mode === current && (mode === 'off' || role === currentRole))) return;
    setBusy(true); setMessage('');
    try { await setDocumentLink(d.id, mode, role); setMessage(mode === 'off' ? 'Only people with access can open it now.' : 'Link access changed. Copy the link to share it.'); }
    catch (e) { setMessage(String((e as Error)?.message || 'We couldn’t change link access. Try again.')); }
    finally { setBusy(false); }
  };
  return <GeneralAccess open={current !== 'off'} about={current === 'off' ? 'Only people with access can open it with the link' : current === 'org' ? `Teachers in ${org?.name || 'this organisation'} with the link can open it` : 'Anyone signed in to ELT Suite with the link can open it'}>
    <NSelect value={current} disabled={busy} onChange={e => void change(e.target.value as 'off' | 'org' | 'anyone')} aria-label="Who can open it with the link">
      {options.map(({ mode, label }) => <option key={mode} value={mode}>{label}</option>)}
    </NSelect>
    {current !== 'off' && <NSelect value={currentRole} disabled={busy} onChange={e => void change(current, e.target.value as DocRole)} aria-label="What people with the link can do">
      {ROLES.map(r => <option key={r.k} value={r.k}>{r.k === 'suggest' ? 'Suggester' : r.label}</option>)}
    </NSelect>}
    {message && <span className="s2-msg" role="status" style={{ flexBasis: '100%', paddingLeft: 10 }}>{message}</span>}
  </GeneralAccess>;
}

export function SharePeople({ title: _title, itemName, ownerId, ownerName, members, extra = [], accessPanel, allowedTeacherIds, onShare, onRole, onRemove, onClose, chatLabel = 'Notify people', teachersOnly, noRoles, roles = ROLES, link }: { roles?: typeof ROLES; teachersOnly?: boolean; noRoles?: boolean; title: string; itemName?: string; ownerId?: string; ownerName: string; members: SharedDoc['members']; extra?: { k: string; name: string; about: string }[]; accessPanel?: React.ReactNode; allowedTeacherIds?: Set<string>; onShare: (p: Person[], role: DocRole, tell: boolean, note: string) => Promise<void | string>; onRole?: (uid: string, r: DocRole) => void; onRemove: (uid: string) => void; onClose: () => void; chatLabel?: string; link?: string | (() => Promise<string>) }) {
  void _title;
  const dir = useDirectory();
  const [picked, setPicked] = useState<Person[]>([]);
  const [role, setRole] = useState<DocRole>('edit');
  const [tell, setTell] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const people = useMemo(() => {
    const all = new Map<string, Person & { where: string }>();
    for (const g of dir?.groups ?? []) for (const p of g.people) if (p.key !== dir?.me.key && !all.has(p.key) && (!teachersOnly || p.role === 'teacher') && (p.role !== 'teacher' || !allowedTeacherIds || allowedTeacherIds.has(p.authUid || p.key))) all.set(p.key, { ...p, where: g.label });
    return [...all.values()];
  }, [dir, teachersOnly, allowedTeacherIds]);
  const faceId = (memberId: string) => people.find((p) => p.authUid === memberId || p.key === memberId)?.key ?? memberId;
  const go = async () => {
    if (!picked.length) return;
    setBusy(true);
    try {
      const result = await onShare(picked, role, tell, note);
      setDone(result || `Shared with ${picked.map((p) => p.name.split(' ')[0]).join(', ')}.`);
      setPicked([]);
      setNote('');
    } catch (e) {
      console.error(e);
      setDone(e instanceof Error && e.message.startsWith('Your organisation') ? e.message : 'We couldn’t share it just now. Check your connection and try again.');
    }
    setBusy(false);
  };
  const list = Object.entries(members ?? {});
  const me = auth.currentUser?.uid;
  const options = people.filter((p) => !members?.[p.authUid || p.key]).map((p) => ({ key: p.key, name: p.name, sub: `${p.role === 'teacher' ? 'Teacher' : 'Learner'} · ${p.where}`, face: <PersonFace id={p.key} name={p.name} size={36} /> }));
  return (
    <ShareShell name={itemName || 'this file'} onClose={onClose} link={link} help="/guide#share">
      <AddPeople
        placeholder={teachersOnly ? 'Add colleagues' : 'Add colleagues, learners and classes'}
        options={options}
        loading={!!dir?.loading}
        picked={picked.map((p) => ({ key: p.key, name: p.name, face: <PersonFace id={p.key} name={p.name} size={22} /> }))}
        onPick={(o) => { const p = people.find((x) => x.key === o.key); if (p) setPicked((x) => [...x, p]); }}
        onUnpick={(k) => setPicked((x) => x.filter((y) => y.key !== k))}
        roleSelect={noRoles ? undefined : <RoleMenu value={role} roles={roles.map((r) => ({ k: r.k, label: r.label }))} onChange={setRole} label="What they can do" />}
      />
      {dir?.error && <p className="s2-msg err" role="alert">{dir.error} <button type="button" className="s2-link" onClick={dir.retry}>Try again</button></p>}
      {picked.length > 0 ? (
        <div className="s2-send">
          <label className="s2-check"><input type="checkbox" checked={tell} onChange={() => setTell((v) => !v)} />{chatLabel} <span className="s2-msg">in a chat with each of them</span></label>
          {tell && <textarea className="s2-note" aria-label="Message" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message" />}
          <span className="s2-send-acts">
            <button type="button" className="s2-btn" onClick={() => (setPicked([]), setNote(''))}>Cancel</button>
            <button type="button" className="s2-btn primary" disabled={busy} onClick={() => void go()}>{busy ? 'Sharing…' : tell ? 'Send' : 'Share'}</button>
          </span>
        </div>
      ) : (
        <>
          {done && <p className="s2-msg" role="status">{done}</p>}
          <section>
            <h3>People with access</h3>
            <div className="s2-list">
              <AccessRow face={<PersonFace id={ownerId} name={ownerName || 'You'} size={36} />} name={`${ownerName || 'You'}${ownerId && ownerId === me ? ' (you)' : ''}`} right={<span className="s2-fixed">Owner</span>} />
              {list.map(([k, m]) => (
                <AccessRow key={k} face={<PersonFace id={faceId(k)} name={m.name} size={36} />} name={`${m.name}${k === me ? ' (you)' : ''}`} sub={m.kind === 'learner' ? 'Learner' : 'Teacher'} right={noRoles ? <span className="s2-fixed">Editor</span> : <RoleMenu value={m.role} roles={roles.map((r) => ({ k: r.k, label: r.label }))} onChange={onRole ? (r) => onRole(k, r) : undefined} onRemove={() => onRemove(k)} label={`What ${m.name} can do`} />} />
              ))}
              {extra.map((x) => <AccessRow key={x.k} face={<span className="s2-class"><UiIcon name="groups" size={18} /></span>} name={x.name} sub={x.about} />)}
            </div>
          </section>
          {accessPanel ?? <GeneralAccess open={false} about="Only people with access can open it with the link"><span className="s2-fixed" style={{ fontWeight: 600, color: 'var(--ink)', paddingLeft: 10 }}>Restricted</span></GeneralAccess>}
        </>
      )}
    </ShareShell>
  );
}
