import { teacherPanel } from '../ai/teacherPanel';
import {coachContextOnPage,coachPageSnapshot} from './pageContext';
import {coachHistoryKey} from '../../functions/ai/coach-history.js';
import {lastConversation,rememberConversation,readDraft,saveDraft,useConversations,type CoachContext} from './conversations';
import {setCoachPanel} from './panelState';
import { AiButton, AiMark } from '../components/AiMark';
import { UiIcon } from '../components/UiIcon';
import {CoachEvidenceReview} from '../linguistics/CoachEvidenceReview';
import { reflectionDoc } from './model';
import { useEffect, useRef, useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../lib/firebase';
import { profileComplete, beliefsComplete } from '../../functions/ai/coach-context.js';
import { type CoachProfile } from './model';
import { Link, useLocation } from 'react-router-dom';
import { newReflection } from './model';
import { AutoTextarea } from '../ai/AutoTextarea';
import { AiExamples, AiNotice, AiText } from '../ai/kit';
import { useCoachPreferences } from './CoachPreferences';
import { ask } from '../lib/ask';

const STARTERS=['Help me think through a lesson that didn’t go to plan','I want to try something new with a mixed-ability class','Challenge one of my teaching beliefs','Plan a small classroom inquiry for this term'];
export type LessonCoachContext={classId:string;itemId:string;taskId?:string;reportId?:string};
type Source={title:string;url:string};
const matchesAttachment=(attached:LessonCoachContext,visible:LessonCoachContext)=>attached.classId===visible.classId&&attached.itemId===visible.itemId&&(!attached.taskId||attached.taskId===visible.taskId);
const call = httpsCallable<Record<string, unknown>, { reply: string; basis: string[]; journalDraft?: string | null; sources?:Source[] }>(getFunctions(app, 'us-central1'), 'lessonAssistant', { timeout: 240000 });
const manageConversation = httpsCallable<{ action: 'rename' | 'delete'; conversationId: string; title?: string }, { ok: boolean }>(getFunctions(app, 'us-central1'), 'manageCoachConversation');

function CoachChatPanel({ uid, profile, initialPrompt, reflectionId:incomingReflection, formContext:incomingForm, onClearForm, evidencePacketId:incomingEvidence = '', lessonContext:incomingLesson, pageContext:incomingPage, onClearLesson, initialConversationId, compact=false, onConversationChange }: {
  initialConversationId?:string;compact?:boolean;formContext?:{docId:string;formId:string};onClearForm?:()=>void;onConversationChange?:(id:string,context:CoachContext)=>void;
  uid: string; profile: CoachProfile; initialPrompt: string; reflectionId: string; evidencePacketId?:string; lessonContext?:LessonCoachContext; pageContext?:CoachContext['pageContext']; onClearLesson?:()=>void;
}) {
  const [approvedPacket,setApprovedPacket]=useState('');
  const requestedContext:CoachContext={lessonContext:incomingLesson??null,formContext:incomingForm??null,evidencePacketId:incomingEvidence,reflectionId:incomingReflection,pageContext:incomingPage??null};
  const scope=JSON.stringify(requestedContext);
  const [conversationId,setConversationId]=useState(()=>initialConversationId||lastConversation(uid,scope));
  const [context,setContext]=useState<CoachContext>(requestedContext);
  const {lessonContext,formContext,evidencePacketId='',reflectionId=''}=context;
  const route = useLocation();
  const [visibleLesson,setVisibleLesson]=useState<LessonCoachContext|null>(()=>coachContextOnPage().lessonContext??null);
  useEffect(()=>{setVisibleLesson(coachContextOnPage().lessonContext??null);},[route.pathname,route.search]);
  const attachmentDiffers=!!(compact&&lessonContext&&visibleLesson&&!matchesAttachment(lessonContext,visibleLesson));
  const { value: preferences, ready: preferencesReady } = useCoachPreferences(uid);
  const saved=useConversations(uid,conversationId,coachHistoryKey(profile.version,preferences.version,context));
  const messages=saved.messages;
  useEffect(()=>{const entry=saved.conversations.find(c=>c.id===conversationId);if(entry)setContext(entry.context);},[conversationId,saved.conversations]);
  const [showHistory,setShowHistory]=useState(false);
  const [renaming,setRenaming]=useState('');
  const [renameTitle,setRenameTitle]=useState('');
  const [managing,setManaging]=useState('');
  const [draft, setDraft] = useState(()=>readDraft(uid,conversationId)||initialPrompt);

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
  const followThread = useRef(true);
  const threadConversation = useRef(conversationId);
  const composer = useRef<HTMLTextAreaElement>(null);
  const lock = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);

  useEffect(()=>{const id=initialConversationId||lastConversation(uid,scope);setConversationId(id);setContext(requestedContext);setDraft(readDraft(uid,id)||initialPrompt);setApprovedPacket('');},[uid,scope,initialConversationId]);
  useEffect(()=>{rememberConversation(uid,scope,conversationId);generation.current++;request.current=null;setJournal(null);},[uid,conversationId]);
  useEffect(()=>{saveDraft(uid,conversationId,draft);},[draft]);
  useEffect(()=>{const change=(e:Event)=>{const d=(e as CustomEvent).detail;if(d.uid===uid&&d.id===conversationId)setDraft(d.text);};window.addEventListener('elt-coach-draft',change);return()=>window.removeEventListener('elt-coach-draft',change);},[uid,conversationId]);
  useEffect(()=>{if(initialPrompt)setDraft(old=>old||initialPrompt);},[initialPrompt]);
  function chooseConversation(id:string,nextContext:CoachContext=context){saveDraft(uid,conversationId,draft);setConversationId(id);rememberConversation(uid,scope,id);setContext(nextContext);setDraft(readDraft(uid,id));setApprovedPacket('');setShowHistory(false);setError('');onConversationChange?.(id,nextContext);}

  useEffect(()=>{if(journal && review.current && !review.current.open) review.current.showModal();},[journal]);
  useEffect(() => {
    const el=thread.current;if(!el)return;
    if(threadConversation.current!==conversationId){threadConversation.current=conversationId;followThread.current=true;}
    if(followThread.current)el.scrollTop=el.scrollHeight;
  }, [conversationId,messages,busy]);
  useEffect(() => { const input = composer.current; if (!busy && input && input.offsetParent !== null) input.focus(); }, [busy]);
  useEffect(() => {
    if (!composer.current) return;
    composer.current.style.height = 'auto';
    composer.current.style.height = `${Math.min(160, Math.max(36, composer.current.scrollHeight))}px`;
  }, [draft]);

  async function send() {
    if (!draft.trim() || lock.current || !preferencesReady || !saved.ready || saved.pending || (evidencePacketId&&approvedPacket!==evidencePacketId)) return;
    lock.current = true; followThread.current=true; setBusy(true); setError('');
    if (compact) onConversationChange?.(conversationId,context);
    const turnGeneration = generation.current;
    const text = draft.trim(); setPendingText(text);
    const history = saved.history.slice(-16).map(m => ({ role: m.role, text: (m.text+(m.journalDraft?'\nJournal draft:\n'+m.journalDraft:'')).slice(0,6000) }));
    const currentPageLesson=compact&&lessonContext?coachContextOnPage().lessonContext:null;
    const onAttachedPage=!!(currentPageLesson&&lessonContext&&matchesAttachment(lessonContext,currentPageLesson));
    // A pinned conversation keeps its chosen activity until the teacher changes it.
    // Do not pass text from another activity as if it described the attached one.
    const pageContext=compact&&lessonContext&&!onAttachedPage?null:coachPageSnapshot();
    const payload = { action: 'coach', conversationId, contextVersion: 2, mode, prompt: text, history, useProfile: true, useBeliefs: true, entryId: reflectionId, researchId: '', evidencePacketId:approvedPacket, pageContext, ...(formContext?{formContext}:{}), ...(lessonContext?{lessonContext}:{}) };
    while (new TextEncoder().encode(JSON.stringify(payload)).length > 40000 && history.length) history.splice(0,2);
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await call({ ...payload, requestId: request.current.id });
      if(turnGeneration !== generation.current) return;
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
  function newChat() { setJournal(null);setJournalSaved('');chooseConversation(crypto.randomUUID());request.current=null; }
  async function renameChat(id:string) {
    const title=renameTitle.trim();
    if(!title) return setError('Add a name for this chat.');
    setManaging(id);setError('');
    try { await manageConversation({action:'rename',conversationId:id,title});setRenaming('');setRenameTitle(''); }
    catch { setError('We couldn’t rename this chat. Try again.'); }
    finally { setManaging(''); }
  }
  async function removeChat(id:string,title:string) {
    if(!(await ask(`Delete “${title}”? Its messages will be removed from your saved history. You can’t undo this.`,{ok:'Delete chat',cancel:'Keep chat',title:'Delete chat'})))return;
    setManaging(id);setError('');
    try { await manageConversation({action:'delete',conversationId:id});if(id===conversationId)newChat(); }
    catch { setError('We couldn’t delete this chat. Try again.'); }
    finally { setManaging(''); }
  }
  const evidenceReady=!evidencePacketId||approvedPacket===evidencePacketId;
  const journalError=error==='We couldn’t save your reflection. Your edits are still here.';
  const canSend = preferencesReady && saved.ready && !saved.pending && !busy && !!draft.trim() && evidenceReady;
  return <section className="coach-chat" aria-label="Teacher’s Companion chat">
    {evidencePacketId&&<CoachEvidenceReview id={evidencePacketId} onConfirm={()=>setApprovedPacket(evidencePacketId)}/>}
    <header className="coach-chat-header"><div><span className="coach-kicker">Your thinking partner</span><h2>Teacher’s Companion</h2></div><div className="coach-chat-tools" aria-label="Conversation actions"><button type="button" className="coach-tool-icon" aria-label="History" title="History" aria-expanded={showHistory} onClick={()=>setShowHistory(!showHistory)}><UiIcon name="history" size={18}/></button><button type="button" className="coach-tool-icon" aria-label="New chat" title="New chat" disabled={busy || saved.pending || !messages.length} onClick={newChat}><UiIcon name="plus" size={18}/></button>{lessonContext&&<><Link className="coach-tool-icon" aria-label="Open selected lesson" title="Open selected lesson" to={`/class/${lessonContext.classId}/lesson/${lessonContext.itemId}${lessonContext.taskId?'?task='+lessonContext.taskId:''}`}><UiIcon name="classes" size={18}/></Link><button type="button" className="coach-tool-icon" aria-label="Remove lesson context" title="Stop using this lesson" disabled={busy} onClick={()=>{chooseConversation(crypto.randomUUID(),{...context,lessonContext:null});onClearLesson?.();}}><UiIcon name="videoClose" size={18}/></button></>}{!compact&&<button type="button" className="coach-tool-icon" aria-label="Pin chat" title="Keep this conversation open at the top right" onClick={()=>setCoachPanel({uid,conversationId,context})}><UiIcon name="pin" size={18}/></button>}<Link className="coach-tool-icon" aria-label="Settings" title="Settings" to="/settings#set-teaching-coach"><UiIcon name="settings" size={18}/></Link></div></header>
    {showHistory&&<nav className="coach-history" aria-label="Saved coaching conversations"><p>Private to you. Starting a new chat keeps previous conversations here.</p>{saved.conversations.length?saved.conversations.map(c=><div className="coach-history-row" key={c.id}>{renaming===c.id?<form onSubmit={e=>{e.preventDefault();void renameChat(c.id);}}><input aria-label="Chat name" autoFocus maxLength={100} value={renameTitle} onChange={e=>setRenameTitle(e.target.value)}/><button className="btn small-btn" disabled={managing===c.id||!renameTitle.trim()}>Save</button><button type="button" className="btn small-btn" onClick={()=>setRenaming('')}>Cancel</button></form>:<><button type="button" className="btn coach-history-open" aria-current={c.id===conversationId?'true':undefined} disabled={busy||managing===c.id} onClick={()=>chooseConversation(c.id,c.context)}><span>{c.title}</span><small>{new Date(c.updatedAt).toLocaleDateString('en-GB')}</small></button><button type="button" className="btn small-btn" disabled={busy||!!managing} onClick={()=>{setRenaming(c.id);setRenameTitle(c.title);}} aria-label={`Rename ${c.title}`}>Rename</button><button type="button" className="btn small-btn" disabled={busy||!!managing} onClick={()=>void removeChat(c.id,c.title)} aria-label={`Delete ${c.title}`}>Delete</button></>}</div>):<p>No saved conversations yet.</p>}</nav>}
    {saved.error&&<p className="coach-notice coach-error" role="alert">{saved.error}</p>}
    {!saved.ready&&!saved.error&&<p role="status" className="coach-notice">Opening your saved conversation…</p>}
    {saved.interrupted&&<p className="coach-notice">An earlier reply did not finish. Your messages are saved; you can send a follow-up below.</p>}
    {formContext&&<aside className="coach-notice" aria-label="Selected studio form"><p>Your coach will read this form from its current Collab document when you send. The document’s sharing settings still apply.</p><Link to={'/doc/'+formContext.docId+'#studio-form-'+formContext.formId}>Open selected form</Link> <button type="button" className="btn" disabled={busy} onClick={()=>{setContext(c=>({...c,formContext:null}));onClearForm?.();}}>Remove form context</button></aside>}
    {attachmentDiffers&&<aside className="coach-notice" aria-label="Attached activity"><p>This conversation is still using the activity you attached earlier.</p><button type="button" className="btn" disabled={busy} onClick={()=>{const next={...context,lessonContext:visibleLesson};setContext(next);onConversationChange?.(conversationId,next);request.current=null;}}>Use the activity on this page</button></aside>}
    {error && <AiNotice kind="error" action={journalError?()=>void saveJournal():draft.trim()?()=>void send():undefined} actionDisabled={journalError?journalSaving:!canSend} onDismiss={()=>setError('')}>{error}</AiNotice>}
    <>
      <div className="coach-chat-thread" ref={thread} tabIndex={0} onScroll={e=>{const el=e.currentTarget;followThread.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Home'||e.key==='End')){e.preventDefault();e.currentTarget.scrollTop=e.key==='Home'?0:e.currentTarget.scrollHeight;followThread.current=e.key==='End';}}} role="log" aria-label="Conversation with your Teacher’s Companion" aria-live="polite" aria-relevant="additions">
        <article className="coach-chat-message coach-chat-message-coach"><strong>Teacher’s Companion</strong><p>{lessonContext?'Your selected teaching context is ready. Tell me what you would like to explore or improve.':'What would you like to think through today? We can reflect on a lesson, explore a teaching belief, or plan a classroom inquiry.'}</p></article>
        {!lessonContext&&!formContext&&!evidencePacketId&&(!profileComplete(profile)||!beliefsComplete(profile))&&<p className="coach-context-optional">You can ask a question now. <Link to="/settings#set-teacher-s-companion">Add teaching context</Link> later if you would like more tailored replies.</p>}
        {messages.map((m,i) => <article key={i} className={`coach-message coach-chat-message coach-chat-message-${m.role}`}><strong>{m.role === 'teacher' ? 'You' : 'Teacher’s Companion'}</strong>{m.role==='teacher'?<div>{m.text}</div>:<AiText text={m.text}/>}{m.journalDraft && <button className="btn" onClick={()=>{setJournal({id:crypto.randomUUID(),title:'A reflection from my coaching conversation',text:m.journalDraft!});setJournalSaved('');}}>Review journal draft</button>}{!!m.sources?.length&&<details className="coach-chat-sources"><summary>Sources used ({m.sources.length})</summary><div className="coach-chat-source-links">{m.sources.map((source,j)=><Link key={j} to={source.url}>{source.title}</Link>)}</div></details>}{!!m.basis?.length && <details className="coach-chat-basis"><summary>Context used</summary><div className="coach-chat-basis-items">{m.basis.map((basis,j) => <p key={j}>{basis}</p>)}</div></details>}</article>)}
        {messages.length===0&&!busy&&!saved.pending&&!lessonContext&&!formContext&&!evidencePacketId&&<AiExamples label="Ways to begin" examples={STARTERS} disabled={!preferencesReady} onPick={text=>{setDraft(text);composer.current?.focus();}}/>}
        {busy && !saved.turns.some(t=>t.id===request.current?.id) && <><article className="coach-chat-message coach-chat-message-teacher"><strong>You</strong><div>{pendingText}</div></article><div className="coach-chat-typing" role="status"><AiMark active/><span>Teacher’s Companion is thinking</span></div></>}
        {saved.pending&&<div className="coach-chat-typing" role="status"><AiMark active/><span>Teacher’s Companion is thinking. You can leave and return to this conversation.</span></div>}
      </div>
      <div className="coach-chat-bottom">
        <form className="coach-chat-composer" onSubmit={e => { e.preventDefault(); void send(); }}><label className="coach-chat-input-label"><span className="sr-only">Message Teacher’s Companion</span><textarea ref={composer} aria-label="Message Teacher’s Companion" rows={1} maxLength={6000} value={draft} disabled={busy} placeholder="Message Teacher’s Companion…" onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend) void send(); } }} /></label><AiButton className="btn primary" type="submit" disabled={!canSend}>{busy ? 'Sending…' : 'Send'}</AiButton></form>
        <div className="coach-chat-footer">{(!preferencesReady||!saved.ready||saved.pending||!evidenceReady)&&<small role="status">{!preferencesReady?'Opening your coaching settings…':!saved.ready?'Wait for your saved conversation to open.':saved.pending?'Wait for the current reply before sending another message.':'Review and confirm the selected evidence above before sending.'}</small>}<small>Enter to send · Shift + Enter for a new line</small></div>
      </div>
      </>
    {journal && <dialog ref={review} className="coach-journal-review" aria-label="Review journal draft" onCancel={e=>{e.preventDefault();if(!journalSaving)setJournal(null);}}><form onSubmit={e=>{e.preventDefault();void saveJournal();}}><h3>Your journal draft</h3><p>Make this your own before saving it to Reflections.</p><label>Reflection title<input autoFocus required disabled={journalSaving} maxLength={160} value={journal.title} onChange={e=>setJournal({...journal,title:e.target.value})}/></label><label>Your reflection<AutoTextarea aria-label="Your reflection" required maxLength={12000} value={journal.text} disabled={journalSaving} onChange={e=>setJournal({...journal,text:e.target.value})}/></label><div className="coach-actions"><button className="btn" type="button" disabled={journalSaving} onClick={()=>setJournal(null)}>Back to chat</button><button className="btn primary" disabled={journalSaving||!journal.title.trim()||!journal.text.trim()}>{journalSaving?'Saving…':'Save to reflections'}</button></div>{error&&<p role="alert">{error}</p>}</form></dialog>}
    {journalSaved&&<p role="status" className="coach-journal-saved">{journalSaved}</p>}
  </section>;
}

export const CoachChat = teacherPanel(CoachChatPanel);
