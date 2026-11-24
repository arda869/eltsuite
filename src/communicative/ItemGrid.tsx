import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent } from 'react';
import { plainText, type ActivityItem, type ActivityKind } from './model';

// The items of an activity as a small spreadsheet: type, press Tab to move on, Enter to go down, and paste
// straight from Excel or Google Sheets (many rows and columns at once). Select several cells with Shift or by
// dragging, then copy them or press Delete to clear them.

export type GridColumn = {
  key: string; label: string; width?: string; placeholder?: string;
  options?: { value: string; label: string }[];
  get: (item: ActivityItem) => string;
};
export type GridChange = { row: number; key: string; value: string };

const titleOf = (i: ActivityItem) => i.title ?? '';
const text = (key: string, label: string, placeholder = '', width = '1fr'): GridColumn => ({ key, label, placeholder, width, get: i => String((i as Record<string, unknown>)[key] ?? '') });
const SPECIALS = [{ value: '', label: 'Ordinary square' }, { value: 'start', label: 'Start' }, { value: 'finish', label: 'Finish' }, { value: 'again', label: 'Roll again' }, { value: 'back', label: 'Go back' }, { value: 'miss', label: 'Miss a turn' }];
const CARD_TYPES = [{ value: 'character', label: 'Character' }, { value: 'secret', label: 'Secret objective' }, { value: 'opinion', label: 'Opinion prompt' }, { value: 'problem', label: 'Problem' }];

export function gridColumns(kind: ActivityKind): GridColumn[] {
  const main = (label: string, placeholder: string): GridColumn => ({ key: 'title', label, placeholder, width: '1.4fr', get: titleOf });
  switch (kind) {
    case 'board': return [main('Square', 'What learners talk about'), { key: 'special', label: 'Special', width: '170px', options: SPECIALS, get: i => i.special ?? '' }, { ...text('move', 'Back by', '2', '90px'), get: i => i.special === 'back' ? String(i.move ?? 2) : '' }];
    case 'bingo': return [main('Word', 'On the cards'), text('call', 'Call (optional)', 'What the caller says', '1.6fr')];
    case 'dominoes': case 'memory': return [main('Card', 'First half'), text('match', 'Matching half', 'Second half')];
    case 'strips': return [main('Strip', 'In the correct order')];
    case 'cue': return [main('Card title', 'For example: You are a guest'), { key: 'cardType', label: 'Type', width: '160px', options: CARD_TYPES, get: i => i.cardType ?? 'character' }, { key: 'text', label: 'Card text', width: '2fr', placeholder: 'What the learner reads', get: i => plainText(i.content) }, { key: 'useful', label: 'Useful language', width: '1.2fr', placeholder: 'Phrases, separated by /', get: i => (i.useful ?? '').split('\n').filter(Boolean).join(' / ') }];
    case 'survey': return [main('Question', 'What learners ask'), { key: 'options', label: 'Answers', width: '1.6fr', placeholder: 'Separated by ;', get: i => (i.options ?? []).join('; ') }];
    case 'findSomeone': return [main('Find someone who…', 'has been to Japan.'), text('question', 'Question', 'Have you ever been to Japan?'), text('followUp', 'Follow-up', 'When did you go?')];
    case 'ranking': return [main('Item', 'Something to rank')];
    case 'opinion': return [main('Statement', 'Something to agree or disagree with')];
    case 'taboo': return [main('Word', 'The word to describe'), { key: 'taboo', label: 'Taboo words', width: '1.6fr', placeholder: 'Up to five, separated by ,', get: i => (i.taboo ?? []).join(', ') }];
    default: return [];
  }
}

