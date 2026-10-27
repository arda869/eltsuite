import { PdfStack, toStack } from '../pdf/PdfStack';
import { InkSvg, MARK_COLORS } from '../pdf/PdfNodes';
import type { PageSize } from '../pdf/pdfData';
import { createPortal } from 'react-dom';
import { TimelineFigure, type TlAttrs } from '../editor/Timeline';
import { DiagramFrame, cellStyle, type DgAttrs, type DgKind } from '../editor/Diagram';
import { LetterGap } from './LetterGap';
import { PicFrame } from '../editor/Picture';
import { listLabel } from '../lib/listLabel';
import { BankLinkCard } from '../editor/BankLink';
import { SurveyBlock } from './Survey';
import { criteriaOf, genreLabel } from '../lib/rubric';
import { PackQuestion } from './PackRender';
import { answerFromKey } from '../lib/pack';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DefCard, type DefData } from '../editor/Definition';
import { speakerVars } from '../editor/Dialogue';
import { StressedWord } from '../editor/Stress';
import { LinkMark, prosodyAttrs } from '../editor/Prosody';
import { SubstSlot, type SubstLines } from '../editor/Subst';
import { PhonView } from '../editor/Phonemes';
import { TimeNotes, TTBlock, useTrainingClass, type Fields, type TTKind } from '../training/Training';
import { DictCutout } from '../editor/DictCut';
import { glabelAttrs } from '../editor/Symbols';
import { highlightBg } from '../editor/Highlight';
import { textColor } from '../editor/TextColor';
import { cellBg } from '../editor/tableStyle';
import { Icon } from '../editor/Icons';
import { Sym } from '../editor/Symbols';
import { Board, type BoardAttrs, type BoardMe } from './Board';
import { BoardTask, type BoardAttrs2 } from './BoardTask';
import { MentionTag } from '../editor/Mention';
import { AnswerMarkup, CodeKey } from './AnswerMarkup';
import type { Annotation, Code } from '../lib/annotations';
import type { Correction } from '../lib/tasks';
import { RevealBlock } from '../editor/Reveal';
import type { CoverMode, CoverProps } from '../editor/PicEdit';
import { MediaPlayer } from '../media/Player';
import { UploadBox, type UploadAnswer, type UploadAttrs } from '../editor/UploadNode';
import { CollabTask, type CollabAttrs } from '../collab/CollabTask';
import { LinkCardView } from '../editor/LinkCard';
import { IpaText } from '../editor/Ipa';
import { ReflectBlock } from './ReflectBlock';
import type { ReflectAnswer, RItem } from '../editor/Reflect';
import { LINK_ICON } from '../editor/LessonLink';
import type { JSONContent } from '@tiptap/react';
import { RichAnswer } from './RichAnswer';
import { BoxFrame, type BoxAttrs } from '../editor/TextBox';
import { drawnCards, isAnswered, normalise, pickState, scoreQuestion, splitKey, splitWords, textOf, type AnswerKey, type PickState, type Response, type Responses } from '../lib/questions';
import { PickStage, type PickLook } from './PickStage';
import type { SharedPick } from '../lib/picks';
import type { SentFeedback } from '../lib/feedback';

const LETTERS = 'abcdefghijklmnop';

type Props = {
  content: JSONContent | null;
  responses: Responses;
  onChange?: (id: string, value: Response) => void;
  results?: AnswerKey | null; // when present, show right and wrong
  hideAnswers?: boolean; // show only right or wrong, not the correct answer
  disabled?: boolean;
  layout?: 'single' | 'two' | 'two-wide' | 'media';
  colScroll?: 'separate' | 'together';
  revealed?: AnswerKey | null; // answers the teacher has revealed to the class
  flags?: string[]; // questions the learner flagged to come back to
  onToggleFlag?: (id: string) => void;
  // "Draw a card" played together: the class pile, and who is looking at it.
  shared?: Record<string, SharedPick>;
  onSharedDraw?: (pickId: string, next: PickState, seq: number) => void;
  onSharedReset?: (pickId: string) => void;
  teacher?: boolean;
  onOpenTask?: (taskId: string) => void; // links to another task in the lesson
  onOpenNotebook?: (entryId: string) => void; // links to a notebook page
  taskState?: (taskId: string) => 'open' | 'locked' | 'missing';
  classmates?: { id: string; name: string }[];
  selfId?: string;
  received?: SentFeedback[]; // peer feedback other learners sent to this learner
  classId?: string; // for audio clips
  boardMe?: BoardMe; // who is posting on message boards
  teacherMarks?: Record<string, { score: number | null; comment: string; crit?: Record<string, number | null> }>; // teacher's marks on long answers
  writingReview?: { anns: Annotation[]; corrections: Record<string, Correction>; codes: Code[]; onResubmit: (qid: string) => void };
  liveHere?: boolean; // learners: the teacher is teaching this lesson now
  asExample?: boolean; // an example question, shown answered and numbered 0
};

