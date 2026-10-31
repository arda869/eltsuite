import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useAppOn } from '../lib/admin';
import { isProxyTab } from '../lib/proxy';
import { useMedia } from '../lib/useMedia';
import { UiIcon } from '../components/UiIcon';
import data from '../../functions/help/library.json';
import './help.css';

type Article = typeof data.articles[number];
type Turn = { id: number; question: string; articleIds: string[]; unavailable?: boolean; rating?: string };
const call = httpsCallable<Record<string, unknown>, { articleIds?: string[]; version?: string }>(getFunctions(app, 'us-central1'), 'helpAssistant', { timeout: 210000 });
const topics = data.articles;
const support = 'mailto:arda@eltsuite.com?subject=ELT%20Suite%20help';

export function HelpAssistant() {
  const { user, profile } = useAuth();
  if (!user || profile?.role !== 'teacher' || isProxyTab()) return null;
  return <HelpChat key={user.uid} />;
}

function HelpChat() {
  const appOn = useAppOn();
  const phone = useMedia('(max-width: 700px)');
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [search, setSearch] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [shareQuestion, setShareQuestion] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const launch = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent).detail !== 'help') setOpen(false); };
    window.addEventListener('elt-assistant-panel', other);
    return () => window.removeEventListener('elt-assistant-panel', other);
  }, []);
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('elt-assistant-panel', { detail: 'help' }));
    input.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      if (e.key !== 'Tab' || !phone) return;
      const els = [...(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input') ?? [])];
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open, phone]);
  useEffect(() => {
    const body = scroll.current;
    if (!body) return;
    const last = body.querySelector('.help-turn:last-child');
    if (!browse && last) body.scrollTo({ top: body.scrollTop + last.getBoundingClientRect().top - body.getBoundingClientRect().top });
    else body.scrollTo({ top: 0 });
  }, [turns, busy, open, browse]);
  useEffect(() => { if (open && !busy && !browse) input.current?.focus(); }, [busy]);
  function close() { setOpen(false); requestAnimationFrame(() => launch.current?.focus()); }
  function clear() { generation.current++; setTurns([]); setBusy(false); setQuestion(''); setFeedbackNote(''); setShareQuestion(false); input.current?.focus(); }
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    const ticket = ++generation.current;
    const id = Date.now();
    const previousArticleIds = turns.at(-1)?.articleIds ?? [];
    setTurns(old => [...old.slice(-19), { id, question: text.trim(), articleIds: [] }]);
    setQuestion(''); setBrowse(false); setBusy(true); setFeedbackNote('');
    try {
      const res = (await call({ question: text.trim(), previousArticleIds })).data;
      if (generation.current !== ticket) return;
      // Ignore references from a different catalogue rather than displaying stale instructions.
      if (res.version !== data.version || !Array.isArray(res.articleIds) || res.articleIds.some(id => !topics.some(a => a.id === id))) throw Error('Help catalogue changed.');
      setTurns(old => old.map(t => t.id === id ? { ...t, articleIds: res.articleIds! } : t));
    } catch {
      if (generation.current !== ticket) return;
      setTurns(old => old.map(t => t.id === id ? { ...t, unavailable: true } : t));
    } finally {
      if (generation.current === ticket) { setBusy(false); input.current?.focus(); }
    }
  }
  async function rate(turn: Turn, rating: string) {
    setFeedbackNote('Saving feedback…');
    try {
      await call({ action: 'feedback', rating, articleIds: turn.articleIds, shareQuestion, ...(shareQuestion ? { question: turn.question } : {}) });
      setTurns(old => old.map(t => t.id === turn.id ? { ...t, rating } : t));
      setFeedbackNote('Thank you. Your feedback helps us improve the guide.');
    } catch { setFeedbackNote('We couldn’t save feedback. Try again, or email support.'); }
  }
  const featureFor: Record<string, string> = { lessons: 'classes', learners: 'classes', live: 'classes', calls: 'rooms', recordings: 'recordings', files: 'files', collab: 'collab', timetable: 'timetable' };
  const available = topics.filter(a => !featureFor[a.id] || appOn(featureFor[a.id]));
  const matches = available.filter(a => `${a.title} ${a.keywords} ${a.summary}`.toLowerCase().includes(search.toLowerCase()));
  function article(a: Article) {
    return <article className="help-article" key={a.id}><span className="help-eyebrow">From the ELT Suite guide</span><h3>{a.title}</h3><p>{a.summary}</p><ol>{a.steps.map(step => <li key={step}>{step}</li>)}</ol>{!featureFor[a.id] || appOn(featureFor[a.id]) ? <Link className="help-feature" to={a.href} onClick={close}>{a.action}<span aria-hidden="true"> →</span></Link> : <p className="help-privacy">This app isn’t enabled for your account. Ask your admin or contact support.</p>}</article>;
  }
  return <>
    <button ref={launch} className="help-launch" aria-label="Open ELT Suite help" aria-expanded={open} aria-controls="elt-help-panel" onClick={() => setOpen(v => !v)}><span className="help-mark"><UiIcon name="help" size={20} /></span><span>Ask ELT Suite</span></button>
    {open && <aside ref={panel} id="elt-help-panel" className="help-panel" role="dialog" aria-modal={phone || undefined} aria-labelledby="elt-help-title">
      <header className="help-header"><span className="help-mark"><UiIcon name="help" size={23} /></span><div><span className="help-eyebrow">A little help, right here</span><h2 id="elt-help-title">ELT Suite assistant</h2></div><button className="help-icon" onClick={close} aria-label="Close help"><span aria-hidden="true">×</span></button></header>
      <nav className="help-nav" aria-label="Help views"><button aria-pressed={!browse} onClick={() => setBrowse(false)}>Ask a question</button><button aria-pressed={browse} onClick={() => setBrowse(true)}>Browse topics</button><button className="help-reset" onClick={clear} disabled={!turns.length}>Clear chat</button></nav>
      <div className="help-scroll" ref={scroll}>
        {browse ? <><label className="help-search">Find a help topic<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Try lessons, calls or files" /></label><div className="help-topics">{matches.map(a => <details key={a.id}><summary>{a.title}<span aria-hidden="true">+</span></summary>{article(a)}</details>)}</div>{!matches.length && <p>No matching topics. Try another word, or <a href={support}>contact support</a>.</p>}</> : <>
          {!turns.length && <div className="help-welcome"><h3>How can I help?</h3><p>Find your next step in ELT Suite.</p><div className="help-starters">{['How do I make a lesson?', 'How do learners join?', 'How do I record a lesson?'].map(q => <button key={q} onClick={() => void ask(q)}>{q}<span aria-hidden="true">↗</span></button>)}</div></div>}
          <div className="help-transcript" role="log" aria-label="Help conversation" aria-live="polite" aria-relevant="additions text">{turns.map((t, i) => <div className="help-turn" key={t.id}><p className="help-question"><span className="help-sr">You asked: </span>{t.question}</p>{busy && i === turns.length - 1 ? <p className="help-thinking">Finding the right guidance…</p> : <><div className="help-answer">{t.articleIds.length ? t.articleIds.map(id => article(topics.find(a => a.id === id)!)) : <div className="help-unknown"><h3>{t.unavailable ? 'Let’s find another way' : 'I don’t have verified steps for that yet'}</h3><p>{t.unavailable ? 'AI help isn’t available just now. The help library is still here.' : 'Try a more specific question, browse the guide or ask support. I can explain features, but I can’t change your work.'}</p><button className="help-feature" onClick={() => setBrowse(true)}>Browse help topics →</button><a href={support}>Email support →</a></div>}</div><div className="help-rating">{t.rating ? <span>Feedback saved</span> : <><span>Did this help?</span><button onClick={() => void rate(t, 'yes')} aria-label="Yes, this helped">Yes</button><button onClick={() => void rate(t, t.articleIds.length ? 'no' : 'unresolved')} aria-label="No, I still need help">Not yet</button></>}</div></>}</div>)}</div>
        </>}
      </div>
      <footer className="help-footer">{!browse && <form onSubmit={e => { e.preventDefault(); void ask(question); }}><label className="help-sr" htmlFor="help-question">Ask how to use ELT Suite</label><input ref={input} id="help-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} placeholder="Ask how to use ELT Suite…" disabled={busy} autoComplete="off" /><button type="submit" disabled={busy || !question.trim()} aria-label="Send help question"><span aria-hidden="true">↑</span></button></form>}<p className="help-privacy">AI finds guidance from our reviewed help library.<br />Help is separate from your lesson AI allowance.</p><details className="help-data"><summary>Privacy and feedback</summary><p>Questions are sent to our AI provider to find relevant help. We don’t save your chat. Don’t include learner details or private material. Feedback stores the topic and rating for review; clearing the chat removes it from this window.</p><label><input type="checkbox" checked={shareQuestion} onChange={e => setShareQuestion(e.target.checked)} /> Include my question when I send feedback</label><a href={support}>Contact support</a></details><p className="help-feedback-note" role="status">{feedbackNote}</p></footer>
    </aside>}
  </>;
}
