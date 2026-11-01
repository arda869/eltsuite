// Initialise the shared editor graph in the same order as the document page.
import '../pdf/PdfFile';
import { BeliefsForm } from './BeliefsForm';
import { TaskEditor } from '../editor/TaskEditor';
import { reflectionDoc, reflectionText } from './model';
import { NSelect } from '../components/Select';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, doc, getDocs, onSnapshot, runTransaction, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useAppOn } from '../lib/admin';
import { useTeacherClasses } from '../lib/coteach';
import { TopBar } from '../components/TopBar';
import { AppFiles } from '../pages/AppFiles';
import { useMyDocs } from '../lib/sharedDocs';
import { AutoTextarea } from '../ai/AutoTextarea';
import { Qualifications } from './Qualifications';
import { CoachChat } from './CoachChat';
import { download, emptyProfile, newInquiry, newReflection, type CoachProfile, type Inquiry, type Reflection } from './model';
import './coach.css';

type Tab = 'Home' | 'Coach' | 'Reflections' | 'Research' | 'Timeline' | 'Profile & beliefs' | 'Reading';
const tabs: Tab[] = ['Home', 'Reflections', 'Reading', 'Research', 'Coach'];
const sections: Record<Tab, string> = { Home: '', Reading: 'reading', Reflections: 'reflections', Research: 'research', Coach: 'coach', Timeline: 'timeline', 'Profile & beliefs': 'profile' };
const tabFor = (section: string | null): Tab => (Object.keys(sections) as Tab[]).find(k => sections[k] === section) ?? 'Home';
const date = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fieldNames: [keyof Inquiry, string][] = [['title', 'Your classroom question'], ['baseline', 'What happens now?'], ['intervention', 'What small change will you try?'], ['evidence', 'What evidence will you collect, and when?'], ['ethics', 'Consent, anonymity and care'], ['observations', 'What did you observe?'], ['interpretation', 'What might the evidence suggest?'], ['limitations', 'What else could explain it?'], ['next', 'What will you explore next?'], ['sources', 'Research sources: titles, links and your notes']];

