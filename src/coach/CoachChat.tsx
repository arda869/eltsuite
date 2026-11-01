import { BeliefsForm } from './BeliefsForm';
import { reflectionDoc } from './model';
import { NSelect } from '../components/Select';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../lib/firebase';
import { profileComplete, beliefsComplete } from '../../functions/ai/coach-context.js';
import { type CoachProfile } from './model';
import { Link } from 'react-router-dom';
import { newReflection } from './model';
import { Qualifications } from './Qualifications';
import { AutoTextarea } from '../ai/AutoTextarea';
import { useCoachPreferences } from './CoachPreferences';

export type LessonCoachContext={classId:string;itemId:string;taskId?:string;reportId?:string};
type Source={title:string;url:string};
type Message = { sources?:Source[]; role: 'teacher' | 'coach'; text: string; basis?: string[]; journalDraft?: string | null };
const call = httpsCallable<Record<string, unknown>, { reply: string; basis: string[]; journalDraft?: string | null; sources?:Source[] }>(getFunctions(app, 'us-central1'), 'lessonAssistant', { timeout: 240000 });

export function CoachChat({ uid, profile, initialPrompt, reflectionId, lessonContext, onClearLesson }: {
  uid: string; profile: CoachProfile; initialPrompt: string; reflectionId: string; lessonContext?:LessonCoachContext; onClearLesson?:()=>void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(initialPrompt);
  const { value: preferences, ready: preferencesReady } = useCoachPreferences(uid);
  const mode = preferences.mode;
  const [busy, setBusy] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [error, setError] = useState('');
  const [journal,setJournal] = useState<{id:string;title:string;text:string}|null>(null);
  const [journalSaving,setJournalSaving] = useState(false);
  const [journalSaved,setJournalSaved] = useState('');
  const review = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const thread = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const lock = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const complete = !!lessonContext || (profileComplete(profile) && beliefsComplete(profile));

  useLayoutEffect(() => { generation.current++; setMessages([]); request.current = null; setJournal(null); }, [preferences.version,profile.version,JSON.stringify(lessonContext)]);
  useEffect(() => { setDraft(initialPrompt); }, [initialPrompt, reflectionId]);
  useEffect(()=>{if(journal && review.current && !review.current.open) review.current.showModal();},[journal]);
  useEffect(() => { if (thread.current) thread.current.scrollTop = thread.current.scrollHeight; }, [messages, busy, complete]);
  useEffect(() => { const input = composer.current; if (!busy && complete && input && input.offsetParent !== null) input.focus(); }, [busy, complete]);
  useEffect(() => {
    if (!composer.current) return;
    composer.current.style.height = 'auto';
    composer.current.style.height = `${Math.min(160, Math.max(36, composer.current.scrollHeight))}px`;
  }, [draft]);

  async function send() {
    if (!draft.trim() || lock.current || !complete || !preferencesReady) return;
    lock.current = true; setBusy(true); setError('');
    const turnGeneration = generation.current;
    const text = draft.trim(); setPendingText(text);
    const history = messages.slice(-16).map(m => ({ role: m.role, text: (m.text+(m.journalDraft?'\nJournal draft:\n'+m.journalDraft:'')).slice(0,6000) }));
    const payload = { action: 'coach', contextVersion: 2, mode, prompt: text, history, useProfile: true, useBeliefs: true, entryId: reflectionId, researchId: '', ...(lessonContext?{lessonContext}:{}) };
    while (new TextEncoder().encode(JSON.stringify(payload)).length > 40000 && history.length) history.splice(0,2);
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const result = (await call({ ...payload, requestId: request.current.id })).data;
      if(turnGeneration !== generation.current) return;
      setMessages(current => [...current, { role: 'teacher', text }, { role: 'coach', text: result.reply, basis: result.basis, journalDraft: result.journalDraft, sources:result.sources }]);
      setDraft(''); request.current = null;
    } catch (e) { setError((e as Error).message || 'We couldn’t send that just now. Your message is still here.'); }
    finally { setPendingText(''); setBusy(false); lock.current = false; composer.current?.focus(); }
  }
  async function saveJournal() {
    if(!journal || journalSaving) return;
    setJournalSaving(true); setError('');
    try { await runTransaction(db,async tx=>{
      const ref=doc(db,'teachingCoach',uid,'reflections',journal.id), existing=await tx.get(ref);
      if(!existing.exists()) tx.set(ref,{...newReflection(),id:journal.id,title:journal.title.trim(),text:journal.text.trim(),content:reflectionDoc(journal.text),version:1});
    }); setJournal(null);setJournalSaved('Saved privately to Reflections.'); }
    catch {setError('We couldn’t save your reflection. Your edits are still here.');}
    finally {setJournalSaving(false);}
  }
  function newChat() { setJournal(null); setJournalSaved(''); setMessages([]); setDraft(''); setError(''); request.current = null; }
  const canSend = complete && preferencesReady && !busy && !!draft.trim();
  return <section className="coach-chat" aria-label="Teaching coach chat">
    <header className="coach-chat-header"><div><span className="coach-kicker">Your thinking partner</span><h2>Teaching coach</h2></div><div className="coach-chat-tools"><button className="btn" disabled={busy || !messages.length} onClick={newChat}>New chat</button><Link className="btn" to="/settings#set-teaching-coach">Settings</Link></div></header>
    {lessonContext&&<aside className="coach-notice" aria-label="Selected teaching context"><p>The selected lesson{lessonContext.reportId?' and saved learner report':''} will be included when you send. Only material you can access is used.</p><Link to={`/class/${lessonContext.classId}/lesson/${lessonContext.itemId}${lessonContext.taskId?'?task='+lessonContext.taskId:''}`}>Open selected lesson</Link> <button className="btn" disabled={busy} onClick={onClearLesson}>Remove lesson context</button></aside>}
    {error && <p className="coach-notice coach-error" role="alert">{error}</p>}
    {!lessonContext && !profileComplete(profile) ? <div className="coach-chat-onboarding"><div className="coach-chat-greeting"><span className="coach-chat-avatar" aria-hidden="true">C</span><div><h3>Let’s start with your teaching</h3><p>Before we chat, add a few details so I can understand your work. Your qualifications aren’t a measure of your expertise.</p></div></div><ProfileSetup uid={uid} profile={profile} /></div> : !lessonContext && !beliefsComplete(profile) ? <div className="coach-chat-onboarding"><div className="coach-chat-greeting"><span className="coach-chat-avatar" aria-hidden="true">C</span><div><h3>What guides your teaching?</h3><p>Add your teaching beliefs before we begin. A few honest sentences are enough, and it’s fine to be uncertain.</p></div></div><BeliefsSetup uid={uid} profile={profile} /></div> : <>
      <div className="coach-chat-thread" ref={thread} tabIndex={0} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Home'||e.key==='End')){e.preventDefault();e.currentTarget.scrollTop=e.key==='Home'?0:e.currentTarget.scrollHeight;}}} role="log" aria-label="Conversation with your teaching coach" aria-live="polite" aria-relevant="additions">
        <article className="coach-chat-message coach-chat-message-coach"><strong>Teaching coach</strong><p>{lessonContext?'Your selected teaching context is ready. Tell me what you would like to explore or improve.':'What would you like to think through today? We can reflect on a lesson, explore a teaching belief, or plan a classroom inquiry.'}</p></article>
        {messages.map((m,i) => <article key={i} className={`coach-message coach-chat-message coach-chat-message-${m.role}`}><strong>{m.role === 'teacher' ? 'You' : 'Teaching coach'}</strong><div>{m.text}</div>{m.journalDraft && <button className="btn" onClick={()=>{setJournal({id:crypto.randomUUID(),title:'A reflection from my coaching conversation',text:m.journalDraft!});setJournalSaved('');}}>Review journal draft</button>}{!!m.sources?.length&&<ul aria-label="Teaching sources">{m.sources.map((source,j)=><li key={j}><Link to={source.url}>{source.title}</Link></li>)}</ul>}{!!m.basis?.length && <details className="coach-chat-basis"><summary>Context used</summary><ul>{m.basis.map((basis,j) => <li key={j}>{basis}</li>)}</ul></details>}</article>)}
        {busy && <><article className="coach-chat-message coach-chat-message-teacher"><strong>You</strong><div>{pendingText}</div></article><div className="coach-chat-typing" role="status"><span className="coach-thinking-dots" aria-hidden="true"><i/><i/><i/></span><span>Your coach is thinking</span></div></>}
      </div>
      <div className="coach-chat-bottom">
        <form className="coach-chat-composer" onSubmit={e => { e.preventDefault(); void send(); }}><label className="coach-chat-input-label"><span className="sr-only">Message your coach</span><textarea ref={composer} aria-label="Message your coach" rows={1} maxLength={6000} value={draft} disabled={busy} placeholder="Message your coach…" onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend) void send(); } }} /></label><button className="btn primary" type="submit" disabled={!canSend}>{busy ? 'Sending…' : 'Send'}</button></form>
        <div className="coach-chat-footer"><small>Enter to send · Shift + Enter for a new line</small></div>
      </div>
    </>}
    {journal && <dialog ref={review} className="coach-journal-review" aria-label="Review journal draft" onCancel={e=>{e.preventDefault();if(!journalSaving)setJournal(null);}}><form onSubmit={e=>{e.preventDefault();void saveJournal();}}><h3>Your journal draft</h3><p>Make this your own before saving it to Reflections.</p><label>Reflection title<input autoFocus required disabled={journalSaving} maxLength={160} value={journal.title} onChange={e=>setJournal({...journal,title:e.target.value})}/></label><label>Your reflection<AutoTextarea aria-label="Your reflection" required maxLength={12000} value={journal.text} disabled={journalSaving} onChange={e=>setJournal({...journal,text:e.target.value})}/></label><div className="coach-actions"><button className="btn" type="button" disabled={journalSaving} onClick={()=>setJournal(null)}>Back to chat</button><button className="btn primary" disabled={journalSaving||!journal.title.trim()||!journal.text.trim()}>{journalSaving?'Saving…':'Save to reflections'}</button></div>{error&&<p role="alert">{error}</p>}</form></dialog>}
    {journalSaved&&<p role="status" className="coach-journal-saved">{journalSaved}</p>}
  </section>;
}

