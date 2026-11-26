import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Highlight } from '../../editor/Highlight';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useTeacherClasses } from '../../lib/coteach';
import { NSelect } from '../../components/Select';
import { UiIcon } from '../../components/UiIcon';
import { ask } from '../../lib/ask';
import { newReflection, reflectionDoc, reflectionText } from '../model';
import { day, MOODS, removeDoc, saveVersioned, shortDay, streak, threads, wordsIn, type Entry, type Mood } from './data';

// The journal: somewhere to think about teaching that feels like a good notebook, not a form.
// The list shows how the weeks have felt and what keeps coming up; writing is a calm page with the
// date, how the day felt, a name for the moment, and the words, with gentle ways in when the page is
// blank. Everything saves by itself and stays private.

const TAGS = ['Speaking', 'Grammar', 'Vocabulary', 'Pronunciation', 'Classroom management', 'Motivation', 'Feedback', 'Mixed ability', 'Assessment', 'Online teaching', 'Young learners', 'A learner', 'Something new I tried', 'Planning'];

// Ways in: each lays headings into the page, with a short question to answer under each.
const FRAMES: { k: string; title: string; about: string; parts: [string, string][] }[] = [
  { k: 'quick', title: 'Quick note', about: 'One thing, while it’s fresh', parts: [['What I want to remember', 'Just a few lines…']] },
  { k: 'rolfe', title: 'What? So what? Now what?', about: 'Three short steps', parts: [['What?', 'What happened? Describe it simply.'], ['So what?', 'Why does it matter? What does it tell you?'], ['Now what?', 'What will you do next time?']] },
  { k: 'gibbs', title: 'The full cycle', about: 'For something worth thinking through', parts: [['What happened', 'The moment, as it was.'], ['How I felt', 'Then, and now.'], ['What went well, and what didn’t', ''], ['Why I think it happened', 'What else could explain it?'], ['What I’ve learnt', ''], ['Next time I’ll…', 'One small, clear step.']] },
  { k: 'good', title: 'Three good things', about: 'Notice what worked', parts: [['Three things that went well', '1.\n2.\n3.'], ['Why they worked', '']] },
  { k: 'learner', title: 'A learner I noticed', about: 'One person, closely (no full names)', parts: [['Who and what I noticed', 'Use initials or a nickname.'], ['What it might mean', ''], ['How I could help', '']] },
  { k: 'plan', title: 'Plan vs reality', about: 'What you planned and what happened', parts: [['What I planned', ''], ['What actually happened', ''], ['What I’d change', '']] },
];
const PROMPTS = [
  'What surprised you today?', 'When did the room feel most alive?', 'Who spoke least, and why might that be?', 'What would you do differently with ten more minutes?', 'What did a learner do that you didn’t expect?',
  'Which instruction needed saying twice?', 'What are you proud of this week?', 'What did you let go of, and was that right?', 'Where did you talk more than you planned?', 'What question from a learner is still on your mind?',
  'What would a colleague have noticed in your lesson?', 'Which mistake was worth more than a correct answer?', 'What small thing could make Monday easier?', 'What did you learn about yourself as a teacher?', 'Which part of the lesson would you keep exactly as it was?',
];

const HINTS = new Map<string, string>(FRAMES.flatMap((f) => f.parts.filter(([, q]) => q).map(([h, q]) => [h, q.replace(/\n/g, ' ')] as [string, string])));
function useJournalEditor(content: JSONContent, onChange: (doc: JSONContent, text: string) => void) {
  return useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [3] }, codeBlock: false, code: false }), Underline, Highlight, Placeholder.configure({
      showOnlyCurrent: false,
      includeChildren: false,
      // Under a heading from a way in, its question shows faintly until you write.
      placeholder: ({ node, pos, editor }) => {
        if (node.type.name === 'heading') return 'A heading';
        const before = pos > 0 ? editor.state.doc.resolve(pos).nodeBefore : null;
        if (before?.type.name === 'heading') return HINTS.get(before.textContent) ?? 'Write here…';
        return editor.state.doc.childCount <= 1 ? 'Start anywhere. What happened, and how did it feel?' : '';
      },
    })],
    content,
    editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Your journal entry', class: 'jw-prose', spellcheck: 'true' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON(), reflectionText(editor.getJSON())),
  });
}
function addFrame(ed: Editor, parts: [string, string][]) {
  const nodes: JSONContent[] = parts.flatMap(([h]) => [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: h }] },
    { type: 'paragraph' },
  ]);
  const empty = ed.state.doc.textContent.trim() === '';
  if (empty) ed.commands.setContent({ type: 'doc', content: nodes }, true);
  else ed.chain().focus('end').insertContent(nodes).run();
  // The cursor goes to the first empty line, ready to write.
  let target = -1;
  ed.state.doc.descendants((n, pos) => { if (target < 0 && n.type.name === 'paragraph' && n.content.size === 0) target = pos + 1; });
  if (target > 0) ed.chain().focus().setTextSelection(target).run();
}

