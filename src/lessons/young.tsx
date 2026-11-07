import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { splitWords } from '../lib/questions';
import { setYoungSound, youngSound, youngSoundOn } from './youngSfx';

// Young learners' extras around a task: a picture of what to do, progress, the result and, for
// teachers, a few tips. Presentation only; nothing here reads or writes answers.

export type YoungAction = 'tap' | 'write' | 'drag' | 'match' | 'order' | 'listen' | 'speak' | 'read' | 'watch' | 'sing' | 'draw' | 'play' | 'partner' | 'find' | 'think';

/** The icons a teacher can choose for a task: what learners do. In this order in the picker. */
export const YOUNG_ICONS: { id: YoungAction; label: string }[] = [
  { id: 'read', label: 'Read' },
  { id: 'listen', label: 'Listen' },
  { id: 'watch', label: 'Watch' },
  { id: 'speak', label: 'Speak' },
  { id: 'sing', label: 'Sing' },
  { id: 'write', label: 'Write' },
  { id: 'draw', label: 'Draw and colour' },
  { id: 'tap', label: 'Choose' },
  { id: 'drag', label: 'Drag' },
  { id: 'match', label: 'Match' },
  { id: 'order', label: 'Put in order' },
  { id: 'find', label: 'Look and find' },
  { id: 'think', label: 'Think' },
  { id: 'play', label: 'Play a game' },
  { id: 'partner', label: 'Work with a partner' },
];
/** A task's icon setting: missing or 'auto' picks one from the first question; 'none' shows no icon. */
export type YoungIconSetting = YoungAction | 'auto' | 'none';
export function youngIcon(setting: unknown, content: JSONContent | null | undefined): YoungAction | null {
  if (setting === 'none') return null;
  if (typeof setting === 'string' && YOUNG_ICONS.some((i) => i.id === setting)) return setting as YoungAction;
  return youngAction(content);
}
export const youngIconLabel = (a: YoungAction) => YOUNG_ICONS.find((i) => i.id === a)?.label ?? '';

const PACK_ACTION: Record<string, YoungAction> = { odd: 'tap', highlight: 'tap', label: 'drag', categorise: 'drag', sentences: 'order', pairs: 'listen', dictation: 'listen', speaking: 'speak', crossword: 'write', wordsearch: 'tap', fix: 'write', transform: 'write', gapped: 'drag', matching: 'match' };

// The first thing a learner does in the task decides the picture.
export function youngAction(content: JSONContent | null | undefined): YoungAction {
  let found: YoungAction | null = null;
  let media = false;
  const walk = (n: JSONContent) => {
    if (found) return;
    switch (n.type) {
      case 'choice': case 'mcq': found = 'tap'; return;
      case 'gap': case 'writing': found = 'write'; return;
      case 'dropgap': case 'wordbank': found = 'drag'; return;
      case 'match': found = 'match'; return;
      case 'order': found = 'order'; return;
      case 'speakingPractice': found = 'speak'; return;
      case 'gameBlock': found = 'play'; return;
      case 'drawBoard': case 'board': found = 'draw'; return;
      case 'pq': found = PACK_ACTION[String(n.attrs?.kind)] ?? 'tap'; return;
      case 'media': case 'inlineMedia': case 'offlineMedia': media = true; break;
    }
    n.content?.forEach(walk);
  };
  if (content) walk(content);
  return found ?? (media ? 'listen' : 'read');
}

