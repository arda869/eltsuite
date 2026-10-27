import { NSelect } from '../components/Select';
import { tell } from '../lib/ask';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { newId } from '../lib/tasks';
import { layoutCrossword, newPackData, PACK_LABELS, tokenise, type PackKind } from '../lib/pack';
import { audioUrl as mediaUrl, saveImage, speak } from '../lib/media';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { archiveAdd } from '../lib/archive';
import { isLearnerEmail } from '../lib/learners';
import { useNotebook } from '../lib/notebook';
import { useEditorClass } from './context';
import { NoteFields } from './NoteFields';
import { Grip } from './nodes';
import { ExampleToggle } from './ExampleToggle';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = Record<string, any>;
const LETTERS = 'ABCDEFGHIJKLMNOP';

// Pictures: a web address, or "media:<id>" for a picture uploaded to the class.
export function useImageSrc(classId: string, src: string) {
  const [url, setUrl] = useState(src.startsWith('media:') ? '' : src);
  useEffect(() => {
    if (src.startsWith('media:')) mediaUrl(classId, src.slice(6)).then(setUrl).catch(() => setUrl(''));
    else setUrl(src);
  }, [classId, src]);
  return url;
}

// Picture quality when uploading: smaller files take less space in the resources library.
export type PicQuality = 'high' | 'standard' | 'small';
export const PIC_QUALITY: { k: PicQuality; label: string; about: string; max: [number, number]; q: number; limit: number }[] = [
  { k: 'high', label: 'High', about: 'Sharp on a big screen', max: [2000, 1500], q: 0.88, limit: 560 },
  { k: 'standard', label: 'Standard', about: 'Good for most tasks', max: [1400, 1000], q: 0.82, limit: 500 },
  { k: 'small', label: 'Small', about: 'Saves the most space', max: [900, 700], q: 0.7, limit: 220 },
];
const shrink = async (bmp: ImageBitmap, maxW: number, maxH: number, q0: number, limitKB: number) => {
  const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  let q = q0;
  let blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  while (blob.size > limitKB * 1024 && q > 0.4) {
    q -= 0.12;
    blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  }
  return { blob, canvas: c };
};

// Shrinks a picture and stores it with the class: "media:<id>", its size and a small preview.
export async function uploadPictureFull(classId: string, file: Blob, quality: PicQuality = 'standard') {
  const bmp = await createImageBitmap(file);
  const p = PIC_QUALITY.find((x) => x.k === quality) ?? PIC_QUALITY[1];
  const { blob } = await shrink(bmp, p.max[0], p.max[1], p.q, p.limit);
  const thumb = await shrink(bmp, 240, 180, 0.7, 24);
  const preview = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(thumb.blob);
  });
  return { src: 'media:' + (await saveImage(classId, blob)), size: blob.size, thumb: preview };
}
// Every picture a teacher uploads also goes into their resources library, to use again anywhere.
// Sizes in the archive are the space the picture takes as stored (a third more than the file).
export async function uploadPicture(classId: string, file: File | Blob, quality: PicQuality = 'standard', name?: string, folder = '') {
  const r = await uploadPictureFull(classId, file, quality);
  const u = auth.currentUser;
  if (u && !isLearnerEmail(u.email))
    await archiveAdd(u.uid, {
      kind: 'image',
      name: (name ?? (file instanceof File ? file.name : '')).replace(/\.[a-z0-9]+$/i, '').trim() || 'Picture',
      folder,
      tags: [],
      size: Math.round((r.size * 4) / 3),
      home: { classId, mediaId: r.src.slice(6) },
      thumb: r.thumb,
    }).catch(() => {});
  return r.src;
}