// Clipboard text from a spreadsheet: tab-separated cells, rows on new lines, quoted cells may hold new lines.
export function parseSheet(raw: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  const s = raw.replace(/\r\n?/g, '\n');
  for (let n = 0; n < s.length; n++) {
    const ch = s[n];
    if (quoted) { if (ch === '"' && s[n + 1] === '"') { cell += '"'; n++; } else if (ch === '"') quoted = false; else cell += ch; continue; }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}
const sheetText = (rows: string[][]) => rows.map(r => r.map(c => /[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join('\t')).join('\n');

type Cell = { r: number; c: number };
export function ItemGrid({ kind, items, onChange, maxRows = 200, minRows = 1, onRemove }: {
  kind: ActivityKind; items: ActivityItem[]; maxRows?: number; minRows?: number;
  onChange: (changes: GridChange[], addRows: number) => void; onRemove: (rows: number[]) => void;
}) {
  const cols = gridColumns(kind);
  const [focus, setFocus] = useState<Cell | null>(null), [anchor, setAnchor] = useState<Cell | null>(null);
  const [dragging, setDragging] = useState(false);
  const grid = useRef<HTMLDivElement>(null), want = useRef<Cell | null>(null);
  const extending = useRef(false);
  const rows = items.length, board = kind === 'board', canAdd = rows < maxRows;
  const total = rows + (canAdd ? 1 : 0); // the last row is always an empty row to type into
  const sel = focus && anchor ? { r0: Math.min(focus.r, anchor.r), r1: Math.max(focus.r, anchor.r), c0: Math.min(focus.c, anchor.c), c1: Math.max(focus.c, anchor.c) } : null;
  const many = !!sel && (sel.r0 !== sel.r1 || sel.c0 !== sel.c1);
  const inSel = (r: number, c: number) => !!sel && r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1;
  const el = (cell: Cell) => grid.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-cell="${cell.r}:${cell.c}"]`);
  const go = (cell: Cell, extend = false) => {
    const next = { r: Math.max(0, Math.min(total - 1, cell.r)), c: Math.max(0, Math.min(cols.length - 1, cell.c)) };
    setFocus(next); if (!extend) setAnchor(next);
    extending.current = extend;
    const target = el(next); if (target) { target.focus(); if (target instanceof HTMLInputElement) target.select(); } else want.current = next;
  };
  // A new row appears after typing in the empty row: keep the caret where the teacher was typing.
  useLayoutEffect(() => {
    const cell = want.current; if (!cell) return;
    const target = el(cell); if (target) { want.current = null; target.focus(); if (target instanceof HTMLInputElement) { const end = target.value.length; target.setSelectionRange(end, end); } }
  });
  useEffect(() => { const up = () => setDragging(false); window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up); }, []);

  // New rows go at the end; on a board they go before Finish, so pasted squares never replace it.
  const write = (changes: GridChange[], paste = false) => {
    const limit = board && paste ? rows - 1 : rows;
    const needed = Math.max(0, ...changes.map(ch => ch.row + 1)) - limit;
    const add = Math.max(0, Math.min(needed, maxRows - rows));
    const kept = changes.filter(ch => ch.row < limit + add);
    if (kept.length) onChange(kept, add);
  };
  const set = (r: number, c: number, value: string) => {
    if (r >= rows && !value) return;
    const newBoardSquare = board && r >= rows;
    if (r >= rows) want.current = { r: newBoardSquare ? rows - 1 : r, c };
    write([{ row: newBoardSquare ? rows - 1 : r, key: cols[c].key, value }], newBoardSquare);
  };
  const clear = () => {
    if (!sel) return; const changes: GridChange[] = [];
    for (let r = sel.r0; r <= Math.min(sel.r1, rows - 1); r++) for (let c = sel.c0; c <= sel.c1; c++) if (!cols[c].options) changes.push({ row: r, key: cols[c].key, value: '' });
    write(changes);
  };
  const onPaste = (e: ClipboardEvent, r: number, c: number) => {
    const data = parseSheet(e.clipboardData.getData('text/plain'));
    if (data.length <= 1 && (data[0]?.length ?? 0) <= 1 && !many) return; // one cell: the browser pastes it as usual
    e.preventDefault();
    const start = many && sel ? { r: sel.r0, c: sel.c0 } : { r: board && r >= rows ? rows - 1 : r, c };
    const changes: GridChange[] = [];
    data.forEach((line, dr) => line.forEach((value, dc) => { const col = cols[start.c + dc]; if (col) changes.push({ row: start.r + dr, key: col.key, value: col.options ? (col.options.find(o => o.label.toLowerCase() === value.toLowerCase() || o.value === value.toLowerCase())?.value ?? col.options[0].value) : value }); }));
    write(changes, true);
    const end = { r: Math.min(start.r + data.length - 1, maxRows - 1), c: Math.min(start.c + Math.max(...data.map(l => l.length)) - 1, cols.length - 1) };
    setAnchor({ r: start.r, c: start.c }); setFocus(end);
  };
  const onCopy = (e: ClipboardEvent) => {
    if (!many || !sel) return;
    e.preventDefault();
    const out: string[][] = [];
    for (let r = sel.r0; r <= Math.min(sel.r1, rows - 1); r++) out.push(cols.slice(sel.c0, sel.c1 + 1).map(col => { const v = col.get(items[r]); return col.options?.find(o => o.value === v)?.label ?? v; }));
    e.clipboardData.setData('text/plain', sheetText(out));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, r: number, c: number) => {
    const input = e.currentTarget instanceof HTMLInputElement ? e.currentTarget : null;
    const atStart = !input || (input.selectionStart === 0 && input.selectionEnd === 0);
    const atEnd = !input || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
    if (e.key === 'Tab') { e.preventDefault(); const back = e.shiftKey; const n = r * cols.length + c + (back ? -1 : 1); if (n >= 0 && n < total * cols.length) go({ r: Math.floor(n / cols.length), c: n % cols.length }); }
    else if (e.key === 'Enter') { e.preventDefault(); go({ r: r + (e.shiftKey ? -1 : 1), c }); }
    else if (e.key === 'ArrowDown' && !(e.currentTarget instanceof HTMLSelectElement && e.altKey)) { if (e.currentTarget instanceof HTMLSelectElement && !e.shiftKey) return; e.preventDefault(); e.shiftKey ? go({ r: (focus?.r ?? r) + 1, c: focus?.c ?? c }, true) : go({ r: r + 1, c }); }
    else if (e.key === 'ArrowUp') { if (e.currentTarget instanceof HTMLSelectElement && !e.shiftKey) return; e.preventDefault(); e.shiftKey ? go({ r: (focus?.r ?? r) - 1, c: focus?.c ?? c }, true) : go({ r: r - 1, c }); }
    else if (e.key === 'ArrowLeft' && (atStart || e.shiftKey && many)) { if (e.shiftKey) { e.preventDefault(); go({ r: focus?.r ?? r, c: (focus?.c ?? c) - 1 }, true); } else if (c > 0) { e.preventDefault(); go({ r, c: c - 1 }); } }
    else if (e.key === 'ArrowRight' && (atEnd || e.shiftKey && many)) { if (e.shiftKey) { e.preventDefault(); go({ r: focus?.r ?? r, c: (focus?.c ?? c) + 1 }, true); } else if (c < cols.length - 1) { e.preventDefault(); go({ r, c: c + 1 }); } }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && many) { e.preventDefault(); clear(); }
    else if (e.key === 'Escape' && many) { e.preventDefault(); setAnchor({ r, c }); setFocus({ r, c }); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !input?.value) { e.preventDefault(); setAnchor({ r: 0, c: 0 }); setFocus({ r: Math.max(0, rows - 1), c: cols.length - 1 }); }
  };
  const down = (e: MouseEvent, r: number, c: number) => { if (e.shiftKey && focus) { e.preventDefault(); extending.current = true; setFocus({ r, c }); e.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus(); return; } setAnchor({ r, c }); setFocus({ r, c }); setDragging(true); };
  const enter = (r: number, c: number) => { if (dragging) { setFocus({ r, c }); window.getSelection()?.removeAllRanges(); } };
  const removable = rows > minRows;
  if (!cols.length) return null;
  return <div className="ig" ref={grid} onCopy={onCopy} role="grid" aria-label="Items" aria-rowcount={total + 1} style={{ ['--ig-cols' as string]: `42px ${cols.map(c => c.width ?? '1fr').join(' ')} 34px` }}>
    <div className="ig-row ig-head" role="row"><span className="ig-n" role="columnheader" aria-label="Row" />{cols.map(col => <span key={col.key} className="ig-h" role="columnheader">{col.label}</span>)}<span role="columnheader" aria-label="Row actions" /></div>
    {Array.from({ length: total }, (_, r) => {
      const item = items[r], ghost = !item;
      return <div key={item?.id ?? 'new'} className={`ig-row ${ghost ? 'ig-ghost' : ''} ${focus?.r === r ? 'ig-on' : ''}`} role="row">
        <span className="ig-n" role="rowheader">{ghost ? '+' : r + 1}</span>
        {cols.map((col, c) => {
          const value = item ? col.get(item) : '';
          const cls = `ig-cell ${inSel(r, c) && many ? 'ig-sel' : ''} ${focus?.r === r && focus.c === c ? 'ig-focus' : ''} ${col.options ? 'ig-pick' : ''}`;
          const common = { 'data-cell': `${r}:${c}`, 'aria-label': `${col.label}, row ${r + 1}`, onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => onKey(e, r, c), onFocus: () => { const keep = extending.current || dragging; extending.current = false; if (!(focus?.r === r && focus.c === c)) { setFocus({ r, c }); if (!keep) setAnchor({ r, c }); } } };
          return <span key={col.key} className={cls} role="gridcell" onMouseDown={e => down(e, r, c)} onMouseEnter={() => enter(r, c)}>
            {col.options ? <select {...common} value={value} disabled={ghost} onChange={e => set(r, c, e.target.value)}>{col.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <CellInput {...common} value={value} placeholder={r === 0 || ghost ? col.placeholder : ''} disabled={col.key === 'move' && item?.special !== 'back'} onValue={v => set(r, c, v)} onPaste={e => onPaste(e, r, c)} />}
          </span>;
        })}
        <span role="gridcell" className="ig-action">{item && removable && !(board && (r === 0 || r === rows - 1)) ? <button type="button" className="ig-x" aria-label={`Remove row ${r + 1}`} title="Remove this row" tabIndex={-1} onClick={() => onRemove(many && sel && r >= sel.r0 && r <= sel.r1 ? Array.from({ length: Math.min(sel.r1, rows - 2) - Math.max(sel.r0, board ? 1 : 0) + 1 }, (_, n) => Math.max(sel.r0, board ? 1 : 0) + n) : [r])}>×</button> : null}</span>
      </div>;
    })}
    <p className="ig-help"><kbd>Tab</kbd> next cell <kbd>Enter</kbd> next row <span>Paste rows and columns from Excel or Google Sheets</span> <span>Shift or drag to select · <kbd>Delete</kbd> clears</span></p>
  </div>;
}

// Keeps the caret steady while the change goes through the editor.
function CellInput({ value, onValue, ...rest }: { value: string; onValue: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & Record<string, unknown>) {
  const [draft, setDraft] = useState(value); const ref = useRef<HTMLInputElement>(null), lastSent = useRef<string | null>(null);
  useEffect(() => { if (document.activeElement !== ref.current || lastSent.current !== value) setDraft(value); lastSent.current = null; }, [value]);
  return <input ref={ref} {...rest} value={document.activeElement === ref.current ? draft : value} onChange={e => { lastSent.current = e.target.value; setDraft(e.target.value); onValue(e.target.value); }} onBlur={() => setDraft(value)} />;
}
