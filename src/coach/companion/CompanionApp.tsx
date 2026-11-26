import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { TopBar } from '../../components/TopBar';
import { UiIcon } from '../../components/UiIcon';
import { AppFiles } from '../../pages/AppFiles';
import { CoachChat, type LessonCoachContext } from '../CoachChat';
import { setCoachPreference, useCoachPreferences } from '../CoachPreferences';
import { modes, emptyProfile } from '../model';
import { NSelect } from '../../components/Select';
import { MOODS, streak, threads, useCompanion, type Entry, type Experiment } from './data';
import { blankEntry, JournalHome, JournalWriter } from './Journal';
import { AfterLesson, BringLesson } from './Lessons';
import { Experiments, reviewDue } from './Experiments';
import { Growth } from './Growth';
import '../coach.css';
import './companion.css';

// Teacher's Companion, opened from Apps: a place for your teaching, not just a chat. Today brings
// together what needs you; Talk is the conversation (what it can see is shown, and can be switched
// off); before and after a lesson have their own short paths; the Journal, small experiments, goals
// and reading sit beside them. Opened from Messages it stays a quick chat, with a link here.

type Part = 'today' | 'talk' | 'before' | 'after' | 'journal' | 'try' | 'growth' | 'reading';
const PARTS: { k: Part; label: string; icon: string; group?: string }[] = [
  { k: 'today', label: 'Today', icon: 'home' },
  { k: 'talk', label: 'Talk', icon: 'discuss' },
  { k: 'before', label: 'Bring a lesson', icon: 'classes', group: 'Lessons' },
  { k: 'after', label: 'After a lesson', icon: 'history', group: 'Lessons' },
  { k: 'journal', label: 'Journal', icon: 'pen', group: 'Growing' },
  { k: 'try', label: 'Try something', icon: 'answers', group: 'Growing' },
  { k: 'growth', label: 'Goals and growth', icon: 'pin', group: 'Growing' },
  { k: 'reading', label: 'Reading', icon: 'notebook', group: 'Growing' },
];
type TalkWith = { lesson?: LessonCoachContext & { title?: string }; entry?: Entry; experiment?: Experiment; prompt?: string; key: number };

function ContextStrip({ uid, talk, onDrop }: { uid: string; talk: TalkWith; onDrop: (k: 'lesson' | 'entry' | 'experiment') => void }) {
  const { value, ready } = useCoachPreferences(uid);
  const chip = (k: 'profile' | 'beliefs' | 'reflections' | 'lessons' | 'inquiries', label: string) => (
    <button type="button" className={'cs-chip' + (value[k] ? ' on' : '')} aria-pressed={value[k]} disabled={!ready} onClick={() => void setCoachPreference(uid, { [k]: !value[k] })} data-tip={value[k] ? `The Companion can use your ${label.toLowerCase()}. Click to stop.` : `Not used. Click to let the Companion use your ${label.toLowerCase()}.`}>
      <i aria-hidden="true">{value[k] ? '✓' : ''}</i>{label}
    </button>
  );
  return (
    <div className="cs" aria-label="What the Companion can see">
      <span className="cs-k">It can see</span>
      {talk.lesson && <span className="cs-chip on fixed"><UiIcon name="classes" size={13} /> {talk.lesson.title ?? 'This lesson'}<button type="button" aria-label="Stop using this lesson" onClick={() => onDrop('lesson')}>×</button></span>}
      {talk.entry && <span className="cs-chip on fixed"><UiIcon name="pen" size={13} /> {talk.entry.title}<button type="button" aria-label="Stop using this entry" onClick={() => onDrop('entry')}>×</button></span>}
      {talk.experiment && <span className="cs-chip on fixed"><UiIcon name="answers" size={13} /> {talk.experiment.title}<button type="button" aria-label="Stop using this experiment" onClick={() => onDrop('experiment')}>×</button></span>}
      {chip('profile', 'Profile')}{chip('beliefs', 'Beliefs')}{chip('reflections', 'Journal')}{chip('inquiries', 'Experiments')}{chip('lessons', 'Lessons')}
      <span className="cs-gap" />
      <NSelect className="cs-mode" aria-label="How the Companion talks with you" value={value.mode} disabled={!ready} onChange={(e) => void setCoachPreference(uid, { mode: e.target.value as (typeof modes)[number] })}>{modes.map((m) => <option key={m}>{m}</option>)}</NSelect>
    </div>
  );
}

