import { useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { splitWords } from '../lib/questions';

// Young learners' extras around a task: a picture of what to do, progress, the result and, for
// teachers, a few tips. Presentation only; nothing here reads or writes answers.

export type YoungAction = 'tap' | 'write' | 'drag' | 'match' | 'order' | 'listen' | 'speak' | 'read';

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
  read: (
    <>
      <path d="M24 13c-5-4-11.5-5-19-3.6v28c7.5-1.4 14-.4 19 3.6 5-4 11.5-5 19-3.6v-28C35.5 8 29 9 24 13z" fill="var(--yl-art-paper)" {...S} />
      <path d="M24 13v28" fill="none" {...S} />
      <path d="M10 17c3.5-.4 6.6 0 9.5 1.3M10 23.5c3.5-.4 6.6 0 9.5 1.3M10 30c3.5-.4 6.6 0 9.5 1.3M28.5 18.3c2.9-1.3 6-1.7 9.5-1.3M28.5 24.8c2.9-1.3 6-1.7 9.5-1.3" fill="none" {...S} stroke="var(--yl-sky-ink)" strokeWidth="2.2" />
    </>
  ),
};

export function YoungCue({ content }: { content: JSONContent | null | undefined }) {
  const action = youngAction(content);
  return (
    <span className={'yl-cue yl-cue-' + action} aria-hidden="true">
      <svg viewBox="0 0 48 48" width="34" height="34">{ART[action]}</svg>
    </span>
  );
}

// The instruction with its picture, for the head of a young learners' task.
export function YoungInstr({ content, children }: { content: JSONContent | null | undefined; children: React.ReactNode }) {
  return (
    <div className="yl-instr">
      <YoungCue content={content} />
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
      <span className="yl-medal" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="40" height="40">
          <path d={STAR} fill={all ? 'var(--yl-sun)' : 'var(--yl-art-paper)'} stroke={all ? '#b9822a' : 'currentColor'} strokeWidth="2.4" strokeLinejoin="round" />
          {!all && got > 0 && <path d={STAR} fill="var(--yl-sun)" style={{ clipPath: `inset(${100 - Math.round((got / Math.max(1, total)) * 100)}% 0 0 0)` }} />}
          {!all && <path d={STAR} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />}
        </svg>
        {all && <span className="yl-burst">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>}
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

// In the editor of a young learners' class: what learners will see, a way to see it and any tips.
export function YoungAuthorBar({ content, instructions, onPreview }: { content: JSONContent | null | undefined; instructions: string; onPreview?: () => void }) {
  const tips = youngTips(content, instructions);
  const [open, setOpen] = useState(false);
  return (
    <div className="yl-author">
      <div className="yl-author-row">
        <YoungCue content={content} />
        <span className="yl-author-text">
          <b>Young learner style</b>
          <span>Learners see big buttons and tiles to tap, with a picture of what to do.</span>
        </span>
        {tips.length > 0 && (
          <button type="button" className="btn small-btn yl-author-tips" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {tips.length === 1 ? '1 tip' : `${tips.length} tips`}
          </button>
        )}
        {onPreview && (
          <button type="button" className="btn small-btn primary" onClick={onPreview}>
            See it as a learner
          </button>
        )}
      </div>
      {open && tips.length > 0 && (
        <ul className="yl-author-list">
          {tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
