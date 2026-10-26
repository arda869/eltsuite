import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { TaskRenderer } from '../components/TaskRenderer';
import { TaskEditor } from '../editor/TaskEditor';
import { IpaField } from '../editor/Ipa';
import { tell } from '../lib/ask';
import { fileToData } from '../lib/phonAudio';
import type { SharedDoc } from '../lib/sharedDocs';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { sizeOfCards, addCard, addRows, configOf, FIELD_TYPES, imageToData, plainOf, removeCard, saveConfig, setCell, STYLES, useCards, type Card, type CardValue, type Field, type FieldType, type FlashConfig, type FlashLook } from '../lib/flash';
import { newId } from '../lib/tasks';
import '../lib/extras.css';

// A flashcard set: cards to flip, a table to type into like a spreadsheet, and a study view.

type View = 'cards' | 'table' | 'study';

function Value({ field, v, big }: { field: Field; v: CardValue; big?: boolean }) {
  if (v === null || v === undefined || v === '') return null;
  if (field.type === 'image') return typeof v === 'string' ? <img className="fc-img" src={v} alt="" draggable={false} /> : null;
  if (field.type === 'audio')
    return typeof v === 'string' ? (
      <button type="button" className="fc-audio" onClick={(e) => (e.stopPropagation(), void new Audio(v).play().catch(() => {}))} aria-label="Listen">
        <svg width={big ? 20 : 15} height={big ? 20 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      </button>
    ) : null;
  if (field.type === 'ipa') return <span className="fc-ipa">/{String(v).replace(/^\/|\/$/g, '')}/</span>;
  if (field.type === 'rich' && typeof v === 'object') return <span className="fc-rich"><TaskRenderer content={v as JSONContent} responses={{}} disabled /></span>;
  return <span className={'fc-text f-' + field.id}>{plainOf(v)}</span>;
}

function Face({ cfg, card, side, big }: { cfg: FlashConfig; card: Card; side: 'front' | 'back'; big?: boolean }) {
  const ids = side === 'front' ? cfg.front : cfg.back;
  const fields = ids.map((id) => cfg.fields.find((f) => f.id === id)).filter(Boolean) as Field[];
  const pic = fields.find((f) => f.type === 'image' && card.f[f.id]);
  const rest = fields.filter((f) => f !== pic);
  const first = rest.find((f) => f.type === 'text' && card.f[f.id]);
  return (
    <span className={'fc-face ' + side + (pic ? ' has-pic' : '')}>
      {pic && <span className="fc-pic">{<Value field={pic} v={card.f[pic.id]} big={big} />}</span>}
      <span className="fc-body">
        {rest.map((f) => (
          <span key={f.id} className={'fc-field t-' + f.type + (f === first ? ' lead' : '')}>
            <Value field={f} v={card.f[f.id]} big={big} />
          </span>
        ))}
      </span>
    </span>
  );
}

export function FlashCard({ cfg, card, flipped, onFlip, big }: { cfg: FlashConfig; card: Card; flipped: boolean; onFlip?: () => void; big?: boolean }) {
  const l = cfg.look;
  return (
    <span className={`fc s-${l.style} font-${l.font} size-${l.size} pic-${l.pic} al-${l.align}` + (flipped ? ' flipped' : '') + (big ? ' big' : '')} onClick={onFlip} role="button" tabIndex={0} aria-label={flipped ? 'Back of the card. Show the front' : 'Front of the card. Turn it over'} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFlip?.())}>
      <span className="fc-in">
        <Face cfg={cfg} card={card} side="front" big={big} />
        <Face cfg={cfg} card={card} side="back" big={big} />
      </span>
    </span>
  );
}

// ------------------------------------------------------------------ editing one value