export function DevelopmentStudio() {
  const { user } = useAuth();
  const on = useAppOn();
  if (!on('development')) return <div className="development-shell"><TopBar /><main className="coach"><h1>Development Studio</h1><p>This app isn’t available for your account.</p></main></div>;
  return <div className="development-shell"><TopBar />{user && <Workspace key={user.uid} uid={user.uid} />}</div>;
}
function Workspace({ uid }: { uid: string }) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFor(params.get('section')));
  const docs = useMyDocs(uid);
  const readings = [...new Map([...(docs.mine ?? []), ...(docs.withMe ?? [])].map(d => [d.id,d])).values()].filter(d => d.kind === 'pd').sort((a,b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
  useEffect(() => { setTab(tabFor(params.get('section'))); }, [params]);
  function show(next: Tab) { setTab(next); setParams(sections[next] ? { section: sections[next] } : {}); }

  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [profile, setProfile] = useState<CoachProfile>(emptyProfile);
  const [profileDraft, setProfileDraft] = useState<CoachProfile>(emptyProfile);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [editing, setEditing] = useState<Reflection | null>(null);
  const [researchStep, setResearchStep] = useState(0);
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const sourceId = params.get('reading');
    if (!sourceId || editing || dirty) return;
    const source = readings.find(d => d.id === sourceId);
    if (!source) return;
    setEditing({ ...newReflection(), title: `On ${source.title}`.slice(0,160), theme: 'Research to practice', reading: `/doc/${source.id}`, readingTitle: source.title });
    setDirty(true); setParams({ section: 'reflections' }, { replace: true });
  }, [params, docs.mine, docs.withMe]);

  const lessonContext=params.get('classId')&&params.get('itemId')?{classId:params.get('classId')!,itemId:params.get('itemId')!,taskId:params.get('taskId')??'',reportId:params.get('reportId')??''}:undefined;
  const [prompt, setPrompt] = useState('');
  const [entryId, setEntryId] = useState('');
  const lock = useRef(false);
  const { classes } = useTeacherClasses(uid);
  const [classId, setClassId] = useState('');
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    setLessons([]); if (!classId) return;
    let alive = true;
    getDocs(collection(db, 'classes', classId, 'items')).then(s => { if (alive) setLessons(s.docs.map(d => ({ id: d.id, title: d.data().title || 'Untitled lesson' }))); }).catch(() => { if (alive) setError('We couldn’t load the lessons. Try choosing the class again.'); });
    return () => { alive = false; };
  }, [classId]);
  useEffect(() => {
    const fail = () => { setError('We couldn’t load your coaching workspace. Check your connection and try again.'); setReady(false); };
    const loaded = new Set<string>();
    const done = (key: string) => { loaded.add(key); setReady(loaded.size === 3); };
    return (() => {
      const stops = [
        onSnapshot(collection(db, 'teachingCoach', uid, 'reflections'), s => { setReflections(s.docs.map(d => ({ ...d.data(), id: d.id } as Reflection)).sort((a,b) => b.at-a.at)); done('journal'); }, fail),
        onSnapshot(collection(db, 'teachingCoach', uid, 'inquiries'), s => { setInquiries(s.docs.map(d => ({ ...d.data(), id: d.id } as Inquiry)).sort((a,b) => b.at-a.at)); done('research'); }, fail),
        onSnapshot(doc(db, 'teachingCoach', uid, 'settings', 'profile'), s => { const p = { ...emptyProfile, ...s.data() }; setProfile(p); if (!dirtyRef.current) setProfileDraft(p); done('profile'); }, fail),
      ]; return () => stops.forEach(stop => stop());
    })();
  }, [uid]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const canLeave = () => !dirty || window.confirm('Leave these unsaved edits? Save first if you want to keep them.');
  function navigate(next: Tab) { if (busy || !canLeave()) return; show(next); setEditing(null); setInquiry(null); setDirty(false); setNotice(''); if (next === 'Profile & beliefs') setProfileDraft(profile); }
  async function save(kind: 'reflections' | 'inquiries' | 'settings', id: string, value: Reflection | Inquiry | CoachProfile) {
    if (lock.current || !ready) return; lock.current = true; setBusy(true); setError('');
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'teachingCoach', uid, kind, id), old = await tx.get(ref);
        if ((old.data()?.version ?? 0) !== value.version) throw Error('This changed in another window. Export your edits, then reopen the saved version before saving again.');
        tx.set(ref, { ...value, version: value.version + 1 });
      });
      setDirty(false); setEditing(null); setInquiry(null); if (kind === 'settings') setProfileDraft({ ...value as CoachProfile, version: value.version + 1 }); setNotice('Saved privately. Only you can open this.');
    } catch (e) { setError(e instanceof Error && e.message.startsWith('This changed') ? e.message : 'We couldn’t save just now. Check your connection and try again. Your edits are still here.'); }
    finally { setBusy(false); lock.current = false; }
  }
  async function remove(kind: 'reflections' | 'inquiries', id: string) {
    if (busy || !window.confirm(`Delete this ${kind === 'reflections' ? 'reflection' : 'inquiry'}? You can’t undo this.`)) return;
    setBusy(true); setError('');
    try { await deleteDoc(doc(db, 'teachingCoach', uid, kind, id)); setEditing(null); setInquiry(null); setDirty(false); setEntryId(''); setPrompt(''); setNotice('Deleted. The conversation in this window has also been cleared.'); }
    catch { setError('We couldn’t delete that just now. Try again.'); } finally { setBusy(false); }
  }
  const editReflection = (r: Reflection) => { if (!canLeave()) return; setEditing(r); setDirty(false); setNotice(''); };
  const patch = (key: keyof Reflection, value: string) => { setEditing(r => r && ({ ...r, [key]: value })); setDirty(true); };
  const journalResults = reflections.filter(r => `${r.title} ${r.text} ${r.theme} ${r.intention} ${r.reality} ${r.next}`.toLowerCase().includes(search.toLowerCase()));
  const exportAll = () => download('development-studio-export.json', JSON.stringify({ exportedAt: new Date().toISOString(), profile, reflections, inquiries }, null, 2), 'application/json');
  return <main className={'coach' + (tab === 'Coach' ? ' coach-chat-page' : '')}>
    <header className="coach-hero"><div><span className="coach-kicker">Ideas into practice</span><h1>Development Studio</h1><p>Read, reflect and explore your teaching.<br />Bring your professional learning together.</p></div><div className="development-account"><span className="coach-private">Private reflections</span><button className="btn" disabled={busy} onClick={() => navigate('Profile & beliefs')}>Profile and beliefs</button></div></header>
    <nav className="coach-nav" aria-label="Development Studio">{tabs.map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} disabled={busy} onClick={() => navigate(t)}>{t}</button>)}</nav>
    {error && <div role="alert" className="coach-notice coach-error">{error}</div>}{notice && <div role="status" className="coach-notice">{notice}</div>}
    {ready && <div className="coach-chat-host" hidden={tab !== 'Coach'}><CoachChat uid={uid} profile={profile} initialPrompt={prompt||(lessonContext?'Help me think through this activity and identify one useful improvement.':'')} reflectionId={entryId} evidencePacketId={params.get('evidence')||''} lessonContext={lessonContext} onClearLesson={()=>setParams({section:'coach'})} /></div>}
    <div className="studio-section-scroll" hidden={tab === 'Coach'} key={tab}>
    {tab === 'Coach' ? (!ready ? <p role="status">Opening your coach…</p> : null) : tab === 'Reading' ? <AppFiles app="reading" embedded /> : !ready ? <p role="status">Loading your private workspace…</p> : <div className={tab === 'Home' ? "development-home-layout" : "coach-layout"}><section className="coach-panel" aria-label={tab}><fieldset className="coach-content" disabled={busy}>
      {tab === 'Home' && <><div className="coach-row"><div><span className="coach-kicker">Make space for your practice</span><h2>Where would you like to start?</h2></div><button className="btn" onClick={() => navigate('Timeline')}>View my timeline</button></div><div className="development-paths">{[
        { title: 'Reflections', text: 'Write and revisit reflections. Connect your experiences to lessons and reading.', section: 'Reflections' as Tab, number: '01' },
        { title: 'Reading', text: 'Organise books, articles, notes and citations, then reflect on what you’ve read.', section: 'Reading' as Tab, number: '02' },
        { title: 'Research', text: 'Plan a classroom inquiry, collect evidence and reflect on the results.', section: 'Research' as Tab, number: '03' },
        { title: 'Coach', text: 'Chat through teaching questions and dilemmas with your AI coach.', section: 'Coach' as Tab, number: '04' },
      ].map(p => <button className="development-path" key={p.number} onClick={() => navigate(p.section)}><span>{p.number}</span><b>{p.title}</b><p>{p.text}</p><i aria-hidden="true">↗</i></button>)}</div>
      <div className="development-history"><section><div className="coach-row"><h3>Recent reflections</h3><button className="btn" onClick={() => navigate('Reflections')}>View all</button></div>{reflections.length ? reflections.slice(0,3).map(r => <button className="coach-entry" key={r.id} onClick={() => { show('Reflections'); editReflection(r); }}><small>{date(r.at)} · {r.theme}</small><b>{r.title}</b><p>{r.text || r.reality}</p></button>) : <p className="development-empty">A moment from today’s teaching can be a useful place to begin.</p>}</section>
      <section><div className="coach-row"><h3>Continue your reading</h3><button className="btn" onClick={() => navigate('Reading')}>View all</button></div>{readings.length ? readings.slice(0,3).map(d => <article className="development-reading" key={d.id}><b>{d.title}</b><div className="coach-actions"><Link className="btn" to={`/doc/${d.id}`} target="_blank" rel="noreferrer">Open reading</Link><button className="btn" onClick={() => { show('Reflections'); setEditing({ ...newReflection(), title: `On ${d.title}`.slice(0,160), theme: 'Research to practice', reading: `/doc/${d.id}`, readingTitle: d.title }); setDirty(true); }}>Reflect on this</button></div></article>) : <p className="development-empty">Your existing reading journals will appear here. Add a source or return to an idea in Reading.</p>}</section></div>
      {inquiries.length > 0 && <section className="development-inquiries"><div className="coach-row"><h3>Questions you’re exploring</h3><button className="btn" onClick={() => navigate('Research')}>View all</button></div>{inquiries.slice(0,2).map(i => <button className="coach-entry" key={i.id} onClick={() => { show('Research'); setInquiry(i); setResearchStep(0); }}><small>{i.observations ? 'Ready to reconsider' : 'Inquiry in progress'}</small><b>{i.title}</b><p>{i.next || i.intervention}</p></button>)}</section>}
      </>}
      {tab === 'Reflections' && (editing ? <><div className="coach-row"><h2>{editing.version ? 'Revisit your reflection' : 'A moment to reflect'}</h2><button className="btn" disabled={busy} onClick={() => { if (canLeave()) { setEditing(null); setDirty(false); } }}>Back to journal</button></div>
        <label>Title<input value={editing.title} maxLength={160} onChange={e => patch('title', e.target.value)} placeholder="Give this moment a name" /></label>
        <div className="coach-reflection-editor"><p className="hint">Your reflection · Select text to format it, or type / to add an element.</p><TaskEditor key={editing.id} label="Your reflection" content={editing.content ?? reflectionDoc(editing.text)} onChange={content=>{setEditing(current=>current&&({...current,content,text:reflectionText(content)}));setDirty(true);}} placeholder="What happened that made you think?" /></div>
        <div className="coach-prompts">{['What surprised you?', 'What did you notice?', 'What might you explore next?'].map(p => <button key={p} onClick={() => patch('text', `${editing.text}${editing.text ? '\n\n' : ''}${p}\n`)}>{p}</button>)}</div>
        <details open={!!editing.reading}><summary>Connect your reading</summary><label>Reading journal<NSelect aria-label="Reading journal" value={editing.reading ?? ''} onChange={e => { const d = readings.find(d => `/doc/${d.id}` === e.target.value); setEditing({ ...editing, reading: e.target.value, readingTitle: d?.title ?? '' }); setDirty(true); }}><option value="">No reading linked</option>{readings.map(d => <option key={d.id} value={`/doc/${d.id}`}>{d.title}</option>)}</NSelect></label>{editing.reading && <p><Link to={editing.reading} target="_blank" rel="noreferrer">Open {editing.readingTitle || 'linked reading'}</Link></p>}<p className="hint">The coach won’t read the source automatically. Include the passage or idea you want to discuss in your reflection.</p></details>
        <div className="coach-formgrid"><label>Theme<NSelect value={editing.theme} onChange={e => patch('theme', e.target.value)}>{['Open reflection', 'Classroom management', 'Error correction', 'Assessment', 'Motivation', 'Teacher training', 'Lesson plan vs reality', 'Learner voice', 'Research to practice'].map(t => <option key={t}>{t}</option>)}</NSelect></label><label>Link to an inquiry<NSelect value={editing.inquiry} onChange={e => patch('inquiry', e.target.value)}><option value="">No inquiry</option>{inquiries.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</NSelect></label></div>
        <details open={editing.theme === 'Lesson plan vs reality'}><summary>Connect a lesson: plan vs reality</summary><label>Choose a class<NSelect aria-label="Choose a class" value={classId} onChange={e => setClassId(e.target.value)}><option value="">Choose a class</option>{classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</NSelect></label>{classId && <label>Choose a lesson<NSelect aria-label="Choose a lesson" value={editing.lesson} onChange={e => patch('lesson', e.target.value)}><option value="">Choose a lesson</option>{lessons.map(l => <option key={l.id} value={`/class/${classId}/lesson/${l.id}`}>{l.title}</option>)}</NSelect></label>}{editing.lesson && <p><Link to={editing.lesson} target="_blank" rel="noreferrer">Open linked lesson</Link></p>}<label>What did you intend?<textarea value={editing.intention} maxLength={6000} onChange={e => patch('intention', e.target.value)} /></label><label>What actually happened?<textarea value={editing.reality} maxLength={6000} onChange={e => patch('reality', e.target.value)} /></label><label>What might you try next?<textarea value={editing.next} maxLength={6000} onChange={e => patch('next', e.target.value)} /></label></details>
        {editing.theme === 'Learner voice' && <div className="coach-notice">Try asking: “What helped you learn today?”, “Where did you need more thinking time?” and “What would you like to try again?” Adapt these for your learners. Record anonymised themes here, with suitable consent. Don’t add names or treat satisfaction as a measure of teaching quality.</div>}
        <div className="coach-actions"><button className="btn primary" disabled={busy || !editing.title.trim() || !dirty} onClick={() => void save('reflections', editing.id, editing)}>Save reflection</button><button className="btn" disabled={busy || dirty || !editing.version} onClick={() => { setEntryId(editing.id); setPrompt('Help me explore this reflection.'); setEditing(null); show('Coach'); }}>Explore this reflection</button><button className="btn" onClick={() => download('reflection.txt', [editing.title, editing.text, editing.intention, editing.reality, editing.next, editing.readingTitle, editing.reading].filter(Boolean).join('\n\n'))}>Export reflection</button>{editing.version > 0 && <button className="btn" disabled={busy} onClick={() => void remove('reflections', editing.id)}>Delete reflection</button>}</div>
      </> : <><div className="coach-row"><div><span className="coach-kicker">Your words, your perspective</span><h2>My reflective journal</h2></div><button className="btn primary" onClick={() => { editReflection(newReflection()); setDirty(true); }}>Write a reflection</button></div><label>Find a reflection<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your writing or a theme" /></label><div className="coach-list">{journalResults.map(r => <button className="coach-entry" key={r.id} onClick={() => editReflection(r)}><small>{date(r.at)} · {r.theme}</small><b>{r.title}</b><p>{r.text || r.reality || r.intention}</p></button>)}</div>{!journalResults.length && <div className="coach-empty">{search ? 'No reflections match this search.' : 'Your reflections will appear here. Start with one moment from your teaching.'}</div>}</>)}
      {tab === 'Research' && (inquiry ? <><div className="coach-row"><h2>A small, worthwhile inquiry</h2><button className="btn" disabled={busy} onClick={() => { if (canLeave()) { setInquiry(null); setDirty(false); } }}>Back to inquiries</button></div><p>Notice a pattern, try a change, and stay curious about other explanations.</p>{!!inquiry.evidenceLinks?.length&&<section className="coach-panel"><h3>Selected investigation evidence</h3>{inquiry.evidenceLinks.map(link=><p key={link.investigationId}><Link to={"/linguistics?id="+link.investigationId}>Open selected investigation</Link> · {link.purpose}</p>)}</section>}<div className="coach-research-steps" aria-label="Inquiry stages">{['Question and plan', 'Evidence and ethics', 'Reflect and revisit'].map((label,i) => <button key={label} className="coach-mode" aria-pressed={researchStep === i} onClick={() => setResearchStep(i)}>{i+1}. {label}</button>)}</div>{fieldNames.filter(([key]) => (researchStep === 0 ? ['title','baseline','intervention'] : researchStep === 1 ? ['evidence','ethics','sources'] : ['observations','interpretation','limitations','next']).includes(key)).map(([key, label]) => <label key={key}>{label}<textarea aria-label={label} value={String(inquiry[key])} maxLength={6000} placeholder={key === 'title' ? 'Does preparation time change participation in my B1 speaking activities?' : key === 'ethics' ? 'How will you seek consent, avoid identifying learners and allow people to opt out?' : ''} onChange={e => { setInquiry({ ...inquiry, [key]: e.target.value }); setDirty(true); }} /></label>)}<div className="coach-actions"><button className="btn primary" disabled={busy || !dirty || !inquiry.title.trim()} onClick={() => void save('inquiries', inquiry.id, inquiry)}>Save inquiry</button><button className="btn" onClick={() => download('classroom-inquiry.txt', fieldNames.map(([k,l]) => `${l}\n${inquiry[k] || 'Not recorded'}`).join('\n\n') + '\n\nLinked reflections\n' + reflections.filter(r => r.inquiry === inquiry.id).map(r => [r.title, r.text, r.intention, r.reality, r.next, r.lesson, r.readingTitle, r.reading].filter(Boolean).join('\n')).join('\n\n') + '\n\nThese observations are context-specific. A small classroom comparison cannot establish cause and effect.')}>Export inquiry report</button>{inquiry.version > 0 && <button className="btn" disabled={busy} onClick={() => void remove('inquiries', inquiry.id)}>Delete inquiry</button>}</div></> : <><div className="coach-row"><div><span className="coach-kicker">Classroom action research studio</span><h2>Turn curiosity into inquiry</h2></div><button className="btn primary" onClick={() => { setInquiry(newInquiry()); setResearchStep(0); setDirty(true); }}>Plan an inquiry</button></div><p>One question. A manageable change. Evidence you can learn from.</p><div className="coach-list">{inquiries.map(i => <button className="coach-entry" key={i.id} onClick={() => { setInquiry(i); setResearchStep(0); setDirty(false); }}><small>{date(i.at)} · {i.observations ? 'Observations recorded' : 'Inquiry in progress'}</small><b>{i.title}</b><p>{i.next || i.intervention || i.baseline}</p></button>)}</div>{!inquiries.length && <div className="coach-empty">Your inquiries will appear here, alongside the reflections you link to them.</div>}</>)}
      {tab === 'Timeline' && <><span className="coach-kicker">Notice how your thinking changes</span><h2>Threads in your practice</h2><p>A timeline of reflections and inquiries. Return to an earlier thought and decide what it means to you now.</p><div className="coach-timeline">{[...reflections.map(r => ({ ...r, kind: 'Reflection', detail: r.next || r.text, open: () => { show('Reflections'); setEditing(r); } })), ...inquiries.map(i => ({ ...i, kind: 'Inquiry', detail: i.next || i.interpretation, open: () => { show('Research'); setInquiry(i); } }))].sort((a,b) => b.at-a.at).map(r => <article key={r.id}><small>{date(r.at)} · {r.kind}</small><h3>{r.title}</h3><p>{r.detail.slice(0,240)}</p><button className="btn" onClick={r.open}>Revisit</button></article>)}</div>{!reflections.length && !inquiries.length && <div className="coach-empty">Save a reflection or inquiry to begin your timeline. There are no scores or targets.</div>}</>}
      {tab === 'Profile & beliefs' && <><span className="coach-kicker">Your professional context</span><h2>Your teaching, in context</h2><p>Complete your profile and beliefs before chatting with your coach. Qualifications don’t define your expertise. Your coach can use these details by default. You can turn profile or beliefs access off in user Settings.</p>{<Qualifications value={profileDraft.qualifications} onChange={qualifications => { setProfileDraft({ ...profileDraft, qualifications }); setDirty(true); }} />}{(['experience', 'context', 'goals'] as const).map(key => <label key={key}>{{ qualifications: 'Qualifications (including your own description, or none)', experience: 'Years of teaching experience', context: 'Your learners and teaching context', goals: 'Professional goals, specialisms and interests', beliefs: 'What do you believe helps people learn? Where are you uncertain?' }[key]}{key === 'experience' ? <NSelect aria-label="Years of teaching experience" value={profileDraft[key]} onChange={e => { setProfileDraft({ ...profileDraft, [key]: e.target.value }); setDirty(true); }}><option value="">Prefer to add later</option>{['0–2', '3–5', '6–10', '10+'].map(o => <option key={o}>{o}</option>)}</NSelect> : <AutoTextarea maxLength={6000} value={profileDraft[key]} onChange={e => { setProfileDraft({ ...profileDraft, [key]: e.target.value }); setDirty(true); }} />}</label>)}<h3>Your teaching beliefs</h3><BeliefsForm value={profileDraft.beliefs} onChange={beliefs=>{setProfileDraft({...profileDraft,beliefs});setDirty(true);}}/><fieldset><legend>Your roles</legend>{['Teacher', 'Teacher trainer', 'Academic manager'].map(role => <label className="coach-role" key={role}><input type="checkbox" checked={profileDraft.roles.includes(role)} onChange={e => { setProfileDraft({ ...profileDraft, roles: e.target.checked ? [...profileDraft.roles, role] : profileDraft.roles.filter(r => r !== role) }); setDirty(true); }} />{role}</label>)}</fieldset><div className="coach-actions"><button className="btn primary" disabled={!dirty || busy || profileDraft.qualifications.split(',').some(part=>/^other:?\s*$/i.test(part.trim()))} onClick={() => void save('settings', 'profile', profileDraft)}>Save profile and beliefs</button><button className="btn" onClick={() => { setProfileDraft({ ...emptyProfile, version: profileDraft.version }); setDirty(true); }}>Clear fields</button><button className="btn" onClick={() => download('profile-and-beliefs.json', JSON.stringify(profileDraft, null, 2), 'application/json')}>Export these edits</button></div></>}
    </fieldset></section><aside className="coach-aside"><h3>{tab === 'Home' ? 'Your professional focus' : 'Room for uncertainty'}</h3>
      {tab === 'Home' ? <><p>{profile.goals || 'What would you like to understand or develop in your teaching? Start with something that matters to you.'}</p><button className="btn" onClick={() => navigate('Profile & beliefs')}>Edit my focus</button><p className="development-aside-note">Your reflections stay private. Reading journals keep their existing sharing settings. Coach settings let you turn off any context source.</p></> : <><p>What happened is one thing. What it might mean is another. Make room for both.</p><p>Link a reflection to a lesson or inquiry when it helps you see a connection.</p><small>Leave out learner names and identifying details. Small classroom comparisons can suggest possibilities; they don’t prove what caused a change.</small></>}
      <div className="coach-cycle">{['Explore', 'Connect', 'Experiment', 'Reflect', 'Reconsider'].map(s => <span key={s}>{s}</span>)}</div><details><summary>Privacy and your writing</summary><p>Your journal, profile and inquiries are private to your account, including from organisation admins. They are kept until you delete them. Coaching uses your profile, beliefs and relevant writing by default. You can turn each source off in user Settings. Nothing is sent until you send a message. No reminders or automatic follow-ups are sent.</p><p>Saved writing may remain in your browser’s offline cache. Use a trusted device and sign out on shared devices.</p><button className="btn" onClick={exportAll}>Export private writing</button></details>
    </aside></div>}
    </div>
  </main>;
}