const TICK = (
  <svg className="tick" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-label="correct">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

function DefWord({ word, data, children }: { word: string; data: DefData; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const shut = useRef(0);
  const enter = () => window.clearTimeout(shut.current);
  const leave = () => {
    window.clearTimeout(shut.current);
    shut.current = window.setTimeout(() => !pinned && setOpen(false), 160);
  };
  const [at, setAt] = useState<{ top: number; left: number; below: boolean; vars?: Record<string, string> }>({ top: 0, left: 0, below: true });
  useEffect(() => {
    if (!pinned) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && !cardRef.current?.contains(e.target as Node) && (setPinned(false), setOpen(false));
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pinned]);
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom > 320 || r.top < 320;
    const w = Math.min(320, window.innerWidth - 24);
    // The card is drawn on the page itself (a zoomed or tilted box around the word would push a
    // fixed card away from it), with the class colours of the word's place.
    const cs = getComputedStyle(ref.current!);
    const vars = Object.fromEntries(['--accent', '--accent-text', '--tint', '--tint-strong'].map((k) => [k, cs.getPropertyValue(k)]).filter(([, v]) => v));
    setAt({ below, top: below ? r.bottom + 6 : r.top - 6, left: Math.max(12, Math.min(r.left - 8, window.innerWidth - 12 - w)), vars });
  };
  useEffect(() => {
    if (!open) return;
    const close = () => (setOpen(false), setPinned(false));
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);
  return (
    <span
      ref={ref}
      className={'def-word' + (open ? ' open' : '')}
      onMouseEnter={() => (enter(), place(), setOpen(true))}
      onMouseLeave={leave}
    >
      <button type="button" className="def-trigger" aria-expanded={open} onClick={() => (place(), setPinned(!pinned), setOpen(!pinned))}>
        {children}
      </button>
      {open &&
        createPortal(
          <span ref={cardRef} className={'def-card' + (at.below ? ' below' : ' above')} style={{ top: at.top, left: at.left, ...(at.vars as object) }} role="tooltip" onMouseEnter={enter} onMouseLeave={leave}>
            <DefCard word={word} d={data} />
          </span>,
          document.body,
        )}
    </span>
  );
}

function marks(text: ReactNode, m: JSONContent['marks']) {
  let out = text;
  const def = m?.find((x) => x.type === 'definition');
  for (const mark of m ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'link' && /^https:\/\//i.test(mark.attrs?.href ?? '')) out = <a href={mark.attrs!.href} target="_blank" rel="noopener noreferrer" className="web-link">{out}</a>;
    else if (mark.type === 'textColor') out = <span style={{ color: textColor(mark.attrs?.color) }}>{out}</span>;
    else if (mark.type === 'highlight') out = <mark className="hl" style={{ backgroundColor: highlightBg(mark.attrs?.color) }}>{out}</mark>;
    else if (mark.type === 'glabel') out = <span {...glabelAttrs(mark.attrs)}>{out}</span>;
    else {
      const p = prosodyAttrs(mark.type, mark.attrs);
      if (p) out = <span {...p}>{out}</span>;
    }
  }
  if (def) out = <DefWord word={String(text)} data={(def.attrs?.data ?? {}) as DefData}>{out}</DefWord>;
  return out;
}

// True on phone-sized screens.
function useNarrow() {
  const q = '(max-width: 700px)';
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setN(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return n;
}
const questionsIn = (n: JSONContent): string[] => [...(n.attrs?.id && QTYPES.includes(n.type ?? '') ? [n.attrs.id as string] : []), ...(n.content ?? []).flatMap(questionsIn)];

const QTYPES = ['gap', 'mcq', 'choice', 'match', 'dropgap', 'order', 'writing', 'pq'];
// Reflection blocks are answered but not numbered.

export function TaskRenderer({ content, responses: responsesIn, onChange, results, disabled, hideAnswers, layout = 'single', colScroll = 'separate', revealed, flags, onToggleFlag, shared, onSharedDraw, onSharedReset, teacher, onOpenTask, onOpenNotebook, taskState, classmates, selfId, received, classId, boardMe, teacherMarks, writingReview, liveHere, asExample }: Props) {
  const picCount: Record<string, number> = {}; // picture labels count on in reading order
  const [picked, setPicked] = useState<string | null>(null); // word picked from a word bank
  const [pair, setPair] = useState<{ id: string; side: 'l' | 'r'; i: number } | null>(null); // half-made match
  const locked = disabled || !!results;
  const training = useTrainingClass(classId);
  const narrow = useNarrow();
  const [tab, setTab] = useState(0);
  // Covered pictures: boxes opened here. On the teaching screen the teacher's boxes open for the
  // whole class; learners then see what the teacher has opened.
  const [covers, setCovers] = useState<Record<string, number[]>>({});
  const coverOf = (a: Record<string, unknown>): CoverProps | undefined => {
    const mode = String(a.cover ?? '') as CoverMode;
    if (!mode) return undefined;
    const pid = String(a.pid ?? '');
    const grid = Number(a.grid) || 3;
    const key = 'cov_' + pid;
    const byTeacher = String(a.coverBy ?? 'teacher') !== 'learner';
    const live = byTeacher && !!shared && !!pid && (teacher || !!liveHere);
    if (live && teacher)
      return { mode, grid, opened: shared?.[key]?.b ?? covers[pid] ?? [], canOpen: true, teacherTools: true, onChange: (b) => (setCovers((c) => ({ ...c, [pid]: b })), onSharedDraw?.(key, { h: [], b }, (shared?.[key]?.seq ?? 0) + 1)) };
    if (live) return { mode, grid, opened: shared?.[key]?.b ?? [], canOpen: false, onChange: () => {} };
    return { mode, grid, opened: covers[pid] ?? [], canOpen: true, teacherTools: !!teacher, onChange: (b) => setCovers((c) => ({ ...c, [pid]: b })) };
  };

  // Teaching screen: revealed answers are written into the questions, the way a learner's
  // answer looks (blue pen), instead of a chip next to an empty question.
  const penKey = teacher && revealed && !results ? revealed : null;
  const responses: Responses = useMemo(() => {
    if (!penKey) return responsesIn;
    const out: Responses = { ...responsesIn };
    for (const [id, e] of Object.entries(penKey)) {
      if (e.kind === 'gap') out[id] = e.answers[0] ?? '';
      else if (e.kind === 'mcq') out[id] = e.correct;
      else if (e.kind === 'multi') out[id] = e.correct;
      else if (e.kind === 'match') out[id] = e.map;
      else if (e.kind === 'drop' || e.kind === 'order') out[id] = e.answer;
      else if (e.kind === 'pack') out[id] = answerFromKey(e) as Responses[string];
    }
    return out;
  }, [penKey, responsesIn]);
  const inPen = (id: string) => !!penKey?.[id] && penKey[id].kind !== 'writing';
  const pf = (id: string) => (inPen(id) ? ' pen-fill' : '');

  // Numbering: (1), (2)… in reading order; matching uses one number per row.
  let n = 0;
  const numbers: Record<string, number> = {};
  const listed = new Set<string>();
  // A pick played together uses the class pile; otherwise this person's own draws.
  const sharedOn = (node: JSONContent) => node.attrs?.play === 'class' && !!shared;
  const pickOf = (node: JSONContent): PickState => {
    const id = node.attrs?.id as string;
    if (sharedOn(node)) return { h: shared?.[id]?.h ?? [], b: shared?.[id]?.b ?? [] };
    return pickState(responses[id]);
  };
  const walk = (node: JSONContent, inOl: boolean) => {
    const ol = inOl || node.type === 'orderedList';
    if (node.type === 'randomPick') {
      // Only drawn cards are numbered, in the order they were drawn.
      for (const i of drawnCards(pickOf(node) as unknown as Response)) if (node.content?.[i]) walk(node.content[i], ol);
      return;
    }
    if (node.attrs?.id && !node.attrs.example && QTYPES.includes(node.type ?? '') && !(node.type === 'pq' && node.attrs.kind === 'speaking')) {
      numbers[node.attrs.id] = asExample ? 0 : n + 1;
      if (!asExample) n += node.type === 'match' ? Math.max(1, (node.attrs.left ?? []).length) : node.type === 'pq' && node.attrs.kind === 'matching' ? Math.max(1, (node.attrs.data?.statements ?? []).length) : 1;
      if (ol) listed.add(node.attrs.id);
    }
    node.content?.forEach((c) => walk(c, ol));
  };
  if (content) walk(content, false);

  // Words already placed in drag-and-drop gaps.
  const placedWords: string[] = [];
  const collectDrops = (node: JSONContent) => {
    if (node.type === 'dropgap' && node.attrs?.id && isAnswered(responses[node.attrs.id])) placedWords.push(String(responses[node.attrs.id]));
    node.content?.forEach(collectDrops);
  };
  if (content) collectDrops(content);

  const FLAG = (
    <svg width="9" height="10" viewBox="0 0 20 22" aria-hidden="true">
      <path d="M3 21V2M3 3h12l-2.5 4L15 11H3" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
  const num = (id: string, offset = 0) => {
    const flagged = flags?.includes(id);
    if (onToggleFlag && offset === 0 && !results)
      return (
        <button
          type="button"
          className={'q-num flag-btn' + (flagged ? ' flagged' : '') + (listed.has(id) ? ' listed' : '')}
          title={flagged ? 'Remove flag' : 'Flag to come back later'}
          aria-label={`Question ${numbers[id]}: ${flagged ? 'flagged, tap to remove the flag' : 'tap to flag it for later'}`}
          aria-pressed={flagged}
          onClick={() => onToggleFlag(id)}
        >
          {!listed.has(id) && numbers[id]}
          <span className="flag-icon">{FLAG}</span>
        </button>
      );
    return listed.has(id) && offset === 0 ? null : (
      <sup className="q-num" aria-hidden="true">
        {numbers[id] + offset}
      </sup>
    );
  };

  // Answer the teacher has revealed, shown next to the question.
  const revealOf = (node: JSONContent): string | null => {
    const id = node.attrs?.id as string;
    const e = revealed?.[id];
    if (!e || results || inPen(id)) return null;
    const options: string[] = node.attrs?.options ?? [];
    switch (e.kind) {
      case 'gap':
        return e.answers.join(' / ');
      case 'mcq':
        return options[e.correct] ?? null;
      case 'multi':
        return e.correct.map((i) => options[i]).join(', ');
      case 'drop':
      case 'order':
        return e.answer;
      case 'match':
        return e.map.map((m, i) => `${numbers[id] + i}–${LETTERS[m]}`).join('  ');
      default:
        return null;
    }
  };
  // An example: numbered 0, with its answer written in, like the first line of a coursebook exercise.
  const exampleOf = (node: JSONContent, key: string) => {
    const a = node.attrs ?? {};
    const options: string[] = a.options ?? [];
    const correct: number[] = Array.isArray(a.correct) ? a.correct : [a.correct];
    const answer = node.type === 'gap' ? (a.answers ?? [])[0] ?? '' : node.type === 'dropgap' ? String(a.answer ?? '') : correct.map((i) => options[i]).filter(Boolean).join(', ');
    const radio = node.type === 'choice' && (a.display === 'radio' || a.display === 'truefalse' || a.display === 'tfng');
    if (radio)
      return (
        <span key={key} className="example-q radio" data-bk={key}>
          <sup className="q-n">0</sup>
          {options.map((o, i) => (
            <span key={i} className={'ex-opt' + (correct.includes(i) ? ' on' : '')}>
              <span className="ex-dot" aria-hidden="true" />
              {o}
            </span>
          ))}
          <span className="ex-tag">Example</span>
        </span>
      );
    return (
      <span key={key} className="example-q" data-bk={key} title="Example">
        <sup className="q-n">0</sup>
        <span className="ex-answer">{answer || '…'}</span>
        {a.stem && <span className="wf-stem">{a.stem}</span>}
      </span>
    );
  };
  // A whole question as an example: the same question, answered in blue pen and not marked.
  const exampleBlock = (node: JSONContent, key: string) => {
    const id = String(node.attrs?.id ?? '');
    const { content: c, key: k } = splitKey({ type: 'doc', content: [{ ...node, attrs: { ...node.attrs, example: false } }] });
    const writingEx = node.type === 'writing';
    return (
      <div key={key} data-bk={key} className="example-block">
        <span className="ex-tag">Example</span>
        <TaskRenderer content={c} responses={writingEx ? { [id]: String(node.attrs?.model ?? '') } : {}} revealed={writingEx ? null : k} teacher disabled classId={classId} asExample />
      </div>
    );
  };
  const revealChip = (node: JSONContent) => {
    const t = revealOf(node);
    return t ? <span className="reveal-ans">{t}</span> : null;
  };

  const resultText = (key: string, id: string, shown: string, right: boolean, fix?: string) => (
    <span key={key} className="gap-result">
      {num(id)}
      <span className={right ? 'ans right' : 'ans wrong'}>{shown || '—'}</span>
      {right ? TICK : !hideAnswers && fix && <span className="fix">{fix}</span>}
    </span>
  );

  // Question renderers ----------------------------------------------------------------

  const gap = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const value = String(responses[id] ?? '');
    const entry = results?.[id];
    if (results) {
      const right = scoreQuestion(entry, value).got === 1;
      return resultText(key, id, value, right, entry?.kind === 'gap' ? entry.answers[0] : undefined);
    }
    if (node.attrs?.letters && node.attrs?.pattern)
      return (
        <span key={key} className="gap-wrap lg-wrap" data-qid={id}>
          {num(id)}
          <LetterGap key={id + pf(id)} pattern={String(node.attrs.pattern)} value={value} disabled={disabled} label={`Question ${numbers[id]}`} className={pf(id)} onChange={(v) => onChange?.(id, v)} />
          {revealChip(node)}
        </span>
      );
    return (
      <span key={key} className="gap-wrap" data-qid={id}>
        {num(id)}
        <input
          key={id + pf(id)}
          className={'gap-input' + pf(id)}
          placeholder=" "
          aria-label={`Question ${numbers[id]}`}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          size={Math.max(6, value.length + 1)}
          onChange={(e) => onChange?.(id, e.target.value)}
        />
        {node.attrs?.stem && <span className="wf-stem">{node.attrs.stem}</span>}
        {revealChip(node)}
      </span>
    );
  };

  const optionState = (i: number, chosen: number[], correct: number[]) => {
    if (!results) return chosen.includes(i) ? 'on' : '';
    if (correct.includes(i) && (!hideAnswers || chosen.includes(i))) return 'right';
    return chosen.includes(i) ? 'wrong' : '';
  };

  const choiceOptions = (id: string, options: string[], multi: boolean, display: string) => {
    const raw = responses[id];
    const chosen: number[] = Array.isArray(raw) ? raw : isAnswered(raw) ? [Number(raw)] : [];
    const entry = results?.[id];
    const correct = entry?.kind === 'multi' ? entry.correct : entry?.kind === 'mcq' ? [entry.correct] : [];
    const toggle = (i: number) => {
      if (multi) onChange?.(id, chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i].sort());
      else onChange?.(id, chosen.includes(i) ? '' : i); // clicking the chosen option again clears it
    };
    return options.map((o, i) =>
      o.trim() ? (
        <label key={i + pf(id)} className={'opt ' + optionState(i, chosen, correct) + pf(id)}>
          <input type={multi ? 'checkbox' : 'radio'} name={id} checked={chosen.includes(i)} disabled={locked} onChange={() => {}} onClick={() => toggle(i)} />
          {display === 'radio' ? (
            <span className={multi ? 'radio square' : 'radio'} aria-hidden="true" />
          ) : (
            <span className={multi ? 'letter square' : 'letter'} aria-hidden="true">
              {LETTERS[i]}
            </span>
          )}
          <span>{o}</span>
        </label>
      ) : null,
    );
  };

  const choice = (node: JSONContent, key: string) => {
    const a = node.attrs!;
    const id = a.id as string;
    const options: string[] = a.options ?? [];
    const display = (a.display ?? 'letters') as string;
    const multi = !!a.multi;
    if (display === 'dropdown') {
      // Options in the line, separated by slashes; the chosen one is circled.
      const raw = responses[id];
      const chosen: number[] = Array.isArray(raw) ? raw : isAnswered(raw) ? [Number(raw)] : [];
      const entry = results?.[id];
      const correct = entry?.kind === 'multi' ? entry.correct : entry?.kind === 'mcq' ? [entry.correct] : [];
      const shown = options.map((o, i) => ({ o, i })).filter((x) => x.o.trim());
      const pick = (i: number) => {
        if (multi) onChange?.(id, chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i].sort());
        else onChange?.(id, chosen.includes(i) ? '' : i);
      };
      return (
        <span key={key} className="slash-choice" data-qid={id} role={multi ? 'group' : 'radiogroup'} aria-label={`Question ${numbers[id]}`}>
          {num(id)}
          {shown.map(({ o, i }, k) => {
            const state = optionState(i, chosen, correct);
            const isOk = results && state === 'right' && chosen.includes(i);
            return (
              <span key={i}>
                {k > 0 && <span className="slash-sep" aria-hidden="true">/</span>}
                <button
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={chosen.includes(i)}
                  key={i + pf(id)}
                  className={'slash-opt ' + state + pf(id)}
                  disabled={locked}
                  onClick={() => pick(i)}
                >
                  {o}
                </button>
                {isOk && TICK}
              </span>
            );
          })}
          {revealChip(node)}
        </span>
      );
    }
    if (display === 'radio')
      return (
        <span key={key} className="stacked-choice" data-qid={id} role={multi ? 'group' : 'radiogroup'} aria-label={`Question ${numbers[id]}`}>
          <span className="stack-num">{num(id)}</span>
          <span className="stack">
            {choiceOptions(id, options, multi, display)}
            {revealChip(node)}
          </span>
        </span>
      );
    return (
      <span key={key} className={'inline-choice d-' + display} data-qid={id} role={multi ? 'group' : 'radiogroup'} aria-label={`Question ${numbers[id]}`}>
        {num(id)}
        {choiceOptions(id, options, multi, display)}
        {revealChip(node)}
      </span>
    );
  };

  const mcq = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    return (
      <fieldset key={key} className="mcq-q" data-qid={node.attrs?.id}>
        <legend>
          {num(id)}
          {node.attrs!.prompt}
        </legend>
        <div className="opts">{choiceOptions(id, node.attrs!.options ?? [], !!node.attrs!.multi, 'letters')}</div>
      </fieldset>
    );
  };

  const match = (node: JSONContent, key: string) => {
    const a = node.attrs!;
    const id = a.id as string;
    const left: string[] = a.left ?? [];
    const right: string[] = a.right ?? [];
    const raw = responses[id];
    const chosen: number[] = Array.isArray(raw) ? raw : [];
    const entry = results?.[id];
    const map = entry?.kind === 'match' ? entry.map : [];
    const live = !results && !disabled;
    const setMatch = (li: number, rk: number) => {
      const next = [...chosen];
      while (next.length < left.length) next.push(-1);
      next[li] = next[li] === rk ? -1 : rk;
      onChange?.(id, next);
      setPair(null);
    };
    const pickLeft = (i: number) => {
      if (!live) return;
      if (pair?.id === id && pair.side === 'r') return setMatch(i, pair.i);
      if ((chosen[i] ?? -1) >= 0 && !(pair?.id === id && pair.side === 'l' && pair.i === i)) {
        // Tapping a matched item clears it and lets the learner choose again.
        const next = [...chosen];
        next[i] = -1;
        onChange?.(id, next);
      }
      setPair(pair?.id === id && pair.side === 'l' && pair.i === i ? null : { id, side: 'l', i });
    };
    const pickRight = (k: number) => {
      if (!live) return;
      if (pair?.id === id && pair.side === 'l') return setMatch(pair.i, k);
      setPair(pair?.id === id && pair.side === 'r' && pair.i === k ? null : { id, side: 'r', i: k });
    };
    const active = (side: 'l' | 'r', i: number) => pair?.id === id && pair.side === side && pair.i === i;
    const waiting = pair?.id === id;
    return (
      <div key={key} className={'match-q' + (waiting ? ' waiting-' + pair!.side : '')} data-qid={id}>
        <ol className="match-left">
          {left.map((l, i) => {
            const c = chosen[i] ?? -1;
            const ok = results ? c === map[i] : false;
            return (
              <li key={i}>
                {num(id, i)}
                <button type="button" className={'match-item' + (active('l', i) ? ' active' : '')} disabled={!live} onClick={() => pickLeft(i)}>
                  <span className="match-l">{l}</span>
                  {results ? (
                    <span className="gap-result">
                      <span className={ok ? 'ans right' : 'ans wrong'}>{c >= 0 ? LETTERS[c] : '—'}</span>
                      {ok ? TICK : !hideAnswers && map[i] >= 0 && <span className="fix">{LETTERS[map[i]]}</span>}
                    </span>
                  ) : (
                    <span key={pf(id)} className={'match-slot' + (c >= 0 ? ' filled' : '') + pf(id)} aria-label={c >= 0 ? `Matched with ${LETTERS[c]}` : 'Not matched yet'}>
                      {c >= 0 ? LETTERS[c] : ''}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <ul className="match-right">
          {right.map((r, k) => (
            <li key={k}>
              <button type="button" className={'match-item' + (active('r', k) ? ' active' : '') + (chosen.includes(k) && !results ? ' used' : '')} disabled={!live} onClick={() => pickRight(k)}>
                <span className="letter" aria-hidden="true">
                  {LETTERS[k]}
                </span>
                <span>{r}</span>
              </button>
            </li>
          ))}
        </ul>
        {live && <span className="match-help">{waiting ? (pair!.side === 'l' ? 'Now choose its match on the right.' : 'Now choose the item on the left.') : 'Tap an item, then tap its match.'}</span>}
        {notesFor(node)}
        {revealChip(node) && <div className="match-reveal">{revealChip(node)}</div>}
      </div>
    );
  };

  const dropgap = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const value = isAnswered(responses[id]) ? String(responses[id]) : '';
    const entry = results?.[id];
    if (results) return resultText(key, id, value, scoreQuestion(entry, value).got === 1, entry?.kind === 'drop' ? entry.answer : undefined);
    return (
      <span key={key} className="gap-wrap" data-qid={id}>
        {num(id)}
        <button
          type="button"
          key={id + pf(id)}
          className={'drop-slot' + (value ? ' filled' : '') + (picked ? ' ready' : '') + pf(id)}
          disabled={disabled}
          aria-label={value ? `Question ${numbers[id]}: ${value}. Tap to remove` : `Question ${numbers[id]}: empty. Pick a word, then tap here`}
          onClick={() => {
            if (picked) {
              onChange?.(id, picked);
              setPicked(null);
            } else if (value) onChange?.(id, '');
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const w = e.dataTransfer.getData('text/plain');
            if (w) onChange?.(id, w);
            setPicked(null);
          }}
        >
          {value || ' '}
        </button>
        {revealChip(node)}
      </span>
    );
  };

  const wordbank = (node: JSONContent, key: string) => {
    const words: string[] = node.attrs?.words ?? [];
    const remaining = [...placedWords];
    return (
      <div key={key} className="word-bank" aria-label="Word bank">
        {words.map((w, i) => {
          const usedAt = remaining.findIndex((p) => normalise(p) === normalise(w));
          const used = usedAt >= 0;
          if (used) remaining.splice(usedAt, 1);
          return (
            <button
              type="button"
              key={i}
              className={'bank-word' + (used ? ' used' : '') + (picked === w ? ' picked' : '')}
              disabled={locked || used}
              draggable={!locked && !used}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', w);
                e.dataTransfer.effectAllowed = 'move';
                // A clean pill as the drag image, without a white box around it.
                const ghost = document.createElement('span');
                ghost.className = 'drag-ghost';
                ghost.textContent = w;
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
                setPicked(w);
                window.setTimeout(() => ghost.remove(), 0);
              }}
              onDragEnd={() => setPicked(null)}
              onClick={() => setPicked(picked === w ? null : w)}
            >
              {w}
            </button>
          );
        })}
        {!locked && <span className="hint bank-hint">{picked ? 'Now tap a gap.' : 'Tap a word, then tap a gap. Or drag it.'}</span>}
      </div>
    );
  };

  const order = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const words: string[] = node.attrs?.words ?? [];
    const placed = isAnswered(responses[id]) ? splitWords(String(responses[id])) : [];
    const pool = [...words];
    for (const p of placed) {
      const k = pool.indexOf(p);
      if (k >= 0) pool.splice(k, 1);
    }
    const entry = results?.[id];
    if (results) {
      const ok = scoreQuestion(entry, responses[id]).got === 1;
      return (
        <div key={key} className="order-q" data-qid={id}>
          {num(id)}
          <span className={ok ? 'ans right' : 'ans wrong'}>{placed.join(' ') || '—'}</span>
          {ok ? TICK : !hideAnswers && entry?.kind === 'order' && <span className="fix">{entry.answer}</span>}
          {notesFor(node)}
        </div>
      );
    }
    return (
      <div key={key} className="order-q" data-qid={id}>
        <div className="order-line">
          {num(id)}
          {placed.length === 0 && <span className="order-empty">Tap the words in order</span>}
          {placed.map((w, i) => (
            <button key={i + pf(id)} type="button" className={'bank-word placed' + pf(id)} disabled={disabled} onClick={() => onChange?.(id, placed.filter((_, k) => k !== i).join(' '))}>
              {w}
            </button>
          ))}
        </div>
        {revealChip(node)}
        <div className="order-pool">
          {pool.map((w, i) => (
            <button key={i} type="button" className="bank-word" disabled={disabled} onClick={() => onChange?.(id, [...placed, w].join(' '))}>
              {w}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const writing = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const raw = responses[id];
    const rich = !!node.attrs?.rich;
    const spell = !!node.attrs?.spellcheck;
    const text = textOf(raw);
    const count = splitWords(text).length;
    const min = node.attrs?.minWords as number | null;
    const max = node.attrs?.maxWords as number | null;
    const aim = min && max ? `${min}–${max} words` : min ? `at least ${min} words` : max ? `up to ${max} words` : '';
    const under = !!min && count < min;
    const over = !!max && count > max;
    const corr = writingReview?.corrections?.[id];
    const myAnns = (writingReview?.anns ?? []).filter((a) => a.target === 'answer' && a.qid === id);
    const fixing = corr?.status === 'open';
    const wLocked = locked && !fixing;
    return (
      <div key={key} className="writing-q">
        {num(id)}
        {(node.attrs?.genre || criteriaOf(node.attrs)) && (
          <span className="writing-meta">
            {node.attrs?.genre && <span className="writing-genre">{genreLabel(node.attrs.genre)}</span>}
            {criteriaOf(node.attrs) && <span className="hint">Marked on {criteriaOf(node.attrs)!.map((c) => c.name.toLowerCase()).join(', ')}</span>}
          </span>
        )}
        {(myAnns.length > 0 || corr) && (
          <div className="wr-review">
            <span className="eyebrow">
              {corr?.status === 'open' ? 'Your teacher marked some things to correct' : corr?.status === 'resubmitted' ? 'Corrections sent. Your teacher will check them.' : corr?.status === 'approved' ? 'Your teacher approved your corrections' : 'Your teacher’s notes'}
            </span>
            <AnswerMarkup text={corr?.before ?? text} anns={myAnns} codes={writingReview?.codes ?? []} />
            <CodeKey codes={writingReview?.codes ?? []} />
            {fixing && <span className="hint">Correct your writing in the box below, then send it again.</span>}
          </div>
        )}
        {rich ? (
          <RichAnswer
            value={raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JSONContent) : null}
            onChange={(v) => onChange?.(id, v)}
            disabled={wLocked}
            spellcheck={spell}
            label={`Question ${numbers[id]}`}
          />
        ) : (
          <textarea
            aria-label={`Question ${numbers[id]}`}
            value={typeof raw === 'string' ? raw : text}
            disabled={wLocked}
            rows={8}
            spellCheck={spell}
            autoCorrect={spell ? 'on' : 'off'}
            autoCapitalize="sentences"
            onChange={(e) => onChange?.(id, e.target.value)}
            placeholder="Write your answer here"
          />
        )}
        <span className={'word-count' + (under || over ? ' off' : '')}>
          {count} {count === 1 ? 'word' : 'words'}
          {aim ? ` · ${aim}` : ''}
          {under ? ' · keep going' : over ? ' · too long' : ''}
          {results && !fixing ? ' · sent to your teacher' : ''}
        </span>
        {fixing && (
          <button type="button" className="btn small-btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => writingReview?.onResubmit(id)}>
            Send my corrections
          </button>
        )}
        {teacherMarks?.[id] && (teacherMarks[id].score !== null || teacherMarks[id].comment) && (
          <div className="t-mark">
            <span className="t-mark-head">
              <span className="eyebrow">Your teacher</span>
              {teacherMarks[id].score !== null && (
                <span className="t-mark-score">
                  {teacherMarks[id].score} / {node.attrs?.points ?? 5}
                </span>
              )}
            </span>
            {criteriaOf(node.attrs) && teacherMarks[id].crit && (
              <span className="t-rubric">
                {criteriaOf(node.attrs)!.map((c) => (
                  <span key={c.name} className="t-rubric-row">
                    <span>{c.name}</span>
                    <span className="t-rubric-bar" aria-hidden="true">
                      <span style={{ width: `${((teacherMarks[id].crit?.[c.name] ?? 0) / c.max) * 100}%` }} />
                    </span>
                    <strong>
                      {teacherMarks[id].crit?.[c.name] ?? '–'} / {c.max}
                    </strong>
                  </span>
                ))}
              </span>
            )}
            {teacherMarks[id].comment && <p>{teacherMarks[id].comment}</p>}
          </div>
        )}
      </div>
    );
  };

  // Hints and feedback for wrong answers, shown under the line they belong to.
  const notesFor = (node: JSONContent) => {
    if (!results) return null;
    const ids: string[] = [];
    const collect = (x: JSONContent) => {
      if (x.attrs?.id && QTYPES.includes(x.type ?? '')) ids.push(x.attrs.id);
      x.content?.forEach(collect);
    };
    collect(node);
    const notes = ids
      .map((id) => {
        const e = results[id];
        if (!e || scoreQuestion(e, responses[id]).got === scoreQuestion(e, responses[id]).max) return null;
        // Feedback written for the option the learner picked, otherwise the question's feedback.
        const r = responses[id];
        const optText = !hideAnswers && (e.kind === 'mcq' || e.kind === 'multi') && e.optFb ? (Array.isArray(r) ? (r as number[]) : [Number(r)]).map((x) => e.optFb?.[x]).filter((x) => x?.trim()).join(' ') : '';
        const text = hideAnswers ? e.hint : optText || e.feedback;
        return text ? { id, text } : null;
      })
      .filter(Boolean) as { id: string; text: string }[];
    if (!notes.length) return null;
    return (
      <div className={'q-notes' + (hideAnswers ? ' hint' : '')}>
        {notes.map((nt) => (
          <span key={nt.id}>
            <sup className="q-num">{numbers[nt.id]}</sup>
            {hideAnswers ? 'Hint: ' : ''}
            {nt.text}
          </span>
        ))}
      </div>
    );
  };

  // Document --------------------------------------------------------------------------------

  const render = (node: JSONContent, key: string): ReactNode => {
    const kids = () => node.content?.map((c, i) => render(c, key + '.' + i));
    switch (node.type) {
      case 'doc':
        return <>{kids()}</>;
      case 'paragraph':
        return (
          <div key={key} className="para" data-bk={key}>
            <p>{kids()}</p>
            {notesFor(node)}
          </div>
        );
      case 'heading':
        return (
          <h3 key={key} data-bk={key} data-level={node.attrs?.level ?? 1}>
            {kids()}
          </h3>
        );
      case 'bulletList':
        return <ul key={key}>{kids()}</ul>;
      case 'orderedList':
        return (
          <ol key={key} type={(node.attrs?.listType ?? '1') as '1' | 'a' | 'A' | 'i' | 'I'} start={node.attrs?.start ?? 1}>
            {kids()}
          </ol>
        );
      case 'listItem':
        return (
          <li key={key} data-bk={key}>
            {kids()}
          </li>
        );
      case 'table':
        return (
          <div key={key} className="table-wrap-task" data-bk={key}>
            <table className={'task-table lines-' + (node.attrs?.lines ?? 'all') + (node.attrs?.striped ? ' striped' : '')}>
              <tbody>{kids()}</tbody>
            </table>
          </div>
        );
      case 'tableRow':
        return <tr key={key}>{kids()}</tr>;
      case 'tableHeader':
        return (
          <th key={key} colSpan={node.attrs?.colspan ?? 1} rowSpan={node.attrs?.rowspan ?? 1} style={{ backgroundColor: cellBg(node.attrs?.bg), textAlign: node.attrs?.align || undefined }}>
            {kids()}
          </th>
        );
      case 'tableCell':
        return (
          <td key={key} colSpan={node.attrs?.colspan ?? 1} rowSpan={node.attrs?.rowspan ?? 1} style={{ backgroundColor: cellBg(node.attrs?.bg), textAlign: node.attrs?.align || undefined }}>
            {kids()}
          </td>
        );
      case 'pdfBlock': {
        const pages = (node.attrs?.pages ?? []) as PageSize[];
        return (
          <div key={key} className="pdf-block" data-bk={key}>
            <PdfStack src={String(node.attrs?.src ?? '')} classId={classId ?? ''} pages={pages}>
              <div className="pdf-layer">
                {(node.content ?? []).map((c, i) => {
                  const a = c.attrs ?? {};
                  const at = toStack(pages, Number(a.page) || 0, Number(a.x) || 0, Number(a.y) || 0);
                  if (c.type === 'pdfInk') return <InkSvg key={i} pages={pages} page={Number(a.page) || 0} pts={(a.pts ?? []) as [number, number][]} color={String(a.color ?? 'ink')} />;
                  if (c.type === 'pdfMark') return <span key={i} className="pdf-mark" style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${(Number(a.w) || 0) * 100}%`, height: `${(Number(a.h) || 0) * at.pageH}%`, background: MARK_COLORS.find((m) => m.k === a.color)?.bg ?? MARK_COLORS[0].bg }} />;
                  return (
                    <div key={i} className={'pdf-box tone-' + (a.tone || 'paper')} style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${(Number(a.w) || 0.3) * 100}%` }}>
                      <div className="pdf-box-body">{c.content?.map((cc, j) => render(cc, key + '.' + i + '.' + j))}</div>
                    </div>
                  );
                })}
              </div>
            </PdfStack>
          </div>
        );
      }
      case 'textBox':
        return (
          <BoxFrame key={key} attrs={node.attrs as BoxAttrs}>
            {kids()}
          </BoxFrame>
        );
      case 'dialogue': {
        const sp: string[] = Array.isArray(node.attrs?.speakers) && node.attrs.speakers.length ? node.attrs.speakers : ['A', 'B'];
        return (
          <div key={key} data-bk={key} className={'dialogue layout-' + (node.attrs?.layout === 'side' ? 'side' : 'stacked') + ' n' + sp.length} style={speakerVars(sp)}>
            <div className="dlg-lines">{kids()}</div>
          </div>
        );
      }
      case 'dialogueLine':
        return (
          <div key={key} className="dl" data-who={Number(node.attrs?.who) || 0}>
            <span className="dl-who" />
            <div className="dl-text">{kids()}</div>
          </div>
        );
      case 'blockquote':
        return <blockquote key={key}>{kids()}</blockquote>;
      case 'hardBreak':
        return <br key={key} />;
      case 'horizontalRule':
        return <hr key={key} />;
      case 'picture': {
        const mk = String(node.attrs?.mark ?? '');
        let label = '';
        if (mk) {
          picCount[mk] = (picCount[mk] ?? 0) + 1;
          label = listLabel(picCount[mk], mk);
        }
        const pa = node.attrs ?? {};
        return <PicFrame key={key} w={Number(pa.w) || 0} src={String(pa.src ?? '')} alt={pa.alt} size={pa.size} label={label} classId={classId ?? ''} crop={pa.crop} ar={Number(pa.ar) || 0} filter={pa.filter} cover={coverOf(pa)} tags={Array.isArray(pa.tags) ? pa.tags : undefined} />;
      }
      case 'image':
        return node.attrs?.src ? <img key={key} data-bk={key} src={node.attrs.src} alt={node.attrs.alt ?? ''} className="task-img" /> : null;
      case 'text':
      {
        const link = node.marks?.find((m) => m.type === 'lessonLink');
        const inner = marks(node.text ?? '', node.marks);
        if (!link) return <span key={key}>{inner}</span>;
        if (link.attrs?.kind === 'notebook')
          return (
            <button key={key} type="button" className="lesson-link nb-ln" disabled={!onOpenNotebook} title="Open in the notebook" onClick={() => onOpenNotebook?.(link.attrs?.entryId)}>
              {inner}
              {LINK_ICON}
            </button>
          );
        const tid = link.attrs?.taskId as string;
        const st = taskState?.(tid) ?? 'open';
        return (
          <button
            key={key}
            type="button"
            className={'lesson-link' + (st !== 'open' ? ' is-off' : '')}
            disabled={!onOpenTask || st === 'missing'}
            title={st === 'locked' ? 'Your teacher hasn’t opened this task yet' : st === 'missing' ? 'This task is no longer in the lesson' : 'Go to this task'}
            onClick={() => st === 'open' && onOpenTask?.(tid)}
          >
            {inner}
            {LINK_ICON}
          </button>
        );
      }
      case 'gap':
        return node.attrs?.example ? exampleOf(node, key) : gap(node, key);
      case 'choice':
        return node.attrs?.example ? exampleOf(node, key) : choice(node, key);
      case 'mcq':
        return node.attrs?.example ? exampleBlock(node, key) : mcq(node, key);
      case 'match':
        return node.attrs?.example ? exampleBlock(node, key) : match(node, key);
      case 'dropgap':
        return node.attrs?.example ? exampleOf(node, key) : dropgap(node, key);
      case 'wordbank':
        return wordbank(node, key);
      case 'order':
        return node.attrs?.example ? exampleBlock(node, key) : order(node, key);
      case 'writing':
        return node.attrs?.example ? exampleBlock(node, key) : writing(node, key);
      case 'pq': {
        if (node.attrs?.example && node.attrs?.kind !== 'speaking') return exampleBlock(node, key);
        const id = node.attrs?.id as string;
        const res = results?.[id];
        const rev = revealed?.[id];
        return (
          <PackQuestion
            key={key + pf(id)}
            id={id}
            kind={node.attrs?.kind}
            data={node.attrs?.data ?? {}}
            value={responses[id]}
            onChange={(v) => onChange?.(id, v)}
            result={res?.kind === 'pack' ? res : null}
            revealed={!inPen(id) && rev?.kind === 'pack' ? rev : null}
            hideAnswers={hideAnswers}
            locked={locked}
            num={num}
            classId={classId}
          />
        );
      }
      case 'randomPick': {
        const id = node.attrs?.id as string;
        const cards = node.content ?? [];
        const together = sharedOn(node);
        const sp = shared?.[id];
        const canDraw = !results && (together ? !!onSharedDraw && (teacher || node.attrs?.whoDraws === 'anyone') : !!onChange);
        return (
          <PickStage
            key={key}
            mode={(node.attrs?.mode ?? 'cards') as 'cards' | 'wheel' | 'boxes'}
            look={(node.attrs?.look ?? 'graphite') as PickLook}
            symbol={node.attrs?.symbol ?? '✦'}
            repeat={!!node.attrs?.repeat}
            titles={cards.map((c) => (c.attrs?.title as string) ?? '')}
            state={pickOf(node)}
            seq={together ? sp?.seq ?? 0 : undefined}
            drawnBy={together ? sp?.by : undefined}
            canDraw={canDraw}
            waitingText={together && !canDraw && !results ? 'Your teacher will draw for the class.' : undefined}
            onDraw={(next) => (together ? onSharedDraw?.(id, next, (sp?.seq ?? 0) + 1) : onChange?.(id, next as unknown as Response))}
            onReset={results ? undefined : together ? (onSharedReset && (teacher || node.attrs?.whoDraws === 'anyone') ? () => onSharedReset(id) : undefined) : onChange ? () => onChange(id, { h: [], b: [] } as unknown as Response) : undefined}
            resetAnytime={together && !!teacher}
            renderCard={(i) => (cards[i]?.content ?? []).map((c, k) => render(c, key + '.' + i + '.' + k))}
          />
        );
      }
      case 'reflect': {
        const id = node.attrs?.id as string;
        const items = (node.attrs?.items as RItem[]) ?? [];
        const got = node.attrs?.share ? (received ?? []).filter((f) => f.blockId === id) : [];
        return (
          <div key={key} className="rf-wrap">
          <ReflectBlock
            pairing={node.attrs?.pairing === 'teacher' ? 'teacher' : 'learners'}
            pairedWith={selfId ? (node.attrs?.pairs ?? {})[selfId] : undefined}
            about={node.attrs?.about === 'peer' ? 'peer' : 'self'}
            title={(node.attrs?.title as string) ?? ''}
            items={(node.attrs?.items as RItem[]) ?? []}
            value={responses[id] as unknown as ReflectAnswer | undefined}
            onChange={onChange ? (v) => onChange(id, v as unknown as Response) : undefined}
            disabled={locked}
            classmates={classmates}
            selfId={selfId}
          />
          {got.map((f) => (
            <ReflectBlock key={f.from} about="peer" title="" items={items} value={{ ratings: f.ratings }} disabled readOnlyFrom={f.fromName.split(' ')[0]} />
          ))}
          </div>
        );
      }
      case 'reveal':
        return (
          <RevealBlock key={key} label={node.attrs?.label ?? ''}>
            {kids()}
          </RevealBlock>
        );
      case 'collab':
        return node.attrs?.docKey ? (
          <div key={key} data-bk={key} className="task-collab">
            <CollabTask a={node.attrs as CollabAttrs} classId={classId ?? ''} teacher={teacher} selfId={selfId} classmates={classmates} />
          </div>
        ) : null;
      case 'upload': {
        const id = String(node.attrs?.id ?? '');
        return (
          <div key={key} data-bk={key} className="task-upload">
            <UploadBox classId={classId ?? ''} a={node.attrs as UploadAttrs} value={responses[id] as unknown as UploadAnswer | undefined} onChange={onChange ? (v) => onChange(id, v as unknown as Response) : undefined}  disabled={locked} />
          </div>
        );
      }
      case 'media':
        return node.attrs?.media ? (
          <div key={key} data-bk={key} className="task-media">
            <MediaPlayer classId={classId ?? ''} mediaId={String(node.attrs.media)} title={node.attrs.title} scriptMode={node.attrs.scriptMode} plays={Number(node.attrs.plays) || 0} teaching={teacher} mute={Array.isArray(node.attrs.mute) ? node.attrs.mute : []} below={node.attrs.notes && classId && training ? (e) => <TimeNotes classId={classId} noteKey={String(node.attrs!.media)} time={e.time} seek={(t) => (e.seek(t), e.play())} teacher={teacher} /> : undefined} />
          </div>
        ) : null;
      case 'linkCard':
        return <LinkCardView key={key} url={node.attrs?.url ?? ''} title={node.attrs?.title ?? ''} note={node.attrs?.note} />;
      case 'mention':
        return <MentionTag key={key} label={node.attrs?.label ?? ''} me={(teacher && node.attrs?.id === 'teacher') || (!!selfId && node.attrs?.id === selfId)} />;
      case 'survey':
        return (
          <SurveyBlock
            key={key}
            attrs={node.attrs as never}
            classId={boardMe?.classId ?? classId}
            teacher={!!boardMe?.teacher}
            me={boardMe && !boardMe.teacher ? { uid: boardMe.uid, learnerId: boardMe.selfId ?? '', name: boardMe.name } : undefined}
            itemId={boardMe?.itemId}
            taskId={boardMe?.taskId}
          />
        );
      case 'bankLink':
        return <BankLinkCard key={key} bank={node.attrs?.bank ?? 'grammar'} title={node.attrs?.title} label={node.attrs?.label} onOpen={onOpenNotebook && node.attrs?.entryId ? () => onOpenNotebook(node.attrs!.entryId) : undefined} />;
      case 'timeline':
        return <TimelineFigure key={key} a={node.attrs as TlAttrs} />;
      case 'diagram': {
        const a = node.attrs as DgAttrs;
        const cells = node.content ?? [];
        return (
          <div key={key} data-bk={key}>
            <DiagramFrame a={a} n={cells.length}>
              <div className="dg-cells">
                {cells.map((c, i) => (
                  <div key={i} className={'dg-cell c' + i + (i === 0 && (a.kind === 'mind' || a.kind === 'tree') ? ' main' : '')} style={cellStyle(a.kind as DgKind, i, cells.length)}>
                    {c.attrs?.label ? <span className="dg-cell-label">{c.attrs.label}</span> : null}
                    <div className="dg-cell-body">{(c.content ?? []).map((k, j) => render(k, `${key}-${i}-${j}`))}</div>
                  </div>
                ))}
              </div>
            </DiagramFrame>
          </div>
        );
      }
      case 'drawBoard':
        return (
          <div key={key} className="drawboard">
            <BoardTask a={node.attrs as BoardAttrs2} me={boardMe} classmates={classmates} />
          </div>
        );
      case 'board':
        return <Board key={key} attrs={node.attrs as BoardAttrs} me={boardMe} preview={!boardMe} />;
      case 'icon':
        return <Icon key={key} name={node.attrs?.name} tone={node.attrs?.tone} />;
      case 'sym':
        return <Sym key={key} text={node.attrs?.text ?? '+'} shape={node.attrs?.shape ?? 'box'} tone={node.attrs?.tone ?? 'ink'} />;
      case 'ipa':
        return (
          <IpaText
            key={key}
            text={(node.attrs?.text as string) ?? ''}
            accent={(node.attrs?.accent ?? 'RP') as 'RP' | 'GA'}
            showAccent={!!node.attrs?.showAccent}
            listen={{ mode: (node.attrs?.listen ?? 'off') as 'off' | 'voice' | 'audio', say: node.attrs?.say, audioId: node.attrs?.audioId, classId }}
          />
        );
      case 'stress':
        return <StressedWord key={key} syllables={(node.attrs?.syllables as string[]) ?? []} stressed={Number(node.attrs?.stressed ?? 0)} style={(node.attrs?.style ?? 'box') as 'box' | 'bold' | 'big'} />;
      case 'plink':
        return <LinkMark key={key} k={String(node.attrs?.k ?? 'link')} s={String(node.attrs?.s ?? 'under')} />;
      case 'tt': {
        if (!training) return null;
        const id = node.attrs?.id as string;
        return (
          <div key={key} className="tt-wrap">
            <TTBlock kind={(node.attrs?.kind ?? 'analysis') as TTKind} title={String(node.attrs?.title ?? '')} mode={node.attrs?.mode === 'complete' ? 'complete' : 'model'} data={(node.attrs?.data ?? {}) as Record<string, string>} value={responses[id] as unknown as Fields | undefined} onChange={onChange && node.attrs?.mode === 'complete' ? (v) => onChange(id, v as unknown as Response) : undefined} disabled={locked}  def={node.attrs?.def ?? undefined} />
          </div>
        );
      }
      case 'phonChart':
      case 'phonCard':
        return <PhonView key={key} type={node.type} a={(node.attrs ?? {}) as Record<string, unknown>} />;
      case 'subst':
        return <SubstSlot key={key} options={(node.attrs?.options as string[]) ?? []} lines={node.attrs?.lines as SubstLines | undefined} />;
      case 'dictCut':
        return node.attrs?.word || Object.keys(node.attrs?.data ?? {}).length ? (
          <div key={key} className="dcut-wrap">
            <DictCutout word={String(node.attrs?.word ?? '')} d={(node.attrs?.data ?? {}) as DefData} />
          </div>
        ) : null;
      case 'columnBreak':
        return null;
      default:
        return kids() ?? null;
    }
  };

  if (!content) return <div className="task-body" />;

  // Two-column layout: split the top level at the first column break; each column scrolls on its own.
  const top = content.content ?? [];
  const at = top.findIndex((c) => c.type === 'columnBreak');
  if (at >= 0) {
    const left = top.slice(0, at);
    const right = top.slice(at + 1);
    if (narrow) {
      // Phones: the two columns become tabs, with a count of unanswered questions on the other tab.
      const ids = (list: JSONContent[]) => list.flatMap((n) => questionsIn(n));
      const open = (list: JSONContent[]) => ids(list).filter((id) => !isAnswered(responses[id])).length;
      const qL = ids(left).length;
      const qR = ids(right).length;
      const names = qR >= qL ? [layout === 'media' ? 'Media' : 'Text', 'Questions'] : ['Questions', layout === 'media' ? 'Media' : 'Text'];
      const counts = [open(left), open(right)];
      return (
        <div className="task-tabs">
          <div className="tt-bar" role="tablist">
            {names.map((n, i) => (
              <button key={n} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
                {n}
                {tab !== i && counts[i] > 0 && !results && <span className="tt-count" aria-label={`${counts[i]} unanswered`}>{counts[i]}</span>}
              </button>
            ))}
          </div>
          <div className="task-body">{(tab === 0 ? left : right).map((c, i) => render(c, (tab === 0 ? 'a' : 'b') + i))}</div>
        </div>
      );
    }
    return (
      <div className={'task-columns ' + (layout === 'two-wide' ? 'two-wide' : layout === 'media' ? 'media' : 'two') + (colScroll === 'together' ? ' together' : ' separate')}>
        <div className="task-body col">{left.map((c, i) => render(c, 'a' + i))}</div>
        <div className="task-body col">{right.map((c, i) => render(c, 'b' + i))}</div>
      </div>
    );
  }
  return <div className="task-body">{render(content, 'r')}</div>;
}