function MediaInput({ field, v, onSave }: { field: Field; v: CardValue; onSave: (v: CardValue) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const pick = async (f: File) => {
    try {
      onSave(field.type === 'image' ? await imageToData(f) : await fileToData(f));
    } catch {
      void tell(field.type === 'image' ? 'That picture could not be used.' : 'That recording is too big. Keep it under 650 KB.');
    }
  };
  const record = async () => {
    if (rec) return rec.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const parts: Blob[] = [];
      mr.ondataavailable = (e) => parts.push(e.data);
      mr.onstop = () => (stream.getTracks().forEach((t) => t.stop()), setRec(null), void pick(new File(parts, 'rec.webm', { type: mr.mimeType })));
      mr.start();
      setRec(mr);
      window.setTimeout(() => mr.state === 'recording' && mr.stop(), 10000);
    } catch {
      void tell('The microphone could not be opened.');
    }
  };
  return (
    <span className="fs-media">
      {v ? <Value field={field} v={v} /> : <span className="hint">None</span>}
      {field.type === 'audio' && (
        <button type="button" className={'btn small-btn' + (rec ? ' snd-rec' : '')} onClick={() => void record()}>
          {rec ? 'Stop' : 'Record'}
        </button>
      )}
      <button type="button" className="btn small-btn" onClick={() => ref.current?.click()}>
        Upload
      </button>
      {field.type === 'image' && (
        <button type="button" className="btn small-btn" onClick={() => { const u = window.prompt('Picture address (https://…)'); if (u && /^https:\/\//.test(u)) onSave(u); }}>
          Web address
        </button>
      )}
      {v && (
        <button type="button" className="btn link small" onClick={() => onSave(null)}>
          Remove
        </button>
      )}
      <input ref={ref} type="file" hidden accept={field.type === 'image' ? 'image/*' : 'audio/*'} onChange={(e) => (e.target.files?.[0] && void pick(e.target.files[0]), (e.target.value = ''))} />
    </span>
  );
}

function FieldInput({ field, v, onSave, autoFocus }: { field: Field; v: CardValue; onSave: (v: CardValue) => void; autoFocus?: boolean }) {
  const [t, setT] = useState(typeof v === 'string' ? v : plainOf(v));
  useEffect(() => setT(typeof v === 'string' ? v : plainOf(v)), [v]);
  if (field.type === 'image' || field.type === 'audio') return <MediaInput field={field} v={v} onSave={onSave} />;
  if (field.type === 'ipa') return <IpaField value={t} onChange={(x) => (setT(x), onSave(x))} />;
  if (field.type === 'rich')
    return (
      <span className="fs-rich">
        <TaskEditor content={(typeof v === 'object' && v) || { type: 'doc', content: [{ type: 'paragraph', content: typeof v === 'string' && v ? [{ type: 'text', text: v }] : [] }] }} onChange={(c) => onSave(c)} handles={false} compact textOnly placeholder="Write here. Bold, colour, word stress, IPA…" />
      </span>
    );
  return <input className="fs-in" value={t} autoFocus={autoFocus} onChange={(e) => setT(e.target.value)} onBlur={() => t !== (typeof v === 'string' ? v : '') && onSave(t)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function CardPanel({ set, cfg, card, onClose, canEdit }: { set: string; cfg: FlashConfig; card: Card; onClose: () => void; canEdit: boolean }) {
  return (
    <aside className="fs-panel" aria-label="Edit the card">
      <div className="fs-panel-head">
        <b>Card {card.order + 1}</b>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {cfg.fields.map((f, i) => (
        <label key={f.id} className="fs-field">
          <span>
            {f.name} <span className="hint">{cfg.front.includes(f.id) ? 'front' : cfg.back.includes(f.id) ? 'back' : 'not shown'}</span>
          </span>
          {canEdit ? <FieldInput field={f} v={card.f[f.id] ?? null} onSave={(v) => void setCell(set, card.id, f.id, v)} autoFocus={i === 0} /> : <Value field={f} v={card.f[f.id] ?? null} />}
        </label>
      ))}
      {canEdit && (
        <button type="button" className="btn link small set-danger" onClick={() => (void removeCard(set, card.id), onClose())}>
          Delete this card
        </button>
      )}
    </aside>
  );
}

// ------------------------------------------------------------------ the table

function Table({ set, cfg, cards, canEdit, onOpen }: { set: string; cfg: FlashConfig; cards: Card[]; canEdit: boolean; onOpen: (c: Card) => void }) {
  const textual = (f: Field) => f.type === 'text' || f.type === 'ipa';
  // Pasting rows from a spreadsheet fills the table from this cell, adding cards as needed.
  const paste = async (e: React.ClipboardEvent, row: number, col: number) => {
    const t = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(t.trim())) return;
    e.preventDefault();
    const rows = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((r) => r.split('\t'));
    const cols = cfg.fields.slice(col);
    const updates: Promise<unknown>[] = [];
    const fresh: Record<string, CardValue>[] = [];
    rows.forEach((r, i) => {
      const c = cards[row + i];
      const vals = Object.fromEntries(cols.map((f, k) => [f.id, r[k] ?? '']).filter(([, v], k) => v !== '' && textual(cols[k]))) as Record<string, CardValue>;
      if (c) for (const [k, v] of Object.entries(vals)) updates.push(setCell(set, c.id, k, v));
      else fresh.push(vals);
    });
    await Promise.all(updates);
    if (fresh.length) await addRows(set, cards.length, fresh);
  };
  return (
    <div className="fs-table-wrap">
      <table className="fs-table">
        <thead>
          <tr>
            <th className="fs-n">#</th>
            {cfg.fields.map((f) => (
              <th key={f.id}>
                {f.name}
                <span className="fs-side">{cfg.front.includes(f.id) ? 'Front' : cfg.back.includes(f.id) ? 'Back' : ''}</span>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {cards.map((c, r) => (
            <tr key={c.id}>
              <td className="fs-n">{r + 1}</td>
              {cfg.fields.map((f, k) => (
                <td key={f.id} className={'t-' + f.type}>
                  {textual(f) && canEdit ? (
                    <Cell v={plainOf(c.f[f.id] ?? null)} ipa={f.type === 'ipa'} onSave={(v) => void setCell(set, c.id, f.id, v)} onPaste={(e) => void paste(e, r, k)} />
                  ) : (
                    <button type="button" className="fs-cell-btn" onClick={() => onOpen(c)}>
                      {f.type === 'rich' ? plainOf(c.f[f.id] ?? null) || <span className="hint">…</span> : <Value field={f} v={c.f[f.id] ?? null} />}
                      {!c.f[f.id] && f.type !== 'rich' && <span className="hint">{canEdit ? '+ Add' : ''}</span>}
                    </button>
                  )}
                </td>
              ))}
              <td>
                <button type="button" className="btn link small" onClick={() => onOpen(c)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <span className="fs-table-foot">
          <button type="button" className="btn small-btn" onClick={() => void addCard(set, cards.length)}>
            + Add a card
          </button>
          <span className="hint">Paste rows from Excel or Google Sheets into any cell: each column fills one field.</span>
        </span>
      )}
    </div>
  );
}

function Cell({ v, ipa, onSave, onPaste }: { v: string; ipa?: boolean; onSave: (v: string) => void; onPaste: (e: React.ClipboardEvent) => void }) {
  const [t, setT] = useState(v);
  useEffect(() => setT(v), [v]);
  return (
    <input
      className={'fs-cell' + (ipa ? ' ipa' : '')}
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => t !== v && onSave(t)}
      onPaste={onPaste}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const td = (e.target as HTMLElement).closest('td')!;
          const tr = td.parentElement as HTMLTableRowElement;
          const next = tr.nextElementSibling?.children[td.cellIndex]?.querySelector('input') as HTMLInputElement | null;
          (e.target as HTMLInputElement).blur();
          next?.focus();
        }
      }}
    />
  );
}

// ------------------------------------------------------------------ design: fields, sides, look

function Design({ cfg, onChange, sample }: { cfg: FlashConfig; onChange: (c: FlashConfig) => void; sample?: Card }) {
  const setField = (id: string, p: Partial<Field>) => onChange({ ...cfg, fields: cfg.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const side = (id: string, s: 'front' | 'back' | 'none') =>
    onChange({ ...cfg, front: s === 'front' ? [...cfg.front.filter((x) => x !== id), id] : cfg.front.filter((x) => x !== id), back: s === 'back' ? [...cfg.back.filter((x) => x !== id), id] : cfg.back.filter((x) => x !== id) });
  const look = (p: Partial<FlashLook>) => onChange({ ...cfg, look: { ...cfg.look, ...p } });
  const demo: Card = sample ?? { id: 'demo', order: 0, f: { word: 'reluctant', meaning: 'not wanting to do something', ipa: 'rɪˈlʌktənt' } };
  const seg = <K extends string>(cur: K, list: [K, string][], set: (k: K) => void, label: string) => (
    <span className="fs-look-row">
      <span className="hint">{label}</span>
      <span className="seg small-seg" role="radiogroup" aria-label={label}>
        {list.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={cur === k} className={cur === k ? 'on' : ''} onClick={() => set(k)}>
            {l}
          </button>
        ))}
      </span>
    </span>
  );
  return (
    <aside className="fs-panel fs-design" aria-label="Design the cards">
      <div className="fs-panel-head">
        <b>What each card holds</b>
      </div>
      {cfg.fields.map((f) => (
        <div key={f.id} className="fs-def">
          <input value={f.name} onChange={(e) => setField(f.id, { name: e.target.value })} aria-label="Field name" />
          <select value={f.type} onChange={(e) => setField(f.id, { type: e.target.value as FieldType })} aria-label="Kind">
            {FIELD_TYPES.map((t) => (
              <option key={t.k} value={t.k}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="seg small-seg fs-sides" role="radiogroup" aria-label="Where it shows">
            {(['front', 'back', 'none'] as const).map((s) => {
              const on = s === 'none' ? !cfg.front.includes(f.id) && !cfg.back.includes(f.id) : cfg[s].includes(f.id);
              return (
                <button key={s} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => side(f.id, s)}>
                  {s === 'front' ? 'Front' : s === 'back' ? 'Back' : 'Hidden'}
                </button>
              );
            })}
          </span>
          <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => onChange({ ...cfg, fields: cfg.fields.filter((x) => x.id !== f.id), front: cfg.front.filter((x) => x !== f.id), back: cfg.back.filter((x) => x !== f.id) })}>
            ×
          </button>
        </div>
      ))}
      {cfg.fields.length < 12 && (
        <button type="button" className="btn small-btn" onClick={() => onChange({ ...cfg, fields: [...cfg.fields, { id: 'f' + newId().slice(0, 6), name: 'New field', type: 'text' }] })}>
          + Add a field
        </button>
      )}
      <span className="hint">Hidden fields stay in the set for games and the table, but not on the cards.</span>
      <div className="fs-panel-head">
        <b>How the cards look</b>
      </div>
      <div className="fs-styles" role="radiogroup" aria-label="Card style">
        {STYLES.map((s) => (
          <button key={s.k} type="button" role="radio" aria-checked={cfg.look.style === s.k} className={'fs-style' + (cfg.look.style === s.k ? ' on' : '')} onClick={() => look({ style: s.k })}>
            <FlashCard cfg={{ ...cfg, look: { ...cfg.look, style: s.k, size: 's' } }} card={demo} flipped={false} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      {seg(cfg.look.font, [['serif', 'Serif'], ['sans', 'Sans'], ['rounded', 'Rounded']], (k) => look({ font: k }), 'Font')}
      {seg(cfg.look.size, [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], (k) => look({ size: k }), 'Text size')}
      {seg(cfg.look.pic, [['top', 'Above'], ['side', 'Beside'], ['full', 'Fills the card']], (k) => look({ pic: k }), 'Picture')}
      {seg(cfg.look.align, [['center', 'Centred'], ['left', 'Left']], (k) => look({ align: k }), 'Text')}
    </aside>
  );
}

// ------------------------------------------------------------------ the set

export function FlashSet({ d, canEdit }: { d: SharedDoc & { flash?: Partial<FlashConfig> }; canEdit: boolean }) {
  const cfg = configOf(d.flash);
  const cards = useCards(d.id);
  const [view, setView] = useState<View>('cards');
  const [open, setOpen] = useState<string | null>(null);
  const [design, setDesign] = useState(false);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<FlashConfig | null>(null);
  const cur = local ?? cfg;
  const saveT = useRef(0);
  const change = (c: FlashConfig) => {
    setLocal(c);
    window.clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => void saveConfig(d.id, c).then(() => setLocal(null)), 500);
  };
  const shown = useMemo(() => (cards ?? []).filter((c) => !q.trim() || Object.values(c.f).some((v) => plainOf(v).toLowerCase().includes(q.trim().toLowerCase()))), [cards, q]);
  const card = cards?.find((c) => c.id === open) ?? null;
  // The space the set takes, for the owner's storage.
  useEffect(() => {
    if (!cards || !canEdit) return;
    const t = window.setTimeout(() => {
      const size = sizeOfCards(cards);
      if (Math.abs(size - (d.size ?? 0)) > 1024) void updateDoc(doc(db, 'sharedDocs', d.id), { size }).catch(() => {});
    }, 4000);
    return () => window.clearTimeout(t);
  }, [cards, canEdit, d.id, d.size]);
  if (!cards) return <div className="dp-msg">Opening the cards…</div>;
  return (
    <div className={'fs' + (card || design ? ' with-panel' : '')}>
      <div className="fs-bar">
        <span className="seg" role="tablist" aria-label="View">
          {([
            ['cards', 'Cards'],
            ['table', 'Table'],
            ['study', 'Study'],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </span>
        <span className="fs-count">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </span>
        {view !== 'study' && <input className="ma-search fs-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the cards" />}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button type="button" className={'btn' + (design ? ' on' : '')} onClick={() => (setDesign((v) => !v), setOpen(null))}>
            Design the cards
          </button>
        )}
        {canEdit && (
          <button type="button" className="btn primary" onClick={async () => setOpen(await addCard(d.id, cards.length))}>
            + Add a card
          </button>
        )}
      </div>
      <div className="fs-body">
        <div className="fs-main">
          {view === 'cards' &&
            (shown.length ? (
              <div className="fs-grid">
                {shown.map((c) => (
                  <span key={c.id} className="fs-cell-card">
                    <FlashCard cfg={cur} card={c} flipped={!!flipped[c.id]} onFlip={() => setFlipped((f) => ({ ...f, [c.id]: !f[c.id] }))} />
                    {canEdit && (
                      <button type="button" className="fs-edit" onClick={() => (setOpen(c.id), setDesign(false))}>
                        Edit
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <div className="ma-empty">
                <strong>{cards.length ? 'Nothing matches' : 'No cards yet'}</strong>
                <span className="hint">{cards.length ? 'Try another search.' : 'Add cards one by one, or open the table and paste rows from a spreadsheet.'}</span>
              </div>
            ))}
          {view === 'table' && <Table set={d.id} cfg={cur} cards={cards} canEdit={canEdit} onOpen={(c) => (setOpen(c.id), setDesign(false))} />}
          {view === 'study' && <Study cfg={cur} cards={cards} />}
        </div>
        {card && <CardPanel set={d.id} cfg={cur} card={card} canEdit={canEdit} onClose={() => setOpen(null)} />}
        {design && !card && <Design cfg={cur} onChange={change} sample={cards[0]} />}
      </div>
    </div>
  );
}

function Study({ cfg, cards }: { cfg: FlashConfig; cards: Card[] }) {
  const [order, setOrder] = useState<string[]>(() => cards.map((c) => c.id));
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [backFirst, setBackFirst] = useState(false);
  useEffect(() => setOrder((o) => [...o.filter((id) => cards.some((c) => c.id === id)), ...cards.filter((c) => !o.includes(c.id)).map((c) => c.id)]), [cards]);
  const list = order.map((id) => cards.find((c) => c.id === id)).filter(Boolean) as Card[];
  const c = list[Math.min(i, list.length - 1)];
  const go = (n: number) => (setFlip(false), setI((x) => (x + n + list.length) % list.length));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === ' ') (e.preventDefault(), setFlip((f) => !f));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (!c) return <div className="ma-empty"><strong>No cards yet</strong></div>;
  const shown = backFirst ? { ...cfg, front: cfg.back, back: cfg.front } : cfg;
  return (
    <div className="fs-study">
      <FlashCard cfg={shown} card={c} flipped={flip} onFlip={() => setFlip((f) => !f)} big />
      <div className="fs-study-bar">
        <button type="button" className="btn" onClick={() => go(-1)} aria-label="Previous card">
          ‹
        </button>
        <span className="fs-pos">
          {Math.min(i, list.length - 1) + 1} / {list.length}
        </span>
        <button type="button" className="btn" onClick={() => go(1)} aria-label="Next card">
          ›
        </button>
        <button type="button" className="btn small-btn" onClick={() => (setOrder([...order].sort(() => Math.random() - 0.5)), setI(0), setFlip(false))}>
          Shuffle
        </button>
        <button type="button" className={'btn small-btn' + (backFirst ? ' on' : '')} onClick={() => (setBackFirst((v) => !v), setFlip(false))}>
          {backFirst ? 'Back first' : 'Front first'}
        </button>
      </div>
      <span className="hint">Space turns the card over. The arrow keys move between cards.</span>
    </div>
  );
}