export function JournalWriter({ uid, start, onClose, onTalk }: { uid: string; start: Entry; onClose: () => void; onTalk: (e: Entry) => void }) {
  const [e, setE] = useState<Entry>(start);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'unsaved' | 'error' | 'conflict'>(start.version ? 'saved' : 'unsaved');
  const [rail, setRail] = useState(() => !start.text.trim());
  const [focus, setFocus] = useState(false);
  const [prompt, setPrompt] = useState(() => Math.floor(Math.random() * PROMPTS.length));
  const [linking, setLinking] = useState(false);
  const live = useRef(e);
  live.current = e;
  const changed = useRef(false);
  const busy = useRef(false);
  const editor = useJournalEditor(start.content ?? reflectionDoc(start.text), (content, text) => {
    setE((x) => ({ ...x, content, text, words: wordsIn(text) }));
    changed.current = true;
    setSaved('unsaved');
  });
  const patch = (p: Partial<Entry>) => { setE((x) => ({ ...x, ...p })); changed.current = true; setSaved('unsaved'); };
  // A copy on this device as you write, in case the connection drops.
  useEffect(() => { try { sessionStorage.setItem('ll.journal.' + e.id, JSON.stringify(e)); } catch { /* fine */ } }, [e]);
  // Saves by itself a moment after you stop typing.
  const save = async () => {
    if (busy.current || !changed.current) return;
    const cur = live.current;
    if (!cur.text.trim() && !cur.title.trim()) return;
    busy.current = true;
    changed.current = false;
    setSaved('saving');
    try {
      const value = { ...cur, title: cur.title.trim() || autoTitle(cur), at: cur.version ? cur.at : Date.now() };
      const v = await saveVersioned(uid, 'reflections', value);
      setE((x) => ({ ...x, version: v, title: x.title || value.title, at: value.at }));
      live.current = { ...live.current, version: v };
      setSaved(changed.current ? 'unsaved' : 'saved');
      try { sessionStorage.removeItem('ll.journal.' + cur.id); } catch { /* fine */ }
    } catch (err) {
      changed.current = true;
      setSaved(err instanceof Error && err.message === 'changed' ? 'conflict' : 'error');
    } finally { busy.current = false; }
  };
  useEffect(() => {
    if (saved !== 'unsaved') return;
    const t = window.setTimeout(() => void save(), 1400);
    return () => window.clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); void save(); }
      if (ev.key === 'Escape' && focus) setFocus(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  useEffect(() => { if (editor && !start.text.trim()) editor.commands.focus('end'); }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = async () => { await save(); onClose(); };
  const del = async () => {
    if (!(await ask('Delete this journal entry? You can’t undo this.', { ok: 'Delete', danger: true }))) return;
    if (e.version) await removeDoc(uid, 'reflections', e.id).catch(() => {});
    onClose();
  };
  const mood = MOODS.find((m) => m.k === e.mood);
  const words = e.words ?? wordsIn(e.text);
  return (
    <div className={'jw' + (focus ? ' focus' : '') + (rail ? ' with-rail' : '')} style={mood ? { ['--mood' as string]: mood.colour } : undefined}>
      <header className="jw-bar">
        <button type="button" className="jw-ghost" onClick={() => void close()}><UiIcon name="prev" size={16} /> Journal</button>
        <span className={'jw-saved ' + saved} role="status">{saved === 'saved' ? 'Saved' : saved === 'saving' ? 'Saving…' : saved === 'unsaved' ? (e.text.trim() || e.title.trim() ? 'Writing…' : '') : saved === 'conflict' ? 'Changed in another window. Copy your words, then reopen it.' : 'Not saved yet. Check your connection. Your words are still here.'}</span>
        <span className="jw-gap" />
        <button type="button" className={'jw-ghost' + (rail ? ' on' : '')} aria-pressed={rail} onClick={() => setRail((v) => !v)}><UiIcon name="help" size={16} /> Ways in</button>
        <button type="button" className={'jw-ghost' + (focus ? ' on' : '')} aria-pressed={focus} onClick={() => setFocus((v) => !v)} data-tip="Hide everything but the page (Esc to come back)"><UiIcon name="fullscreen" size={16} /> Focus</button>
      </header>
      <div className="jw-body">
        <article className="jw-page">
          <span className="jw-date">{day(e.at || Date.now())}</span>
          <div className="jw-moods" role="radiogroup" aria-label="How did today feel?">
            <span className="jw-moods-q">How did it feel?</span>
            {MOODS.map((m) => (
              <button key={m.k} type="button" role="radio" aria-checked={e.mood === m.k} className={'jw-mood' + (e.mood === m.k ? ' on' : '')} style={{ ['--m' as string]: m.colour }} onClick={() => patch({ mood: e.mood === m.k ? '' : (m.k as Mood) })} data-tip={m.label}>
                <i aria-hidden="true" />{m.k === 'great' ? 'Great' : m.k === 'good' ? 'Good' : m.k === 'mixed' ? 'Mixed' : m.k === 'tough' ? 'Tough' : 'Drained'}
              </button>
            ))}
          </div>
          <input className="jw-title" value={e.title} maxLength={160} placeholder="Give this moment a name" aria-label="Title" onChange={(ev) => patch({ title: ev.target.value })} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); editor?.commands.focus('start'); } }} />
          <EditorContent editor={editor} className="jw-editor" />
          <footer className="jw-foot">
            <div className="jw-tags" aria-label="Tags">
              {(e.tags ?? []).map((t) => <button key={t} type="button" className="jw-tag on" onClick={() => patch({ tags: (e.tags ?? []).filter((x) => x !== t) })} aria-label={`Remove the tag ${t}`}>{t} <span aria-hidden="true">×</span></button>)}
              <NSelect className="jw-tag-add" aria-label="Add a tag" value="" onChange={(ev) => ev.target.value && patch({ tags: [...(e.tags ?? []), ev.target.value] })}>
                <option value="">+ Tag</option>
                {TAGS.filter((t) => !(e.tags ?? []).includes(t)).map((t) => <option key={t}>{t}</option>)}
              </NSelect>
              {e.lessonRef ? (
                <span className="jw-lesson"><UiIcon name="classes" size={14} /> {e.lessonRef.title}{e.lessonRef.className ? ` · ${e.lessonRef.className}` : ''}<button type="button" aria-label="Unlink the lesson" onClick={() => patch({ lessonRef: null })}>×</button></span>
              ) : (
                <button type="button" className="jw-tag" onClick={() => setLinking(true)}><UiIcon name="classes" size={14} /> Link a lesson</button>
              )}
            </div>
            <div className="jw-actions">
              <span className="jw-count">{words} {words === 1 ? 'word' : 'words'}</span>
              <button type="button" className="jw-ghost" disabled={!e.version} onClick={() => void save().then(() => onTalk(live.current))} data-tip={e.version ? 'Think it through with the Companion' : 'Write a little first'}><UiIcon name="discuss" size={16} /> Talk it through</button>
              <button type="button" className="jw-ghost danger" onClick={() => void del()}>Delete</button>
            </div>
          </footer>
        </article>
        {rail && !focus && (
          <aside className="jw-rail" aria-label="Ways in">
            <h3>Ways in</h3>
            <p className="jw-rail-hint">Choose one and it lays out headings to write under. Change anything.</p>
            <div className="jw-frames">
              {FRAMES.map((f) => (
                <button key={f.k} type="button" className="jw-frame" onClick={() => editor && addFrame(editor, f.parts)}>
                  <b>{f.title}</b><span>{f.about}</span>
                </button>
              ))}
            </div>
            <div className="jw-card">
              <span className="jw-card-k">A question to start</span>
              <p>{PROMPTS[prompt]}</p>
              <div className="jw-card-acts">
                <button type="button" className="jw-ghost" onClick={() => editor && addFrame(editor, [[PROMPTS[prompt], '']])}>Use it</button>
                <button type="button" className="jw-ghost" onClick={() => setPrompt((p) => (p + 1 + Math.floor(Math.random() * (PROMPTS.length - 1))) % PROMPTS.length)}>Another</button>
              </div>
            </div>
            <p className="jw-private"><UiIcon name="lock" size={13} /> Only you can read your journal. Not your organisation, not your colleagues.</p>
          </aside>
        )}
      </div>
      {linking && <LinkLesson uid={uid} onPick={(r) => { patch({ lessonRef: r }); setLinking(false); }} onClose={() => setLinking(false)} />}
    </div>
  );
}