const S = { stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const ART: Record<YoungAction, JSX.Element> = {
  tap: (
    <>
      <path d="M22 2.5v3M13 5.5l1.8 2M31 5.5l-1.8 2" fill="none" {...S} />
      <rect x="6" y="10" width="32" height="17" rx="7" fill="var(--yl-sky)" {...S} />
      <path d="M19 39V21a3 3 0 0 1 6 0v8l.7-.2a2.9 2.9 0 0 1 3.8 1.7l.6-.2a2.9 2.9 0 0 1 3.8 1.9l.5-.1a2.8 2.8 0 0 1 3.5 2.7v4.4a8 8 0 0 1-8 8h-3a7 7 0 0 1-5.5-2.7l-5.5-6.8a2.7 2.7 0 0 1 4.1-3.5z" fill="var(--yl-sun)" {...S} />
    </>
  ),
  write: (
    <>
      <path d="M4 41.5c2.4-3.2 4.4-3.2 6 0s3.6 3.2 6 0" fill="none" {...S} stroke="var(--yl-sky-ink)" strokeWidth="2.6" />
      <path d="M17 31 34.4 13.6a3.6 3.6 0 0 1 5.1 0l.9.9a3.6 3.6 0 0 1 0 5.1L23 37h-6z" fill="var(--yl-sun)" {...S} />
      <path d="M17 31v6h6z" fill="var(--yl-rose)" {...S} />
      <path d="m31 17 6 6" fill="none" {...S} />
    </>
  ),
  drag: (
    <>
      <rect x="22" y="29" width="22" height="15" rx="5" fill="var(--yl-art-paper)" {...S} stroke="var(--yl-leaf-ink)" strokeDasharray="4 3.4" />
      <rect x="4" y="5" width="23" height="15" rx="5" fill="var(--yl-leaf)" {...S} />
      <path d="M10 12.5h11" fill="none" {...S} />
      <path d="M13 24c0 7.5 3.5 12 9 12.6" fill="none" {...S} />
      <path d="m17.6 32.4 4.6 4.2-4.9 3.6" fill="none" {...S} />
    </>
  ),
  match: (
    <>
      <path d="M18 13.5c7 0 5 21 12 21M18 34.5c7 0 5-21 12-21" fill="none" {...S} />
      <rect x="3" y="7" width="16" height="13" rx="4.5" fill="var(--yl-rose)" {...S} />
      <rect x="29" y="28" width="16" height="13" rx="4.5" fill="var(--yl-rose)" {...S} />
      <rect x="3" y="28" width="16" height="13" rx="4.5" fill="var(--yl-sky)" {...S} />
      <rect x="29" y="7" width="16" height="13" rx="4.5" fill="var(--yl-sky)" {...S} />
    </>
  ),
  order: (
    <>
      <rect x="3" y="9" width="12.5" height="17" rx="4" fill="var(--yl-sun)" {...S} />
      <rect x="17.75" y="9" width="12.5" height="17" rx="4" fill="var(--yl-leaf)" {...S} />
      <rect x="32.5" y="9" width="12.5" height="17" rx="4" fill="var(--yl-sky)" {...S} />
      <circle cx="9.25" cy="17.5" r="1.8" fill="currentColor" />
      <circle cx="21.6" cy="17.5" r="1.8" fill="currentColor" />
      <circle cx="26.4" cy="17.5" r="1.8" fill="currentColor" />
      <circle cx="35.8" cy="17.5" r="1.8" fill="currentColor" />
      <circle cx="38.75" cy="14" r="1.8" fill="currentColor" />
      <circle cx="41.7" cy="17.5" r="1.8" fill="currentColor" />
      <path d="M5 36.5h36M36 31.5l5 5-5 5" fill="none" {...S} />
    </>
  ),
  listen: (
    <>
      <path d="M8 30v-6a16 16 0 0 1 32 0v6" fill="none" {...S} />
      <rect x="4" y="27" width="10" height="16" rx="4.5" fill="var(--yl-lilac)" {...S} />
      <rect x="34" y="27" width="10" height="16" rx="4.5" fill="var(--yl-lilac)" {...S} />
      <path d="M21.5 34V21.5l8-2.2v11.2" fill="none" {...S} />
      <circle cx="19" cy="34" r="3" fill="var(--yl-sky)" {...S} />
      <circle cx="27" cy="30.5" r="3" fill="var(--yl-sky)" {...S} />
    </>
  ),
  speak: (
    <>
      <path d="M5 11a5 5 0 0 1 5-5h28a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H21l-8.5 8v-8H10a5 5 0 0 1-5-5z" fill="var(--yl-leaf)" {...S} />
      <circle cx="15.5" cy="18.5" r="2.3" fill="currentColor" />
      <circle cx="24" cy="18.5" r="2.3" fill="currentColor" />
      <circle cx="32.5" cy="18.5" r="2.3" fill="currentColor" />
    </>
  ),
  watch: (
    <>
      <rect x="4" y="8" width="40" height="27" rx="6" fill="var(--yl-sky)" {...S} />
      <path d="M20 16v11l9-5.5z" fill="var(--yl-art-paper)" {...S} />
      <path d="M16 42h16M24 35v7" fill="none" {...S} />
    </>
  ),
  sing: (
    <>
      <path d="M17 34V12l20-5v22" fill="none" {...S} />
      <path d="M17 18l20-5" fill="none" {...S} />
      <ellipse cx="12.5" cy="35" rx="5.5" ry="4.5" fill="var(--yl-rose)" {...S} />
      <ellipse cx="32.5" cy="30" rx="5.5" ry="4.5" fill="var(--yl-rose)" {...S} />
      <path d="M41 38c1.5-1.5 3.5-1.5 5 0M40 43c2-1.8 4.5-1.8 6.5 0" fill="none" {...S} strokeWidth="2" />
    </>
  ),
  draw: (
    <>
      <path d="M5 36c6-10 10 6 16-4s9 6 14-2" fill="none" {...S} stroke="var(--yl-sky-ink)" strokeWidth="3" />
      <path d="M30 6l10 10-14 14-11 3 3-11z" fill="var(--yl-rose)" {...S} />
      <path d="M18 22l8 8" fill="none" {...S} />
      <path d="M15 33l3-11 8 8z" fill="var(--yl-art-paper)" {...S} />
      <circle cx="12" cy="42" r="2.4" fill="var(--yl-sun)" {...S} strokeWidth="1.6" />
    </>
  ),
  play: (
    <>
      <rect x="5" y="8" width="23" height="23" rx="5" fill="var(--yl-sun)" {...S} transform="rotate(-8 16.5 19.5)" />
      <circle cx="11.5" cy="15" r="2" fill="currentColor" />
      <circle cx="17" cy="20" r="2" fill="currentColor" />
      <circle cx="22.5" cy="25" r="2" fill="currentColor" />
      <rect x="24" y="22" width="19" height="19" rx="4.5" fill="var(--yl-leaf)" {...S} transform="rotate(10 33.5 31.5)" />
      <circle cx="29.5" cy="28" r="1.8" fill="currentColor" />
      <circle cx="37.5" cy="35" r="1.8" fill="currentColor" />
    </>
  ),
  partner: (
    <>
      <circle cx="15" cy="15" r="7" fill="var(--yl-sun)" {...S} />
      <circle cx="33" cy="15" r="7" fill="var(--yl-sky)" {...S} />
      <path d="M3 42c0-8 5.5-13 12-13s12 5 12 13M21 42c0-8 5.5-13 12-13s12 5 12 13" fill="var(--yl-art-paper)" {...S} />
      <path d="M12.5 15.5h.01M17.5 15.5h.01M30.5 15.5h.01M35.5 15.5h.01" fill="none" {...S} strokeWidth="3" />
    </>
  ),
  find: (
    <>
      <circle cx="20" cy="20" r="13" fill="var(--yl-sky)" {...S} />
      <circle cx="20" cy="20" r="8.5" fill="var(--yl-art-paper)" {...S} strokeWidth="1.8" />
      <path d="M30 30l12 12" fill="none" {...S} strokeWidth="5" />
      <path d="M16 17.5a5 5 0 0 1 4.5-3" fill="none" {...S} strokeWidth="2" />
    </>
  ),
  think: (
    <>
      <path d="M24 4a13 13 0 0 0-7.8 23.4c1.4 1.1 2.3 2.7 2.3 4.5V34h11v-2.1c0-1.8.9-3.4 2.3-4.5A13 13 0 0 0 24 4z" fill="var(--yl-sun)" {...S} />
      <path d="M18.5 39h11M20.5 44h7" fill="none" {...S} />
      <path d="M24 34v-9l-4-4M24 25l4-4" fill="none" {...S} strokeWidth="2" />
    </>
  ),
  read: (
    <>
      <path d="M24 13c-5-4-11.5-5-19-3.6v28c7.5-1.4 14-.4 19 3.6 5-4 11.5-5 19-3.6v-28C35.5 8 29 9 24 13z" fill="var(--yl-art-paper)" {...S} />
      <path d="M24 13v28" fill="none" {...S} />
      <path d="M10 17c3.5-.4 6.6 0 9.5 1.3M10 23.5c3.5-.4 6.6 0 9.5 1.3M10 30c3.5-.4 6.6 0 9.5 1.3M28.5 18.3c2.9-1.3 6-1.7 9.5-1.3M28.5 24.8c2.9-1.3 6-1.7 9.5-1.3" fill="none" {...S} stroke="var(--yl-sky-ink)" strokeWidth="2.2" />
    </>
  ),
};

export function YoungArt({ action, size = 34 }: { action: YoungAction; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      {ART[action]}
    </svg>
  );
}

export function YoungCue({ content, icon }: { content: JSONContent | null | undefined; icon?: unknown }) {
  const action = youngIcon(icon, content);
  if (!action) return null;
  return (
    <span className={'yl-cue yl-cue-' + action} title={youngIconLabel(action)} aria-hidden="true">
      <YoungArt action={action} />
    </span>
  );
}

// The instruction with its picture, for the head of a young learners' task.
export function YoungInstr({ content, icon, children }: { content: JSONContent | null | undefined; icon?: unknown; children: React.ReactNode }) {
  return (
    <div className="yl-instr">
      <YoungCue content={content} icon={icon} />
      <div className="yl-instr-text">{children}</div>
    </div>
  );
}

// Answered so far: one step for each question, or a bar when there are many.
export function YoungProgress({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const steps = total <= 12;
  return (
    <span className={'yl-progress' + (steps ? ' steps' : ' bar') + (done >= total ? ' full' : '')} aria-hidden="true">
      {steps ? Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? 'on' : ''} />) : <i style={{ width: `${Math.round((done / total) * 100)}%` }} />}
    </span>
  );
}

