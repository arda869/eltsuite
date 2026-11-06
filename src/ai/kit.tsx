// The shared parts of every AI interface in ELT Suite: how a panel introduces itself, how it says
// what it reads, how it offers examples, how it looks while working, how it reports a problem and
// how it presents a draft. Features keep their own calls and logic and compose these.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { AiMark } from '../components/AiMark';
import './kit.css';

/** The one sentence about allowances, used wherever generation is charged. */
export const AI_ALLOWANCE = 'Uses your AI allowance. Opening saved results doesn’t.';
/** The one sentence that marks AI output as a draft to check. */
export const AI_DRAFT_NOTE = 'An AI draft. Check it before you use it with learners.';

/** Title block for an AI panel or dialog: a quiet kicker, the title, one line on what it does. */
export function AiHeader({ kicker = 'With AI', title, lede, children, onClose, onMinimise, closeDisabled, level = 2 }: { kicker?: string; title: ReactNode; lede?: ReactNode; children?: ReactNode; onClose?: () => void; onMinimise?: () => void; closeDisabled?: boolean; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return <header className="aik-header">
    {onClose && <div className="aik-window-actions"><button type="button" className="btn aik-close" aria-label="Close" title="Close" disabled={closeDisabled} onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>{onMinimise && <button type="button" className="btn" onClick={onMinimise}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Continue working</button>}</div>}
    <AiMark size={22} />
    <div className="aik-header-text">
      <span className="aik-kicker">{kicker}</span>
      <H className="aik-title">{title}</H>
      {lede && <p className="aik-lede">{lede}</p>}
      {children}
    </div>
  </header>;
}

/** What the AI will read for this request, so teachers never type what ELT Suite already knows. */
export function AiUses({ items, label = 'Reads' }: { items: (string | false | null | undefined)[]; label?: string }) {
  const shown = items.filter(Boolean) as string[];
  if (!shown.length) return null;
  return <p className="aik-uses"><span className="aik-uses-label">{label}</span>{shown.map(i => <span className="aik-chip" key={i}>{i}</span>)}</p>;
}

/** Tappable examples that fill a prompt field, instead of a blank box. */
export function AiExamples({ examples, onPick, disabled, label = 'Try one of these' }: { examples: string[]; onPick: (text: string) => void; disabled?: boolean; label?: string }) {
  if (!examples.length) return null;
  return <div className="aik-examples" role="group" aria-label={label}>
    <span className="aik-examples-label">{label}</span>
    <div className="aik-examples-list">{examples.map(e => <button type="button" key={e} className="aik-example" disabled={disabled} onClick={() => onPick(e)}>{e}</button>)}</div>
  </div>;
}

/** A labelled field with an optional hint under the label. */
export function AiField({ label, hint, children, optional }: { label: ReactNode; hint?: ReactNode; children: ReactNode; optional?: boolean }) {
  return <label className="aik-field">
    <span className="aik-field-label">{label}{optional && <em> · optional</em>}</span>
    {hint && <span className="aik-field-hint">{hint}</span>}
    {children}
  </label>;
}

/** Advanced options, closed by default. */
export function AiMore({ summary, children, open }: { summary: string; children: ReactNode; open?: boolean }) {
  return <details className="aik-more" open={open}><summary>{summary}</summary><div className="aik-more-body">{children}</div></details>;
}

/** The working state: what is happening, how long it has been, and that nothing is lost. */
export function AiWorking({ title, detail = 'Your work stays as it is until you use the result.', steps, step, slowAfter = 90, slowNote = 'This is taking longer than usual. We’re still waiting; you don’t need to start again.', children }: { title: string; detail?: ReactNode; steps?: string[]; step?: number; slowAfter?: number; slowNote?: string; children?: ReactNode }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { setSeconds(0); const t = window.setInterval(() => setSeconds(s => s + 1), 1000); return () => window.clearInterval(t); }, [title]);
  return <div className="aik-working" role="status" aria-live="polite">
    <AiMark active size={28} />
    <div className="aik-working-text">
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {steps && steps.length > 0 && <ol className="aik-steps" aria-label="Steps">{steps.map((s, i) => <li key={s} data-state={step === undefined ? 'todo' : i < step ? 'done' : i === step ? 'now' : 'todo'}>{s}</li>)}</ol>}
      {seconds >= slowAfter && <p className="aik-slow">{slowNote}</p>}
      {children}
    </div>
    <span className="aik-elapsed" aria-hidden="true">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
  </div>;
}

