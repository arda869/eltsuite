import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { newId } from '../lib/tasks';
import { ask } from '../lib/ask';
import type { SharedDoc } from '../lib/sharedDocs';
import { BUBBLES, FACES, PEOPLE, POSES, PersonArt, Sketch, THINGS } from './art';
import { ItemArt, SceneView, STAGE, heightOf, itemStyle, type SbItem, type SbKind, type SbScene } from './Stage';

// A storyboard: scenes, one after another, each with people, things, speech bubbles and labels from
// the library. Everyone the file is shared with for editing works on it at the same time: every move
// is saved straight away and appears on the others' screens.

const scenesCol = (id: string) => collection(db, 'sharedDocs', id, 'scenes');
const itemsCol = (id: string) => collection(db, 'sharedDocs', id, 'sbitems');

export function useStoryboard(id: string) {
  const [scenes, setScenes] = useState<SbScene[] | null>(null);
  const [items, setItems] = useState<SbItem[]>([]);
  useEffect(() => {
    const u1 = onSnapshot(query(scenesCol(id), orderBy('order')), (s) => setScenes(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SbScene, 'id'>) }))), () => setScenes([]));
    const u2 = onSnapshot(itemsCol(id), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SbItem, 'id'>) }))), () => {});
    return () => (u1(), u2());
  }, [id]);
  return { scenes, items };
}

type Lib = 'people' | 'things' | 'bubbles';
const clean = <T,>(o: T) => JSON.parse(JSON.stringify(o)) as T;