const STAR = 'M24 5.5l5.4 11 12.1 1.8-8.8 8.5 2.1 12L24 33.1l-10.8 5.7 2.1-12-8.8-8.5 12.1-1.8z';

// The result after checking: a star and a short message. All right gets a small celebration.
export function YoungScore({ got, total, children }: { got: number; total: number; children: React.ReactNode }) {
  const all = total > 0 && got >= total;
  const message = total <= 0 ? '' : all ? 'Every answer is right. Well done.' : got > 0 ? 'Good work. Look again at the answers with a cross.' : 'Look again at the answers with a cross.';
  return (
    <span className={'score yl-score' + (all ? ' all' : '')} role="status">
      <YoungBuddy mood={all ? 'cheer' : got > 0 ? 'happy' : 'think'} size={52} />
      <span className="yl-medal" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="40" height="40">
          <path d={STAR} fill={all ? 'var(--yl-sun)' : 'var(--yl-art-paper)'} stroke={all ? '#b9822a' : 'currentColor'} strokeWidth="2.4" strokeLinejoin="round" />
          {!all && got > 0 && <path d={STAR} fill="var(--yl-sun)" style={{ clipPath: `inset(${100 - Math.round((got / Math.max(1, total)) * 100)}% 0 0 0)` }} />}
          {!all && <path d={STAR} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />}
        </svg>
        {all && <span className="yl-burst">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>}
      </span>
      <span className="yl-score-text">
        <span className="yl-score-n">{children}</span>
        {message && <span className="yl-score-msg">{message}</span>}
      </span>
    </span>
  );
}