function ProfileSetup({ uid, profile }: { uid: string; profile: CoachProfile }) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (saving || !profileComplete(draft)) return;
    setSaving(true); setError('');
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db,'teachingCoach',uid,'settings','profile');
        const current = await tx.get(ref);
        if ((current.data()?.version ?? 0) !== draft.version) throw Error('Your profile changed in another window. Reopen the coach before saving.');
        tx.set(ref, { ...draft, version: draft.version + 1 });
      });
    } catch (e) { setError((e as Error).message || 'We couldn’t save your profile. Your answers are still here.'); }
    finally { setSaving(false); }
  }
  return <form className="coach-setup-form" onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={saving}><legend>Your teaching profile</legend><div className="coach-formgrid"><Qualifications value={draft.qualifications} onChange={qualifications => setDraft({ ...draft, qualifications })} /><label>Teaching experience<NSelect aria-label="Teaching experience" required value={draft.experience} onChange={e => setDraft({ ...draft, experience: e.target.value })}><option value="">Choose your experience</option>{['0–2','3–5','6–10','10+'].map(n => <option key={n} value={n}>{n} years</option>)}</NSelect></label></div><fieldset className="coach-setup-roles"><legend>Your teaching roles</legend>{['Teacher','Teacher trainer','Academic manager'].map(role => <label className="coach-role" key={role}><input type="checkbox" checked={draft.roles.includes(role)} onChange={e => setDraft({ ...draft, roles: e.target.checked ? [...draft.roles,role] : draft.roles.filter(r => r !== role) })} />{role}</label>)}</fieldset><label>Who do you teach?<AutoTextarea aria-label="Who do you teach?" maxLength={6000} required value={draft.context} placeholder="For example, adults at B1, young learners, or trainee teachers" onChange={e => setDraft({ ...draft, context: e.target.value })} /></label>{error && <p role="alert" className="coach-error">{error}</p>}{!profileComplete(draft)&&<p className="hint">Choose your qualifications, experience and at least one teaching role, then describe who you teach.</p>}<button className="btn primary" disabled={saving || !profileComplete(draft)}>{saving ? 'Saving…' : 'Continue to teaching beliefs'}</button><p className="hint">You can edit this later and control what the coach uses in Settings.</p></fieldset></form>;
}