/** A problem, a note or a success, in the house voice: what happened, what to do, work is safe. */
export function AiNotice({ kind = 'info', children, action, actionLabel = 'Try again', actionDisabled, onDismiss }: { kind?: 'info' | 'error' | 'success'; children: ReactNode; action?: () => void; actionLabel?: string; actionDisabled?: boolean; onDismiss?: () => void }) {
  return <div className={'aik-notice aik-notice-' + kind} role={kind === 'error' ? 'alert' : 'status'}>
    <div className="aik-notice-text">{children}</div>
    {(action || onDismiss) && <div className="aik-notice-actions">
      {action && <button type="button" className="btn small-btn" disabled={actionDisabled} onClick={action}>{actionLabel}</button>}
      {onDismiss && <button type="button" className="btn small-btn link" onClick={onDismiss}>Dismiss</button>}
    </div>}
  </div>;
}

/** The row of buttons under a form or a draft: the main action first. */
export function AiActions({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div className="aik-actions"><div className="aik-actions-buttons">{children}</div>{note && <p className="aik-actions-note">{note}</p>}</div>;
}

/** A generated result: marked as a draft, with its own actions. */
export function AiDraft({ title, meta, children, actions, note = AI_DRAFT_NOTE, label = 'AI draft' }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; actions?: ReactNode; note?: ReactNode; label?: string }) {
  const id = useId();
  return <section className="aik-draft" aria-labelledby={title ? id : undefined} aria-label={title ? undefined : label}>
    <div className="aik-draft-head">
      <span className="aik-badge"><AiMark size={14} />{label}</span>
      {meta && <span className="aik-draft-meta">{meta}</span>}
    </div>
    {title && <h3 id={id} className="aik-draft-title">{title}</h3>}
    <div className="aik-draft-body">{children}</div>
    {(actions || note) && <footer className="aik-draft-foot">{actions && <div className="aik-actions-buttons">{actions}</div>}{note && <p className="aik-actions-note">{note}</p>}</footer>}
  </section>;
}

/** Small print: allowance, privacy, what is sent where. */
export function AiFootnote({ children }: { children: ReactNode }) {
  return <p className="aik-footnote">{children}</p>;
}

/** Plain AI text with paragraphs, simple lists and **bold**, so replies don't arrive as one block. */
export function AiText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = splitBlocks(text);
  return <div className={'aik-text ' + className}>{blocks.map((b, i) => b.kind === 'list'
    ? (b.ordered ? <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol> : <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>)
    : b.kind === 'heading' ? <p key={i} className="aik-text-heading">{inline(b.text)}</p>
    : <p key={i}>{inline(b.text)}</p>)}</div>;
}

type Block = { kind: 'para' | 'heading'; text: string } | { kind: 'list'; ordered: boolean; items: string[] };
function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const chunk of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const bullet = /^[-*•]\s+/, numbered = /^\d+[.)]\s+/;
    if (lines.every(l => bullet.test(l))) out.push({ kind: 'list', ordered: false, items: lines.map(l => l.replace(bullet, '')) });
    else if (lines.every(l => numbered.test(l))) out.push({ kind: 'list', ordered: true, items: lines.map(l => l.replace(numbered, '')) });
    else if (lines.length === 1 && /^#{1,4}\s+/.test(lines[0])) out.push({ kind: 'heading', text: lines[0].replace(/^#{1,4}\s+/, '') });
    else {
      // Lines that mix prose and bullets: keep the prose, then the list.
      const prose = lines.filter(l => !bullet.test(l) && !numbered.test(l)), items = lines.filter(l => bullet.test(l) || numbered.test(l));
      if (prose.length) out.push({ kind: 'para', text: prose.join(' ') });
      if (items.length) out.push({ kind: 'list', ordered: numbered.test(items[0]), items: items.map(l => l.replace(bullet, '').replace(numbered, '')) });
    }
  }
  return out;
}
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