// Tips for the teacher, from the task as it is now. Only things that make the task harder for
// young learners, never errors: the task still saves and works.
export function youngTips(content: JSONContent | null | undefined, instructions: string): string[] {
  const tips: string[] = [];
  const instr = splitWords(instructions ?? '').length;
  if (!instr) tips.push('Add a short instruction, like “Tap the right word.” Learners see it next to a picture of what to do.');
  else if (instr > 12) tips.push(`The instruction has ${instr} words. Twelve or fewer is easier for young learners to read.`);
  let questions = 0, longChoice = false, manyChoices = 0, bigMatch = 0, longOrder = 0;
  const walk = (n: JSONContent) => {
    const a = n.attrs ?? {};
    if (['gap', 'choice', 'mcq', 'match', 'dropgap', 'order', 'writing', 'pq'].includes(n.type ?? '') && !a.example) questions += n.type === 'match' ? Math.max(1, (a.pairs ?? []).length) : 1;
    if ((n.type === 'choice' || n.type === 'mcq') && Array.isArray(a.options)) {
      const opts = (a.options as string[]).filter((o) => o.trim());
      if (opts.some((o) => splitWords(o).length > 6)) longChoice = true;
      if (opts.length > 4) manyChoices = Math.max(manyChoices, opts.length);
    }
    if (n.type === 'match') bigMatch = Math.max(bigMatch, (a.pairs ?? []).length);
    if (n.type === 'order') longOrder = Math.max(longOrder, splitWords(String(a.sentence ?? '')).length);
    n.content?.forEach(walk);
  };
  if (content) walk(content);
  if (longChoice) tips.push('Some choices are long. Short choices, one to six words, are easier to read and tap.');
  if (manyChoices) tips.push(`A question has ${manyChoices} choices. Three or four is easier for young learners.`);
  if (bigMatch > 6) tips.push(`The matching has ${bigMatch} pairs. Six or fewer fit on a tablet without scrolling.`);
  if (longOrder > 8) tips.push(`A sentence to put in order has ${longOrder} words. Eight or fewer is easier.`);
  if (questions > 10) tips.push(`This task has ${questions} questions. Shorter tasks help learners finish and feel good. You can split it into two tasks.`);
  return tips;
}