const autoTitle = (e: Entry) => {
  const first = e.text.split('\n').map((l) => l.trim()).find((l) => l && !FRAMES.some((f) => f.parts.some(([h, q]) => h === l || q === l)));
  return (first ? first.slice(0, 60) + (first.length > 60 ? '…' : '') : `${shortDay(e.at || Date.now())} entry`);
};

export function LinkLesson({ uid, onPick, onClose }: { uid: string; onPick: (r: { classId: string; itemId: string; title: string; className: string }) => void; onClose: () => void }) {
  const { classes } = useTeacherClasses(uid);
  const [classId, setClassId] = useState('');
  const [lessons, setLessons] = useState<{ id: string; title: string; at: number }[] | null>(null);
  useEffect(() => {
    setLessons(null);
    if (!classId) return;
    let on = true;
    getDocs(collection(db, 'classes', classId, 'items')).then((s) => on && setLessons(s.docs.map((d) => ({ id: d.id, title: String(d.data().title || 'Untitled lesson'), at: d.data().schedule?.at ?? d.data().createdAt?.toMillis?.() ?? 0 })).sort((a, b) => b.at - a.at)), () => on && setLessons([]));
    return () => { on = false; };
  }, [classId]);
  const active = (classes ?? []).filter((c) => c.status === 'active');
  return (
    <div className="scrim" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="dialog jw-link" role="dialog" aria-label="Link a lesson">
        <h2>Link a lesson</h2>
        <label className="field"><span>Class</span>
          <NSelect value={classId} onChange={(ev) => setClassId(ev.target.value)} aria-label="Class"><option value="">Choose a class</option>{active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NSelect>
        </label>
        {classId && (lessons === null ? <p className="hint">One moment…</p> : lessons.length ? (
          <div className="jw-link-list">{lessons.slice(0, 30).map((l) => <button key={l.id} type="button" onClick={() => onPick({ classId, itemId: l.id, title: l.title, className: active.find((c) => c.id === classId)?.name ?? '' })}>{l.title}</button>)}</div>
        ) : <p className="hint">No lessons in this class yet.</p>)}
        <span className="pe-actions"><span style={{ flex: 1 }} /><button type="button" className="btn" onClick={onClose}>Cancel</button></span>
      </div>
    </div>
  );
}

// The journal's front page.
export function JournalHome({ entries, onWrite, onOpen }: { entries: Entry[]; onWrite: (e?: Partial<Entry>) => void; onOpen: (e: Entry) => void }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const t = useMemo(() => threads(entries), [entries]);
  const s = streak(entries);
  const shown = entries.filter((e) => (!tag || e.tags?.includes(tag) || e.theme === tag) && (!q.trim() || `${e.title} ${e.text} ${(e.tags ?? []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = shown.reduce((m, e) => { const k = new Date(e.at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); (m[k] ??= []).push(e); return m; }, {} as Record<string, Entry[]>);
  // Five weeks of days, each coloured by how it felt.
  const weeks = useMemo(() => {
    const byDay = new Map<string, Entry>();
    for (const e of entries) { const k = new Date(e.at).toDateString(); if (!byDay.has(k)) byDay.set(k, e); }
    const start = new Date(); start.setDate(start.getDate() - 34 - ((start.getDay() + 6) % 7) + 6);
    return Array.from({ length: 35 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return { d, e: byDay.get(d.toDateString()) }; });
  }, [entries]);
  const back = entries.find((e) => { const a = Date.now() - e.at; return (a > 27 * 864e5 && a < 33 * 864e5) || (a > 360 * 864e5 && a < 370 * 864e5); });
  return (
    <div className="jh">
      <section className="jh-hero">
        <div>
          <span className="cp-k">Your journal</span>
          <h2>{entries.length ? (s > 1 ? `${s} days in a row. Keep it going.` : 'What’s on your mind today?') : 'A quiet place to think about your teaching'}</h2>
          <p>{entries.length ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} so far. Only you can read them.` : 'A few lines after a lesson is enough. Over weeks, you’ll see what keeps coming back. Only you can read it.'}</p>
          <div className="jh-start">
            <button type="button" className="cp-primary" onClick={() => onWrite()}><UiIcon name="pen" size={16} /> Write</button>
            <button type="button" className="cp-soft" onClick={() => onWrite({ mood: 'great', title: '', text: '' })}>Something went well</button>
            <button type="button" className="cp-soft" onClick={() => onWrite({ mood: 'tough', title: '', text: '' })}>Something was hard</button>
          </div>
        </div>
        <div className="jh-cal" aria-label="The last five weeks">
          <span className="jh-cal-days" aria-hidden="true">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <i key={i}>{d}</i>)}</span>
          <span className="jh-cal-grid">
            {weeks.map(({ d, e }) => {
              const m = MOODS.find((x) => x.k === e?.mood);
              const today = d.toDateString() === new Date().toDateString();
              return <button key={d.toISOString()} type="button" className={'jh-day' + (e ? ' has' : '') + (today ? ' today' : '') + (d > new Date() ? ' future' : '')} style={m ? { ['--m' as string]: m.colour } : undefined} disabled={!e && !today} aria-label={`${shortDay(d.getTime())}${e ? `: ${e.title}` : ''}`} data-tip={e ? `${shortDay(d.getTime())} · ${e.title}` : today ? 'Today' : undefined} onClick={() => (e ? onOpen(e) : onWrite())} />;
            })}
          </span>
          <span className="jh-cal-key">{MOODS.map((m) => <span key={m.k}><i style={{ background: m.colour }} />{m.k[0].toUpperCase() + m.k.slice(1)}</span>)}</span>
        </div>
      </section>
      {(t.themes.length > 0 || t.words.length > 0 || back) && (
        <section className="jh-notice">
          {(t.themes.length > 0 || t.words.length > 0) && (
            <div className="jh-card">
              <span className="cp-k">Threads I notice · last 30 days</span>
              {t.themes.slice(0, 3).map(([k, n]) => <p key={k}>You wrote about <b>{k.toLowerCase()}</b> {n} times. <button type="button" className="cp-link" onClick={() => setTag(k)}>Read them together</button></p>)}
              {t.words.length > 0 && <p className="jh-words">Words that keep coming back: {t.words.map(([w]) => <button key={w} type="button" className="jh-word" onClick={() => setQ(w)}>{w}</button>)}</p>}
            </div>
          )}
          {back && (
            <button type="button" className="jh-card jh-back" onClick={() => onOpen(back)}>
              <span className="cp-k">{Date.now() - back.at > 300 * 864e5 ? 'A year ago' : 'A month ago'}</span>
              <b>{back.title}</b>
              <span>{back.text.slice(0, 140)}{back.text.length > 140 ? '…' : ''}</span>
              <em>What would you tell yourself now?</em>
            </button>
          )}
        </section>
      )}
      {entries.length > 0 && (
        <div className="jh-tools">
          <span className="jh-search"><UiIcon name="search" size={15} /><input type="search" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search your journal" aria-label="Search your journal" /></span>
          {tag && <button type="button" className="jw-tag on" onClick={() => setTag('')}>{tag} ×</button>}
        </div>
      )}
      {Object.entries(groups).map(([month, list]) => (
        <section key={month} className="jh-month">
          <h3>{month}</h3>
          <div className="jh-entries">
            {list.map((e) => {
              const m = MOODS.find((x) => x.k === e.mood);
              return (
                <button key={e.id} type="button" className="jh-entry" style={m ? { ['--m' as string]: m.colour } : undefined} onClick={() => onOpen(e)}>
                  <span className="jh-entry-d"><b>{new Date(e.at).getDate()}</b>{new Date(e.at).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                  <span className="jh-entry-c">
                    <b>{e.title || 'Untitled'}</b>
                    <span>{e.text.replace(/\s+/g, ' ').slice(0, 180)}{e.text.length > 180 ? '…' : ''}</span>
                    <span className="jh-entry-tags">{e.kind === 'debrief' && <i>After the lesson</i>}{e.lessonRef && <i>{e.lessonRef.title}</i>}{(e.tags ?? []).map((t) => <i key={t}>{t}</i>)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {entries.length > 0 && !shown.length && <p className="cp-empty">Nothing in your journal matches that. Try another word.</p>}
    </div>
  );
}

export const blankEntry = (p: Partial<Entry> = {}): Entry => ({ ...newReflection(), at: Date.now(), mood: '', tags: [], kind: 'entry', ...p });