export function StoryboardFile({ d, canEdit }: { d: SharedDoc; canEdit: boolean }) {
  const { scenes, items } = useStoryboard(d.id);
  const [cur, setCur] = useState('');
  const [sel, setSel] = useState('');
  const [lib, setLib] = useState<Lib>('people');
  const [who, setWho] = useState('maya');
  // While dragging, the item moves here at once and is saved when you let go.
  const [live, setLive] = useState<Record<string, Partial<SbItem>>>({});
  const scene = scenes?.find((s) => s.id === cur) ?? scenes?.[0];
  useEffect(() => {
    if (scenes && !scenes.length && canEdit) void setDoc(doc(scenesCol(d.id), newId()), { order: 0, caption: '', bg: 'floor' });
  }, [scenes, canEdit, d.id]);
  const here = useMemo(() => items.filter((i) => i.scene === scene?.id).map((i) => ({ ...i, ...live[i.id] })), [items, scene?.id, live]);
  const it = here.find((i) => i.id === sel);

  const save = (id: string, p: Partial<SbItem>) => void updateDoc(doc(itemsCol(d.id), id), clean(p)).catch(() => {});
  const add = (t: SbKind, ref: string, extra: Partial<SbItem> = {}) => {
    if (!scene) return;
    const id = newId();
    const w = t === 'person' ? 150 : t === 'thing' ? 150 : 230;
    const h = t === 'bubble' ? (ref === 'caption' ? 70 : 120) : undefined;
    const top = Math.max(0, ...here.map((x) => x.z ?? 1)) + 1;
    const n = here.length % 6;
    const item: Omit<SbItem, 'id'> = clean({ scene: scene.id, t, ref, x: t === 'bubble' ? 120 + n * 90 : 80 + n * 150, y: t === 'person' ? 520 - w * 1.5 : t === 'thing' ? 520 - w : 40 + (n % 3) * 30, w, h, z: top, text: t === 'bubble' ? (ref === 'label' ? 'Label' : ref === 'caption' ? 'Meanwhile…' : 'Hello!') : undefined, pose: t === 'person' ? 'stand' : undefined, face: t === 'person' ? 'happy' : undefined, ...extra });
    void setDoc(doc(itemsCol(d.id), id), item);
    setSel(id);
  };
  const remove = (id: string) => (void deleteDoc(doc(itemsCol(d.id), id)), setSel(''));
  const addScene = async () => {
    const id = newId();
    const at = (scene?.order ?? (scenes?.length ?? 0) - 1) + 0.5;
    await setDoc(doc(scenesCol(d.id), id), { order: at, caption: '', bg: scene?.bg ?? 'floor' });
    const b = writeBatch(db);
    [...(scenes ?? []), { id, order: at } as SbScene].sort((a, x) => a.order - x.order).forEach((s, k) => b.update(doc(scenesCol(d.id), s.id), { order: k }));
    await b.commit();
    setCur(id);
  };
  const removeScene = async (s: SbScene) => {
    if (!(await ask('Delete this scene? Everything in it goes too. You can’t undo this.', { ok: 'Delete the scene' }))) return;
    const b = writeBatch(db);
    items.filter((i) => i.scene === s.id).forEach((i) => b.delete(doc(itemsCol(d.id), i.id)));
    b.delete(doc(scenesCol(d.id), s.id));
    await b.commit();
    setCur('');
  };

  // The stage fills the space it has.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setWidth(Math.max(320, Math.min(el.clientWidth, (el.clientHeight - 8) * (STAGE.w / STAGE.h))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scenes === null]);
  const k = width / STAGE.w;

  // Dragging: move, resize (bottom-right corner) and rotate (the round handle on top).
  const drag = (e: React.PointerEvent, i: SbItem, how: 'move' | 'size' | 'rot') => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setSel(i.id);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = { x: i.x, y: i.y, w: i.w, h: heightOf(i), rot: i.rot ?? 0 };
    const stageEl = (e.currentTarget as HTMLElement).closest('.sb-stage') as HTMLElement;
    const r = stageEl.getBoundingClientRect();
    const cx = r.left + (i.x + start.w / 2) * k;
    const cy = r.top + (i.y + start.h / 2) * k;
    let last: Partial<SbItem> = {};
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / k;
      const dy = (ev.clientY - y0) / k;
      // Bubbles and labels stay on the stage; people and things can stand partly off it.
      const keep = i.t === 'bubble' ? 0 : 0.6;
      const cl = (v: number, size: number, max: number) => Math.round(Math.min(max - size * (1 - keep), Math.max(-size * keep, v)));
      if (how === 'move') last = { x: cl(start.x + dx, start.w, STAGE.w), y: cl(start.y + dy, start.h, STAGE.h) };
      else if (how === 'size') {
        const w = Math.max(40, Math.round(start.w + dx));
        last = i.t === 'bubble' ? { w, h: Math.max(40, Math.round(start.h + dy)) } : { w };
      } else last = { rot: Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90) };
      setLive((l) => ({ ...l, [i.id]: last }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (Object.keys(last).length) save(i.id, last);
      window.setTimeout(() => setLive((l) => {
        const n = { ...l };
        delete n[i.id];
        return n;
      }), 400);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // Keys: Delete removes the selected item, arrows nudge it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!it || !canEdit || (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      const step = e.shiftKey ? 20 : 4;
      const m: Record<string, Partial<SbItem>> = { ArrowLeft: { x: it.x - step }, ArrowRight: { x: it.x + step }, ArrowUp: { y: it.y - step }, ArrowDown: { y: it.y + step } };
      if (m[e.key]) (e.preventDefault(), save(it.id, m[e.key]));
      if (e.key === 'Delete' || e.key === 'Backspace') (e.preventDefault(), remove(it.id));
      if (e.key === 'Escape') setSel('');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (!scenes) return <div className="dp-msg">Opening the storyboard…</div>;
  const zs = here.map((x) => x.z ?? 1);
  return (
    <div className={'sbf' + (canEdit ? '' : ' ro')} style={{ ['--sb-accent' as string]: 'var(--accent, #d98f63)' }}>
      <nav className="sbf-scenes" aria-label="Scenes">
        {scenes.map((s, n) => (
          <div key={s.id} className={'sbf-thumb' + (s.id === scene?.id ? ' on' : '')}>
            <button type="button" onClick={() => (setCur(s.id), setSel(''))} aria-label={`Scene ${n + 1}`} aria-current={s.id === scene?.id}>
              <SceneView scene={s} items={items.filter((i) => i.scene === s.id)} width={150} />
            </button>
            <span className="sbf-n">{n + 1}</span>
            {canEdit && scenes.length > 1 && (
              <button type="button" className="sbf-x" aria-label={`Delete scene ${n + 1}`} onClick={() => void removeScene(s)}>
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button type="button" className="sbf-add" onClick={() => void addScene()}>
            + Scene
          </button>
        )}
      </nav>

      <section className="sbf-main" aria-label="The scene">
        {canEdit && (
          <div className="sbf-bar" role="toolbar" aria-label="The selected picture">
            {it ? (
              <>
                {it.t === 'person' && (
                  <>
                    <select value={it.ref} onChange={(e) => save(it.id, { ref: e.target.value })} aria-label="Who">
                      {Object.entries(PEOPLE).map(([k2, p]) => (
                        <option key={k2} value={k2}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select value={it.pose ?? 'stand'} onChange={(e) => save(it.id, { pose: e.target.value })} aria-label="Pose">
                      {Object.entries(POSES).map(([k2, p]) => (
                        <option key={k2} value={k2}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select value={it.face ?? 'happy'} onChange={(e) => save(it.id, { face: e.target.value })} aria-label="Face">
                      {Object.entries(FACES).map(([k2, f]) => (
                        <option key={k2} value={k2}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {it.t === 'bubble' && (
                  <select value={it.ref} onChange={(e) => save(it.id, { ref: e.target.value })} aria-label="Kind of bubble">
                    {Object.entries(BUBBLES).map(([k2, b]) => (
                      <option key={k2} value={k2}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className={'sbf-b' + (it.flip ? ' on' : '')} onClick={() => save(it.id, { flip: !it.flip })} data-tip="Face the other way">
                  Flip
                </button>
                {it.t !== 'bubble' && (
                  <>
                    <label className="sbf-r" data-tip="Turn it away from you, to fit the scene’s perspective">
                      <span>Turn</span>
                      <input type="range" min={-60} max={60} value={it.turn ?? 0} onChange={(e) => setLive((l) => ({ ...l, [it.id]: { ...l[it.id], turn: Number(e.target.value) } }))} onPointerUp={(e) => save(it.id, { turn: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => save(it.id, { turn: Number((e.target as HTMLInputElement).value) })} />
                    </label>
                    <label className="sbf-r" data-tip="Tip it back or forward">
                      <span>Tilt</span>
                      <input type="range" min={-50} max={50} value={it.tilt ?? 0} onChange={(e) => setLive((l) => ({ ...l, [it.id]: { ...l[it.id], tilt: Number(e.target.value) } }))} onPointerUp={(e) => save(it.id, { tilt: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => save(it.id, { tilt: Number((e.target as HTMLInputElement).value) })} />
                    </label>
                  </>
                )}
                <button type="button" className="sbf-b" onClick={() => save(it.id, { rot: 0, turn: 0, tilt: 0 })} data-tip="Straighten it">
                  Straighten
                </button>
                <button type="button" className="sbf-b" onClick={() => save(it.id, { z: Math.max(...zs) + 1 })} data-tip="Bring to the front">
                  Front
                </button>
                <button type="button" className="sbf-b" onClick={() => save(it.id, { z: Math.min(...zs) - 1 })} data-tip="Send to the back">
                  Back
                </button>
                <button type="button" className="sbf-b" onClick={() => add(it.t, it.ref, { ...it, id: undefined, x: it.x + 30, y: it.y + 10 } as Partial<SbItem>)} data-tip="Make a copy">
                  Copy
                </button>
                <button type="button" className="sbf-b danger" onClick={() => remove(it.id)}>
                  Delete
                </button>
              </>
            ) : (
              <>
                <span className="hint">Add people, things and speech bubbles from the right. Click one to change it; drag to move it.</span>
                {scene && (
                  <span className="sbf-bg" role="radiogroup" aria-label="Background">
                    {(['floor', 'white', 'grey', 'tint'] as const).map((b) => (
                      <button key={b} type="button" role="radio" aria-checked={(scene.bg ?? 'white') === b} className={'sbf-bgb bg-' + b + ((scene.bg ?? 'white') === b ? ' on' : '')} onClick={() => void updateDoc(doc(scenesCol(d.id), scene.id), { bg: b })} aria-label={{ floor: 'Floor line', white: 'White', grey: 'Grey', tint: 'Colour' }[b]} data-tip={{ floor: 'With a floor line', white: 'White', grey: 'Grey', tint: 'A little colour' }[b]} />
                    ))}
                  </span>
                )}
              </>
            )}
          </div>
        )}
        <div className="sbf-stagebox" ref={box}>
          {scene && (
            <SceneView scene={scene} items={here} width={width} onBackground={() => setSel('')}>
              {(i) => {
                const st = itemStyle(i);
                const on = i.id === sel;
                return (
                  <div key={i.id} className={'sb-item t-' + i.t + (on ? ' on' : '') + (canEdit ? ' can' : '')} style={st.outer} onPointerDown={(e) => drag(e, i, 'move')}>
                    <div className="sb-art" style={st.art}>
                      <ItemArt i={i} />
                    </div>
                    {i.t === 'bubble' && (
                      <BubbleText i={i} canEdit={canEdit && on} onSave={(text) => save(i.id, { text })} />
                    )}
                    {on && canEdit && (
                      <>
                        <span className="sb-h size" onPointerDown={(e) => drag(e, i, 'size')} aria-hidden="true" />
                        <span className="sb-h rot" onPointerDown={(e) => drag(e, i, 'rot')} aria-hidden="true" />
                      </>
                    )}
                  </div>
                );
              }}
            </SceneView>
          )}
        </div>
        {scene && (
          <textarea
            key={scene.id}
            className="sbf-caption"
            rows={2}
            defaultValue={scene.caption ?? ''}
            readOnly={!canEdit}
            placeholder={canEdit ? 'What happens in this scene (optional)' : ''}
            onBlur={(e) => e.target.value !== (scene.caption ?? '') && void updateDoc(doc(scenesCol(d.id), scene.id), { caption: e.target.value })}
            aria-label="Caption"
          />
        )}
      </section>

      {canEdit && (
        <aside className="sbf-lib" aria-label="Library">
          <span className="sh-switch" role="tablist" aria-label="Library">
            {(['people', 'things', 'bubbles'] as Lib[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={lib === t} className={lib === t ? 'on' : ''} onClick={() => setLib(t)}>
                {t === 'people' ? 'People' : t === 'things' ? 'Things' : 'Bubbles'}
              </button>
            ))}
          </span>
          {lib === 'people' && (
            <>
              <div className="sbf-who" role="radiogroup" aria-label="Who">
                {Object.entries(PEOPLE).map(([k2, p]) => (
                  <button key={k2} type="button" role="radio" aria-checked={who === k2} className={who === k2 ? 'on' : ''} onClick={() => setWho(k2)} aria-label={p.name} data-tip={p.name}>
                    <svg viewBox="40 0 120 118" width="40" height="40" aria-hidden="true">
                      <PersonArt who={k2} p="stand" face="happy" />
                    </svg>
                  </button>
                ))}
              </div>
              <span className="hint">{PEOPLE[who].name}: click a pose to add it</span>
              <div className="sbf-grid">
                {Object.entries(POSES).map(([k2, p]) => (
                  <button key={k2} type="button" className="sbf-li" onClick={() => add('person', who, { pose: k2 })} data-tip={p.name} aria-label={`${PEOPLE[who].name}, ${p.name.toLowerCase()}`}>
                    <svg viewBox="0 0 200 300" width="56" height="84" aria-hidden="true">
                      <Sketch id={'sbl' + who + k2}>
                        <PersonArt who={who} p={k2} face="happy" />
                      </Sketch>
                    </svg>
                  </button>
                ))}
              </div>
            </>
          )}
          {lib === 'things' && (
            <div className="sbf-grid">
              {Object.entries(THINGS).map(([k2, t]) => (
                <button key={k2} type="button" className="sbf-li" onClick={() => add('thing', k2)} data-tip={t.name} aria-label={t.name}>
                  <svg viewBox="0 0 200 200" width="64" height="64" aria-hidden="true">
                    {t.draw()}
                  </svg>
                </button>
              ))}
            </div>
          )}
          {lib === 'bubbles' && (
            <div className="sbf-grid wide">
              {Object.entries(BUBBLES).map(([k2, b]) => (
                <button key={k2} type="button" className="sbf-li" onClick={() => add('bubble', k2)} data-tip={b.name} aria-label={b.name}>
                  <svg viewBox="-6 -6 172 140" width="92" height="76" aria-hidden="true">
                    {b.draw(160, 90)}
                  </svg>
                  <span>{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

// The words in a bubble or label: typed straight into it once it is selected.
function BubbleText({ i, canEdit, onSave }: { i: SbItem; canEdit: boolean; onSave: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.textContent = i.text ?? '';
  }, [i.text]);
  const tail = i.ref === 'caption' || i.ref === 'shout' ? 0 : 26;
  return (
    <div
      ref={ref}
      className={'sb-text r-' + i.ref}
      style={{ bottom: tail }}
      contentEditable={canEdit}
      suppressContentEditableWarning
      role={canEdit ? 'textbox' : undefined}
      aria-label={canEdit ? 'The words' : undefined}
      onPointerDown={(e) => canEdit && e.stopPropagation()}
      onBlur={(e) => (e.currentTarget.textContent ?? '') !== (i.text ?? '') && onSave(e.currentTarget.textContent ?? '')}
    />
  );
}