function PictureField({ value, onChange, label = 'Picture' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { classId } = useEditorClass();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="pq-pic">
      <span className="pq-lab">{label}</span>
      <input value={value.startsWith('media:') ? 'Uploaded picture' : value} readOnly={value.startsWith('media:')} placeholder="https://… or upload" onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="btn small-btn" disabled={busy || !classId} onClick={() => file.current?.click()}>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
      {value && (
        <button type="button" className="icon-btn" aria-label="Remove picture" onClick={() => onChange('')}>
          ×
        </button>
      )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            onChange(await uploadPicture(classId, f));
          } catch {
            void tell('The picture could not be added. Try a smaller one.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </span>
  );
}

// A list of text lines with add and remove.
function Lines({ items, onChange, placeholder, numbered, min = 1 }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; numbered?: (i: number) => string; min?: number }) {
  return (
    <div className="pq-lines">
      {items.map((x, i) => (
        <span key={i} className="pq-line">
          {numbered && <span className="pq-n">{numbered(i)}</span>}
          <input
            value={x}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((y, k) => (k === i ? e.target.value : y)))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)]);
              }
            }}
          />
          <button type="button" className="icon-btn" aria-label="Remove" disabled={items.length <= min} onClick={() => onChange(items.filter((_, k) => k !== i))}>
            ×
          </button>
        </span>
      ))}
      <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, ''])}>
        + Add
      </button>
    </div>
  );
}

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
// Comma lists keep their own text while typing.
function CommaField({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [t, setT] = useState(value.join(', '));
  return <input value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onBlur={() => onChange(csv(t))} onKeyDown={(e) => e.stopPropagation()} />;
}
function PipeField({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [t, setT] = useState(value.join(' | '));
  return <input value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onBlur={() => onChange(t.split('|').map((x) => x.trim()).filter(Boolean))} onKeyDown={(e) => e.stopPropagation()} />;
}

function LabelPoints({ d, set }: { d: Data; set: (p: Data) => void }) {
  const { classId } = useEditorClass();
  const url = useImageSrc(classId, d.image ?? '');
  const pts: { x: number; y: number; label: string }[] = d.points ?? [];
  return (
    <>
      <PictureField value={d.image ?? ''} onChange={(v) => set({ image: v })} />
      {url ? (
        <div
          className="pq-label-img"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
            const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
            set({ points: [...pts, { x, y, label: '' }] });
          }}
        >
          <img src={url} alt="" draggable={false} />
          {pts.map((p, i) => (
            <span key={i} className="pq-dot" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              {i + 1}
            </span>
          ))}
        </div>
      ) : (
        <span className="hint">Add a picture, then click on it to place each label point.</span>
      )}
      {pts.length > 0 && (
        <div className="pq-lines">
          {pts.map((p, i) => (
            <span key={i} className="pq-line">
              <span className="pq-n">{i + 1}</span>
              <input value={p.label} placeholder="Label for this point" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ points: pts.map((q, k) => (k === i ? { ...q, label: e.target.value } : q)) })} />
              <button type="button" className="icon-btn" aria-label="Remove point" onClick={() => set({ points: pts.filter((_, k) => k !== i) })}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="inline-field">
        Extra labels
        <CommaField value={d.extras ?? []} onChange={(v) => set({ extras: v })} placeholder="Labels that belong nowhere, separated by commas" />
      </label>
    </>
  );
}

function Editor({ kind, d, set }: { kind: PackKind; d: Data; set: (p: Data) => void }) {
  const { classId } = useEditorClass();
  switch (kind) {
    case 'fix': {
      const ok = !d.wrong?.trim() || ` ${String(d.sentence ?? '').toLowerCase()} `.includes(` ${String(d.wrong).toLowerCase().trim()} `);
      return (
        <>
          <input className="mcq-prompt" value={d.sentence ?? ''} placeholder="The sentence with a mistake, for example: She have been to Paris twice." onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ sentence: e.target.value })} />
          <label className="inline-field">
            The mistake
            <input value={d.wrong ?? ''} placeholder="have" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ wrong: e.target.value })} />
          </label>
          {!ok && <span className="error">The mistake must be words from the sentence.</span>}
          <label className="inline-field">
            Correction
            <PipeField value={d.fixes ?? []} onChange={(v) => set({ fixes: v })} placeholder="has   (other accepted answers after |)" />
          </label>
          <span className="hint">Learners tap the wrong word, then type the correction: 1 point for finding it, 1 for fixing it.</span>
        </>
      );
    }
    case 'categorise': {
      const cats: { name: string; items: string[] }[] = d.cats ?? [];
      const put = (i: number, p: Data) => set({ cats: cats.map((c, k) => (k === i ? { ...c, ...p } : c)) });
      return (
        <>
          <div className="pq-cats">
            {cats.map((c, i) => (
              <div key={i} className="pq-cat">
                <span className="pq-cat-head">
                  <input value={c.name} placeholder="Column name" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => put(i, { name: e.target.value })} />
                  <button type="button" className="icon-btn" aria-label="Remove column" disabled={cats.length <= 2} onClick={() => set({ cats: cats.filter((_, k) => k !== i) })}>
                    ×
                  </button>
                </span>
                <CommaField value={c.items} onChange={(v) => put(i, { items: v })} placeholder="apple, chair, idea" />
              </div>
            ))}
            <button type="button" className="gd-add pq-cat-add" onClick={() => set({ cats: [...cats, { name: '', items: [] }] })}>
              + Column
            </button>
          </div>
          <span className="hint">Write the words in each column, separated by commas. Learners see them mixed up. 1 point per word.</span>
        </>
      );
    }
    case 'transform':
      return (
        <>
          <input className="mcq-prompt" value={d.first ?? ''} placeholder="First sentence: This is my first time in Hong Kong." onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ first: e.target.value })} />
          <div className="pq-row">
            <label className="inline-field">
              Key word
              <input value={d.keyWord ?? ''} placeholder="NEVER" style={{ textTransform: 'uppercase', width: 120 }} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ keyWord: e.target.value.toUpperCase() })} />
            </label>
            <label className="inline-field small-field">
              Words
              <input inputMode="numeric" value={d.min ?? ''} style={{ width: 40 }} onChange={(e) => set({ min: Number(e.target.value) || null })} />
              to
              <input inputMode="numeric" value={d.max ?? ''} style={{ width: 40 }} onChange={(e) => set({ max: Number(e.target.value) || null })} />
            </label>
          </div>
          <div className="pq-row pq-tr">
            <input value={d.before ?? ''} placeholder="I" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ before: e.target.value })} />
            <span className="pq-gap-mark">gap</span>
            <input value={d.after ?? ''} placeholder="to Hong Kong before." onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ after: e.target.value })} />
          </div>
          <label className="inline-field">
            Answers
            <PipeField value={d.answers ?? []} onChange={(v) => set({ answers: v })} placeholder="have never been | 've never been" />
          </label>
        </>
      );
    case 'highlight': {
      const { groups } = tokenise(d.text ?? '');
      return (
        <>
          <input className="mcq-prompt" value={d.instruction ?? ''} placeholder="Tap every past participle." onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ instruction: e.target.value })} />
          <textarea className="pq-text" rows={4} value={d.text ?? ''} placeholder="I have {{seen}} the film and she has {{read}} the book." onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ text: e.target.value })} />
          <span className="hint">Put the words learners should tap in {'{{ }}'}. {groups.length} to find.</span>
          <label className="check-row">
            <input type="checkbox" checked={d.penalty !== false} onChange={() => set({ penalty: d.penalty === false })} />
            Wrong taps cost a point
          </label>
        </>
      );
    }
    case 'sentences':
      return (
        <>
          <Lines items={d.items ?? []} onChange={(v) => set({ items: v })} placeholder="A sentence or paragraph" numbered={(i) => String(i + 1)} min={2} />
          <span className="hint">Write them in the right order. Learners see them shuffled. 1 point for each one in the right place.</span>
        </>
      );
    case 'label':
      return <LabelPoints d={d} set={set} />;
    case 'odd': {
      const ws: string[] = d.words ?? [];
      return (
        <>
          <div className="pq-odd">
            {ws.map((w, i) => (
              <span key={i} className={'pq-odd-word' + (d.odd === i ? ' on' : '')}>
                <input value={w} placeholder={`Word ${i + 1}`} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ words: ws.map((x, k) => (k === i ? e.target.value : x)) })} />
                <button type="button" className="pq-odd-pick" title="This is the odd one out" aria-pressed={d.odd === i} onClick={() => set({ odd: i })}>
                  {d.odd === i ? 'Odd one' : 'Mark'}
                </button>
              </span>
            ))}
            <button type="button" className="btn link small" onClick={() => set({ words: [...ws, ''] })}>
              + Word
            </button>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={!!d.reason} onChange={() => set({ reason: !d.reason })} />
            Ask for a reason (you read it; it isn’t marked automatically)
          </label>
        </>
      );
    }
    case 'gapped': {
      const n = (String(d.text ?? '').match(/\{\{\d+\}\}/g) ?? []).length;
      const removed: string[] = d.removed ?? [];
      return (
        <>
          <textarea className="pq-text" rows={6} value={d.text ?? ''} placeholder={'The text, with {{1}} and {{2}} where sentences were taken out.'} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ text: e.target.value })} />
          <span className="hint">Mark each gap with its number in {'{{ }}'}, for example {'{{1}}'}. {n} gaps in the text.</span>
          <span className="pq-lab">Sentences taken out</span>
          <Lines items={removed} onChange={(v) => set({ removed: v })} placeholder="The sentence that goes in this gap" numbered={(i) => String(i + 1)} />
          <span className="pq-lab">Extra sentences that don’t fit</span>
          <Lines items={d.extras ?? []} onChange={(v) => set({ extras: v })} placeholder="A distractor" min={0} />
        </>
      );
    }
    case 'matching': {
      const opts: string[] = d.options ?? [];
      const names: string[] = d.names ?? [];
      const st: { text: string; answer: number }[] = d.statements ?? [];
      return (
        <>
          <span className="pq-lab">Texts or people</span>
          <div className="pq-opts">
            {opts.map((o, i) => (
              <span key={i} className="pq-line">
                <span className="pq-n">{o}</span>
                <input value={names[i] ?? ''} placeholder="Name (optional), for example: Anna" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ names: opts.map((_, k) => (k === i ? e.target.value : names[k] ?? '')) })} />
              </span>
            ))}
            <span className="pq-row">
              <button type="button" className="btn link small" disabled={opts.length >= 10} onClick={() => set({ options: [...opts, LETTERS[opts.length]], names: [...names, ''] })}>
                + Option
              </button>
              <button type="button" className="btn link small" disabled={opts.length <= 2} onClick={() => set({ options: opts.slice(0, -1), names: names.slice(0, opts.length - 1) })}>
                − Option
              </button>
            </span>
          </div>
          <span className="pq-lab">Statements</span>
          <div className="pq-lines">
            {st.map((s, i) => (
              <span key={i} className="pq-line">
                <span className="pq-n">{i + 1}</span>
                <input value={s.text} placeholder="Which person mentions moving abroad?" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ statements: st.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
                <NSelect value={s.answer} aria-label="Answer" onChange={(e) => set({ statements: st.map((x, k) => (k === i ? { ...x, answer: Number(e.target.value) } : x)) })}>
                  {opts.map((o, k) => (
                    <option key={k} value={k}>
                      {o}
                    </option>
                  ))}
                </NSelect>
                <button type="button" className="icon-btn" aria-label="Remove" disabled={st.length <= 1} onClick={() => set({ statements: st.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </span>
            ))}
            <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => set({ statements: [...st, { text: '', answer: 0 }] })}>
              + Statement
            </button>
          </div>
          <span className="hint">Each option can be the answer more than once.</span>
        </>
      );
    }
    case 'speaking': {
      const imgs: string[] = d.images ?? [];
      return (
        <>
          <textarea className="pq-text" rows={2} value={d.prompt ?? ''} placeholder="Compare the two photos and say why people choose these holidays." onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ prompt: e.target.value })} />
          {[0, 1].map((i) => (
            <PictureField key={i} label={`Photo ${i + 1}`} value={imgs[i] ?? ''} onChange={(v) => set({ images: [0, 1].map((k) => (k === i ? v : imgs[k] ?? '')).filter((x, k) => x || k < 1) })} />
          ))}
          <span className="pq-lab">Questions on the card</span>
          <Lines items={d.questions?.length ? d.questions : ['']} onChange={(v) => set({ questions: v })} placeholder="Which holiday would you prefer? Why?" min={0} />
          <div className="pq-row">
            <label className="inline-field small-field">
              Timer
              <NSelect value={d.timer ?? 60} onChange={(e) => set({ timer: Number(e.target.value) })}>
                {[30, 45, 60, 90, 120, 180].map((s) => (
                  <option key={s} value={s}>
                    {s < 60 ? `${s} seconds` : `${s / 60} min${s > 60 ? '' : ''}`}
                  </option>
                ))}
              </NSelect>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={d.pairs !== false} onChange={() => set({ pairs: d.pairs === false })} />
              Pairs (“Your partner’s turn”)
            </label>
          </div>
          {!classId && null}
        </>
      );
    }
    case 'dictation':
      return (
        <>
          <textarea className="pq-text" rows={2} value={d.sentence ?? ''} placeholder="The sentence learners will hear and type." onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ sentence: e.target.value })} />
          <div className="pq-row">
            <label className="inline-field small-field">
              Replays
              <NSelect value={d.replays ?? 2} onChange={(e) => set({ replays: Number(e.target.value) })}>
                {[1, 2, 3, 5, 99].map((n) => (
                  <option key={n} value={n}>
                    {n === 99 ? 'Unlimited' : n}
                  </option>
                ))}
              </NSelect>
            </label>
            <label className="inline-field small-field">
              Accent
              <NSelect value={d.accent ?? 'RP'} onChange={(e) => set({ accent: e.target.value })}>
                <option value="RP">British</option>
                <option value="GA">American</option>
              </NSelect>
            </label>
            <button type="button" className="btn small-btn" onClick={() => speak(d.sentence ?? '', d.accent ?? 'RP')} disabled={!String(d.sentence ?? '').trim()}>
              Listen
            </button>
          </div>
          <span className="hint">Read aloud by the browser. Marked word by word; 1 point per word. Learners see the sentence only after they check.</span>
        </>
      );
    case 'pairs': {
      const items: { say: string; options: string[] }[] = d.items ?? [];
      return (
        <>
          <div className="pq-lines">
            {items.map((it, i) => (
              <span key={i} className="pq-line pq-pair">
                <span className="pq-n">{i + 1}</span>
                <PipeField value={it.options ?? []} placeholder="ship | sheep" onChange={(v) => set({ items: items.map((x, k) => (k === i ? { ...x, options: v, say: v.includes(x.say) ? x.say : v[0] ?? '' } : x)) })} />
                <NSelect value={it.say} aria-label="The word learners hear" onChange={(e) => set({ items: items.map((x, k) => (k === i ? { ...x, say: e.target.value } : x)) })}>
                  {(it.options ?? []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </NSelect>
                <button type="button" className="icon-btn" aria-label="Listen" onClick={() => speak(it.say, d.accent ?? 'RP')}>
                  ♪
                </button>
                <button type="button" className="icon-btn" aria-label="Remove" disabled={items.length <= 1} onClick={() => set({ items: items.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </span>
            ))}
            <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => set({ items: [...items, { say: '', options: [] }] })}>
              + Add a pair
            </button>
          </div>
          <div className="pq-row">
            <label className="inline-field small-field">
              Accent
              <NSelect value={d.accent ?? 'RP'} onChange={(e) => set({ accent: e.target.value })}>
                <option value="RP">British</option>
                <option value="GA">American</option>
              </NSelect>
            </label>
          </div>
          <span className="hint">Write the similar-sounding words separated by |, then choose the one learners hear. 1 point each.</span>
        </>
      );
    }
    case 'crossword':
    case 'wordsearch':
      return <WordGridEditor kind={kind} d={d} set={set} classId={classId} />;
  }
}

// Words and clues for a crossword or word search, typed or taken from the class notebook.
function WordGridEditor({ kind, d, set, classId }: { kind: 'crossword' | 'wordsearch'; d: Data; set: (p: Data) => void; classId: string }) {
  const words: { word: string; clue: string }[] = d.words ?? [];
  const [picking, setPicking] = useState(false);
  const preview = kind === 'crossword' ? layoutCrossword(words) : null;
  return (
    <>
      <div className="pq-lines">
        {words.map((w, i) => (
          <span key={i} className="pq-line pq-wordclue">
            <input value={w.word} placeholder="word" aria-label="Word" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ words: words.map((x, k) => (k === i ? { ...x, word: e.target.value } : x)) })} />
            <input value={w.clue} placeholder="clue (the meaning)" aria-label="Clue" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set({ words: words.map((x, k) => (k === i ? { ...x, clue: e.target.value } : x)) })} />
            <button type="button" className="icon-btn" aria-label="Remove" disabled={words.length <= 1} onClick={() => set({ words: words.filter((_, k) => k !== i) })}>
              ×
            </button>
          </span>
        ))}
        <span style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn link small" onClick={() => set({ words: [...words, { word: '', clue: '' }] })}>
            + Add a word
          </button>
        </span>
      </div>
      <span className="hint">
        {kind === 'crossword' ? `${preview?.placed.length ?? 0} words placed on a ${preview?.rows ?? 0} × ${preview?.cols ?? 0} grid. Learners see the clues and type the letters; 1 point per word.` : 'Learners read each clue, then find and mark the word in the grid. Words go in any direction; 1 point per word.'}
        {' '}Only letters are used; spaces and hyphens are removed.
      </span>
      {picking && <NotebookWordPicker classId={classId} onClose={() => setPicking(false)} onPick={(list) => (set({ words: [...words.filter((w) => w.word.trim()), ...list], from: 'notebook' }), setPicking(false))} />}
    </>
  );
}

