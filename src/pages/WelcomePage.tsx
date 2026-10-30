import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { TEACHER_PATHS } from '../lib/teacherPaths';
import { Wordmark } from '../components/Wordmark';
import './welcome.css';

export function WelcomePage() {
  const { user, setOnboardingLocal } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [review]);
  const path = TEACHER_PATHS.find(p => p.id === selected);
  async function finish(to: string) {
    if (!user || busy) return;
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { onboarding: 'done', teacherGoal: selected });
      setOnboardingLocal(selected);
      navigate(to, { replace: true });
    } catch { setError('We couldn’t save your choice. Please try again.'); setBusy(false); }
  }
  return <main className="welcome">
    <header className="welcome-top"><Wordmark /><span>YOUR TEACHING, YOUR START</span></header>
    <div className="welcome-body">
      <span className="path-eyebrow">{review ? '2 of 2 · Your starting point' : '1 of 2 · A little direction'}</span>
      <h1 ref={heading} tabIndex={-1}>{review && path ? 'Let’s make this useful.' : 'What would you like help with first?'}</h1>
      <p className="path-lede">{review && path ? path.result : 'Choose one thing that would make your teaching day easier. You can explore everything else whenever you need it.'}</p>
      {!review ? <>
        <div className="path-grid">{TEACHER_PATHS.map(p => <button type="button" className="path-card" key={p.id} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}><span className="path-choice" aria-hidden="true">{selected === p.id ? '✓' : '↗'}</span><b>{p.title}</b><span>{p.detail}</span></button>)}</div>
        <div className="path-actions"><button className="btn primary tall" disabled={!selected} onClick={() => setReview(true)}>Show my starting point →</button><button className="btn link" disabled={busy} onClick={() => finish('/')}>I’ll explore on my own</button></div>
      </> : path && <section className="path-plan" aria-label="Your starting point">
        <span className="path-eyebrow">{path.title}</span><h2>Three small steps. Something you can use.</h2>
        <ol>{path.steps.map(s => <li key={s}>{s}</li>)}</ol>
        <p>You don’t need to set up the whole suite. Start here; the Guide is always there when you need it.</p>
        <div className="path-actions"><button className="btn primary tall" disabled={busy} onClick={() => finish(path.to)}>{busy ? 'Saving…' : path.action + ' →'}</button><button className="btn" disabled={busy} onClick={() => finish('/guide?goal=' + path.id)}>Show me how first</button><button className="btn link" disabled={busy} onClick={() => setReview(false)}>Change my choice</button></div>
      </section>}
      {error && <p role="alert" className="error">{error}</p>}
      <footer className="welcome-foot">Your choice is a starting point, not a limit. <Link to="/guide">Explore the Guide</Link></footer>
    </div>
  </main>;
}