export function CompanionApp() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const part = (PARTS.some((p) => p.k === params.get('s')) ? params.get('s') : params.get('conversation') || params.get('classId') || params.get('formDoc') ? 'talk' : 'today') as Part;
  const go = (k: Part) => { const n = new URLSearchParams(); if (k !== 'today') n.set('s', k); setParams(n); setWriting(null); };
  const uid = user?.uid ?? '';
  const data = useCompanion(uid);
  const [writing, setWriting] = useState<Entry | null>(null);
  // Talk: what the conversation is about, carried in from elsewhere in the Companion or a link.
  const [talk, setTalk] = useState<TalkWith>(() => {
    const classId = params.get('classId'), itemId = params.get('itemId');
    return { key: 0, ...(classId && itemId ? { lesson: { classId, itemId, taskId: params.get('taskId') || '', reportId: params.get('reportId') || '' } } : {}) };
  });
  const talkAbout = (t: Omit<TalkWith, 'key'>) => { setTalk({ ...t, key: Date.now() }); const n = new URLSearchParams(); n.set('s', 'talk'); setParams(n); setWriting(null); };
  useEffect(() => { document.title = 'Teacher’s Companion · ELT Suite'; }, []);
  const entries = data.entries ?? [];
  const experiments = data.experiments ?? [];
  const goals = data.goals ?? [];
  const due = experiments.filter(reviewDue);
  const name = (user?.displayName || 'Teacher').split(' ')[0];
  const t = useMemo(() => threads(entries), [entries]);
  if (!user) return null;
  const profile = data.profile ?? emptyProfile;
  const groups = [...new Set(PARTS.map((p) => p.group ?? ''))];
  return (
    <div className="development-shell cp-shell">
      <TopBar />
      <div className={'cp' + (writing ? ' writing' : '')}>
        <nav className="cp-rail" aria-label="Teacher’s Companion">
          <span className="cp-brand">Teacher’s Companion</span>
          {groups.map((g) => (
            <div key={g || 'main'} className="cp-group">
              {g && <span className="cp-group-k">{g}</span>}
              {PARTS.filter((p) => (p.group ?? '') === g).map((p) => (
                <button key={p.k} type="button" className={'cp-nav' + (part === p.k ? ' on' : '')} aria-current={part === p.k ? 'page' : undefined} onClick={() => go(p.k)}>
                  <UiIcon name={p.icon} size={17} /><span>{p.label}</span>
                  {p.k === 'try' && due.length > 0 && <i className="cp-dot" aria-label={`${due.length} to look at again`}>{due.length}</i>}
                </button>
              ))}
            </div>
          ))}
          <Link className="cp-nav cp-settings" to="/settings#set-teacher-s-companion"><UiIcon name="settings" size={17} /><span>Settings</span></Link>
          <p className="cp-private"><UiIcon name="lock" size={12} /> Everything here is private to you.</p>
        </nav>
        <main className="cp-main">
          {data.error && <p className="cp-error" role="alert">{data.error}</p>}
          {writing ? (
            <JournalWriter key={writing.id} uid={uid} start={writing} onClose={() => setWriting(null)} onTalk={(e) => talkAbout({ entry: e, prompt: 'Help me think about this journal entry. What do you notice, and what might I try next?' })} />
          ) : part === 'today' ? (
            <div className="cp-section cp-today">
              <header className="cp-hello"><span className="cp-k">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>Hello, {name}.</h1><p>What would help your teaching today?</p></header>
              <div className="cp-cards">
                <button type="button" className="cp-card big" onClick={() => go('before')}><UiIcon name="classes" size={22} /><b>Bring a lesson</b><span>Plan, adapt or prepare it together</span></button>
                <button type="button" className="cp-card big" onClick={() => go('after')}><UiIcon name="history" size={22} /><b>After a lesson</b><span>Two minutes, while it’s fresh</span></button>
                <button type="button" className="cp-card big" onClick={() => setWriting(blankEntry())}><UiIcon name="pen" size={22} /><b>Write in your journal</b><span>{streak(entries) > 1 ? `${streak(entries)} days in a row` : 'A few lines is enough'}</span></button>
                <button type="button" className="cp-card big" onClick={() => go('talk')}><UiIcon name="discuss" size={22} /><b>Talk something through</b><span>A dilemma, an idea, a question</span></button>
              </div>
              {due.length > 0 && <section className="cp-panel due"><span className="cp-k">Time to look again</span>{due.map((x) => <button key={x.id} type="button" className="cp-row" onClick={() => go('try')}><b>{x.title}</b><span>You planned to look at this experiment again. How did it go?</span></button>)}</section>}
              <div className="cp-two">
                <section className="cp-panel">
                  <span className="cp-k">Your goals</span>
                  {goals.filter((g) => g.status === 'active').slice(0, 3).map((g) => { const d = g.steps.filter((s) => s.done).length; return <button key={g.id} type="button" className="cp-row" onClick={() => go('growth')}><b>{g.title}</b><span className="gr-bar"><i style={{ width: g.steps.length ? `${(d / g.steps.length) * 100}%` : '0%' }} /></span><small>{d} of {g.steps.length} steps</small></button>; })}
                  {!goals.some((g) => g.status === 'active') && <p className="cp-empty">No goal yet. <button type="button" className="cp-link" onClick={() => go('growth')}>Set one</button></p>}
                </section>
                <section className="cp-panel">
                  <span className="cp-k">Lately in your journal</span>
                  {entries.slice(0, 3).map((e) => { const m = MOODS.find((x) => x.k === e.mood); return <button key={e.id} type="button" className="cp-row" onClick={() => setWriting(e)}><i className="cp-mood" style={m ? { background: m.colour } : undefined} /><b>{e.title}</b><small>{new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></button>; })}
                  {t.themes[0] && <p className="cp-thread">You’ve written about <b>{t.themes[0][0].toLowerCase()}</b> {t.themes[0][1]} times this month. <button type="button" className="cp-link" onClick={() => talkAbout({ prompt: `I keep writing about ${t.themes[0][0].toLowerCase()} in my journal. Help me see what’s going on and what I could try.` })}>Talk about it</button></p>}
                  {!entries.length && <p className="cp-empty">Nothing yet. Your first entry can be one sentence.</p>}
                </section>
              </div>
            </div>
          ) : part === 'talk' ? (
            <div className="cp-talk">
              <ContextStrip uid={uid} talk={talk} onDrop={(k) => setTalk((x) => ({ ...x, [k]: undefined, key: Date.now() }))} />
              <div className="coach-chat-host cp-chat">
                <CoachChat key={talk.key} uid={uid} profile={profile} initialPrompt={talk.prompt ?? ''} reflectionId={talk.entry?.id ?? ''} lessonContext={talk.lesson} formContext={params.get('formDoc') && params.get('formId') ? { docId: params.get('formDoc')!, formId: params.get('formId')! } : undefined} evidencePacketId={params.get('evidence') || ''} initialConversationId={params.get('conversation') || undefined} />
              </div>
            </div>
          ) : part === 'before' ? (
            <BringLesson uid={uid} onTalk={(l, prompt) => talkAbout({ lesson: { classId: l.classId, itemId: l.itemId, title: l.title }, prompt })} />
          ) : part === 'after' ? (
            <AfterLesson uid={uid} onDone={(e, andTalk) => (andTalk ? talkAbout({ entry: e, lesson: e.lessonRef ? { classId: e.lessonRef.classId, itemId: e.lessonRef.itemId, title: e.lessonRef.title } : undefined, prompt: 'I’ve just taught this lesson. Here’s my debrief. Help me make sense of it and choose one thing to try next time.' }) : setWriting(e))} />
          ) : part === 'journal' ? (
            data.entries === null ? <p className="cp-empty">One moment…</p> : <JournalHome entries={entries} onWrite={(p) => setWriting(blankEntry(p))} onOpen={setWriting} />
          ) : part === 'try' ? (
            <Experiments uid={uid} list={experiments} onTalk={(x) => talkAbout({ experiment: x, prompt: [`Help me think about my classroom experiment: “${x.title}”.`, x.baseline && `What happens now: ${x.baseline}`, x.intervention && `The change: ${x.intervention}`, x.observations && `My notes so far: ${x.observations.slice(0, 800)}`, 'What should I look out for, and what else might explain what I see?'].filter(Boolean).join('\n') })} />
          ) : part === 'growth' ? (
            <Growth uid={uid} goals={goals} entries={entries} experiments={experiments} profile={data.profile} name={user.displayName || 'Teacher'} onOpenEntry={setWriting} onOpenExperiment={() => go('try')} />
          ) : (
            <div className="cp-section cp-reading">
              <header className="cp-head"><span className="cp-k">Reading</span><h2>Ideas to bring into class</h2><p>Keep notes on what you read, then turn one idea into something to try. Open a Reading Journal, and when something strikes you, write about it in your journal.</p>
                <button type="button" className="cp-soft" onClick={() => setWriting(blankEntry({ theme: 'Research to practice', title: 'An idea from my reading' }))}><UiIcon name="pen" size={15} /> Write about something I read</button></header>
              <AppFiles app="reading" embedded />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