function BeliefsSetup({ uid, profile }: { uid: string; profile: CoachProfile }) {
  const [beliefs,setBeliefs] = useState(profile.beliefs);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  async function save() {
    if(saving || !beliefsComplete({beliefs})) return;
    setSaving(true); setError('');
    try { await runTransaction(db,async tx=>{
      const ref=doc(db,'teachingCoach',uid,'settings','profile'), current=await tx.get(ref);
      if((current.data()?.version??0)!==profile.version) throw Error('Your profile changed in another window. Reopen the coach before saving.');
      tx.set(ref,{...current.data(),beliefs:beliefs.trim(),version:profile.version+1});
    }); } catch(e) { setError((e as Error).message || 'We couldn’t save your beliefs. Your writing is still here.'); }
    finally { setSaving(false); }
  }
  return <form className="coach-setup-form" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={saving}><legend>Your teaching beliefs</legend><BeliefsForm value={beliefs} onChange={setBeliefs} disabled={saving}/>{error&&<p role="alert" className="coach-error">{error}</p>}{!beliefsComplete({beliefs})&&<p className="hint">Add a short response to each teaching-beliefs question to continue.</p>}<button className="btn primary" disabled={saving||!beliefsComplete({beliefs})}>{saving?'Saving…':'Save beliefs and start chatting'}</button></fieldset></form>;
}