// In the editor of a young learners' class: the task's icon, which the teacher can change or turn
// off, and any tips, kept out of the way until asked for.
export function YoungIconPicker({ value, content, instructions, onChange }: { value: YoungIconSetting | undefined; content: JSONContent | null | undefined; instructions: string; onChange: (v: YoungIconSetting) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tips = youngTips(content, instructions);
  const setting: YoungIconSetting = value ?? 'auto';
  const shown = youngIcon(setting, content);
  const auto = youngAction(content);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (v: YoungIconSetting) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="yl-pick" ref={box}>
      <button type="button" className={'yl-pick-btn' + (shown ? ' yl-cue yl-cue-' + shown : ' none')} aria-haspopup="dialog" aria-expanded={open} aria-label={`Task icon: ${shown ? youngIconLabel(shown) : 'none'}. Change it`} data-tip="Task icon: change it or turn it off" onClick={() => setOpen((o) => !o)}>
        {shown ? <YoungArt action={shown} /> : <span className="yl-pick-off">No icon</span>}
        {tips.length > 0 && <span className="yl-pick-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="yl-pick-pop" role="dialog" aria-label="Task icon">
          <p className="yl-pick-h">What do learners do?</p>
          <div className="yl-pick-grid">
            <button type="button" className={'yl-pick-opt' + (setting === 'auto' ? ' on' : '')} aria-pressed={setting === 'auto'} onClick={() => pick('auto')}>
              <span className={'yl-cue yl-cue-' + auto}>
                <YoungArt action={auto} size={28} />
              </span>
              <span>Choose for me</span>
            </button>
            {YOUNG_ICONS.map((i) => (
              <button key={i.id} type="button" className={'yl-pick-opt' + (setting === i.id ? ' on' : '')} aria-pressed={setting === i.id} onClick={() => pick(i.id)}>
                <span className={'yl-cue yl-cue-' + i.id}>
                  <YoungArt action={i.id} size={28} />
                </span>
                <span>{i.label}</span>
              </button>
            ))}
            <button type="button" className={'yl-pick-opt' + (setting === 'none' ? ' on' : '')} aria-pressed={setting === 'none'} onClick={() => pick('none')}>
              <span className="yl-cue yl-pick-none" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M6 18 18 6" stroke="currentColor" strokeWidth="2" />
                </svg>
              </span>
              <span>No icon</span>
            </button>
          </div>
          {tips.length > 0 && (
            <div className="yl-pick-tips">
              <p className="yl-pick-h">{tips.length === 1 ? 'A tip for this task' : 'Tips for this task'}</p>
              <ul>
                {tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- The buddy ----------------------------------------------------------------------------------------
/** Pip the owl keeps learners company: waves when a task opens, cheers when every answer is right. */
export type BuddyMood = 'hello' | 'idle' | 'happy' | 'cheer' | 'think';
export function YoungBuddy({ mood, size = 64 }: { mood: BuddyMood; size?: number }) {
  return (
    <span className={'yl-buddy yl-buddy-' + mood} aria-hidden="true">
      <svg viewBox="0 0 64 70" width={size} height={size * 1.1}>
        <g className="yl-buddy-body">
          <path d="M14 30c0-14 8-24 18-24s18 10 18 24v14c0 12-8 20-18 20S14 56 14 44z" fill="#b98a5e" stroke="#4a3526" strokeWidth="2.4" />
          <path d="M20 44c0-8 5-13 12-13s12 5 12 13-5 14-12 14-12-6-12-14z" fill="#f2dcbc" />
          <path d="M14 14l6 10M50 14l-6 10" stroke="#4a3526" strokeWidth="2.4" strokeLinecap="round" />
          <g className="yl-buddy-eyes">
            <circle cx="24" cy="26" r="7.5" fill="#fff" stroke="#4a3526" strokeWidth="2" />
            <circle cx="40" cy="26" r="7.5" fill="#fff" stroke="#4a3526" strokeWidth="2" />
            <circle className="yl-buddy-pupil" cx="25" cy="27" r="3.4" fill="#2a1d14" />
            <circle className="yl-buddy-pupil" cx="39" cy="27" r="3.4" fill="#2a1d14" />
          </g>
          <path className="yl-buddy-happy-eyes" d="M18.5 27c2-4 9-4 11 0M34.5 27c2-4 9-4 11 0" fill="none" stroke="#2a1d14" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M29 33l3 4 3-4z" fill="#f0a63a" stroke="#4a3526" strokeWidth="1.6" strokeLinejoin="round" />
          <path className="yl-buddy-wing yl-buddy-wing-l" d="M15 38c-6 2-9 8-8 13 5 0 9-4 10-9z" fill="#9c7049" stroke="#4a3526" strokeWidth="2" strokeLinejoin="round" />
          <path className="yl-buddy-wing yl-buddy-wing-r" d="M49 38c6 2 9 8 8 13-5 0-9-4-10-9z" fill="#9c7049" stroke="#4a3526" strokeWidth="2" strokeLinejoin="round" />
          <path d="M26 64v3M38 64v3" stroke="#f0a63a" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
}

// ---- Sounds and moments ----------------------------------------------------------------------------

/**
 * The sounds of a young learners' task: a tap on anything to press, a pop as each answer goes in, a
 * chime or a gentle boing when answers are checked, and a fanfare when every answer is right.
 */
export function YoungEffects({ taskId, answered, checked, got, total }: { taskId: string; answered: number; checked: boolean; got: number; total: number }) {
  const last = useRef({ taskId, answered, checked });
  useEffect(() => {
    const prev = last.current;
    last.current = { taskId, answered, checked };
    if (prev.taskId !== taskId) {
      // The new task springs in.
      const frame = document.querySelector("[data-lesson-style='young'].task-frame, [data-lesson-style='young'] .task-frame");
      if (frame) {
        frame.classList.remove('yl-enter');
        void (frame as HTMLElement).offsetWidth;
        frame.classList.add('yl-enter');
      }
      return void youngSound('next');
    }
    if (checked && !prev.checked) {
      if (total > 0 && got >= total) {
        youngSound('fanfare');
        setTimeout(() => youngSound('star'), 650);
      } else youngSound(got > 0 ? 'right' : 'again');
    } else if (!checked && answered > prev.answered) youngSound('pop');
  }, [taskId, answered, checked, got, total]);
  useEffect(() => {
    const tap = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest?.("[data-lesson-style='young'] .task-body")) return;
      if (t.closest('button, [role="button"], label, .opt, .c-opt, .match-item, .bank-word, .order-word, input[type="radio"], input[type="checkbox"]')) youngSound('tap');
    };
    document.addEventListener('pointerdown', tap);
    return () => document.removeEventListener('pointerdown', tap);
  }, []);
  return null;
}

/** Sounds on or off, for the learner. */
export function YoungSoundToggle() {
  const [on, setOn] = useState(youngSoundOn);
  useEffect(() => {
    const sync = () => setOn(youngSoundOn());
    window.addEventListener('yl-sound', sync);
    return () => window.removeEventListener('yl-sound', sync);
  }, []);
  return (
    <button type="button" className={'yl-sound' + (on ? ' on' : '')} aria-pressed={on} aria-label={on ? 'Sounds on' : 'Sounds off'} title={on ? 'Sounds on' : 'Sounds off'} onClick={() => (setYoungSound(!on), !on && youngSound('pop'))}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor" />
        {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