function NotebookWordPicker({ classId, onPick, onClose }: { classId: string; onPick: (list: { word: string; clue: string }[]) => void; onClose: () => void }) {
  const { user } = useAuth();
  const me = user ? { uid: user.uid, name: 'Teacher', teacher: true } : null;
  const entries = useNotebook(classId, me);
  const vocab = entries.filter((e) => e.type === 'vocab' && e.data.word && e.status === 'published');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const shown = vocab.filter((e) => !q || `${e.data.word} ${e.data.def?.meaning ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Words from the class notebook" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Words from the class notebook</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" onKeyDown={(e) => e.stopPropagation()} />
        {!vocab.length ? (
          <span className="hint">No words in the class notebook yet.</span>
        ) : (
          <div className="aud-pick ws-tasks">
            {shown.map((e) => (
              <label key={e.id} className="pop-check">
                <input type="checkbox" checked={sel.has(e.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} />
                <strong>{e.data.word}</strong>
                {e.data.def?.meaning && <span className="hint"> · {e.data.def.meaning}</span>}
              </label>
            ))}
          </div>
        )}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!sel.size} onClick={() => onPick(vocab.filter((e) => sel.has(e.id)).map((e) => ({ word: e.data.word!, clue: e.data.def?.meaning ?? '' })))}>
            Add {sel.size || ''} {sel.size === 1 ? 'word' : 'words'}
          </button>
        </span>
      </div>
    </div>
  );
}

function PackView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
  const kind = node.attrs.kind as PackKind;
  const d: Data = node.attrs.data ?? newPackData(kind);
  const set = (p: Data) => updateAttributes({ data: { ...d, ...p } });
  return (
    <NodeViewWrapper className={'block-node q-block pq-node' + (selected ? ' is-selected' : '')} contentEditable={false} data-kind={kind}>
      <div className={'mcq-tools' + (node.attrs.example ? ' is-example' : '')}>
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">{PACK_LABELS[kind]}</span>
        {kind !== 'speaking' && <ExampleToggle on={!!node.attrs.example} onChange={(v) => updateAttributes({ example: v })} />}
        <button type="button" onClick={deleteNode}>
          Remove
        </button>
      </div>
      <div className="pq-edit">
        <Editor kind={kind} d={d} set={set} />
      </div>
      {kind !== 'speaking' && <NoteFields hint={node.attrs.hint ?? ''} feedback={node.attrs.feedback ?? ''} onSave={(p) => updateAttributes(p)} />}
    </NodeViewWrapper>
  );
}

export const PackNode = Node.create({
  name: 'pq',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, kind: { default: 'fix' }, data: { default: null }, hint: { default: '' }, feedback: { default: '' }, example: { default: false } }),
  parseHTML: () => [{ tag: 'div[data-pq]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-pq': '' })],
  addNodeView: () => ReactNodeViewRenderer(PackView),
});

export const newPack = (kind: PackKind) => ({ type: 'pq', attrs: { id: newId(), kind, data: newPackData(kind) } });
