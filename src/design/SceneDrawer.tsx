import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useAuth } from '../lib/auth';
import { tell } from '../lib/ask';
import { sceneBox } from '../storyboard/scenes';
import { artImage, sceneImage } from './assets';
import { assetBlob } from '../video/library';
import type { VideoAsset } from '../video/model';
import { CharacterLibrary, CharacterPortrait, useCharacters } from './Characters';
import type { Ctx } from './Editor';
import type { El } from './model';
import { startDrag, type Payload } from './dnd';
import { GROUPS, elFor, itemId, search, useLibraryMemory, type Item } from './library';
import { bubbleFor } from './scene';

// The Scene drawer: backdrops, people, saved characters and things, all draggable onto the page
// (or added with a click). Search finds them by name or what they are for; favourites and the
// things used last are at the top.

type Filter = 'all' | 'fav' | 'recent' | string;

export function SceneDrawer({ cx }: { cx: Ctx }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { fav, recent, toggleFav, used } = useLibraryMemory();
  const found = useMemo(() => search(q), [q]);
  const list = useMemo(() => {
    if (filter === 'fav') return found.filter((it) => fav.includes(itemId(it)));
    if (filter === 'recent') return recent.map((id) => found.find((it) => itemId(it) === id)).filter((x): x is Item => !!x);
    if (filter === 'all') return found;
    return found.filter((it) => it.group === filter);
  }, [found, filter, fav, recent]);
  const scenes = list.filter((it) => it.kind === 'scene');
  const people = list.filter((it) => it.kind === 'person');
  const things = list.filter((it) => it.kind === 'thing');
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of things) m.set(it.group, [...(m.get(it.group) ?? []), it]);
    return [...m.entries()];
  }, [things]);
  const searching = !!q.trim() || filter !== 'all';

  const addItem = (it: Item) => {
    used(itemId(it));
    if (it.kind === 'scene') return cx.setScene(it.key);
    const el = elFor(it);
    if (el) cx.place(el);
  };
  const payloadFor = (it: Item): Payload | null => {
    if (it.kind === 'scene') return { kind: 'scene', key: it.key, name: it.name };
    const el = elFor(it);
    return el ? { kind: 'el', el, name: it.name } : null;
  };
  const onDrag = (e: DragEvent, it: Item) => {
    const p = payloadFor(it);
    if (!p) return e.preventDefault();
    used(itemId(it));
    startDrag(e, p, (e.currentTarget as HTMLElement).querySelector('svg, img'));
  };
  const tile = (it: Item) => {
    const id = itemId(it);
    const isFav = fav.includes(id);
    return (
      <div key={id} className={'dz-tile-wrap' + (it.kind === 'scene' ? ' wide' : '')}>
        <button type="button" className={'dz-tile' + (it.kind === 'scene' ? ' scene' : '')} draggable={cx.canEdit} onDragStart={(e) => onDrag(e, it)} onClick={() => addItem(it)} aria-label={it.kind === 'scene' ? `Backdrop: ${it.name}` : it.name} data-tip={it.kind === 'scene' ? `${it.name} · click or drag to use as the backdrop` : `${it.name} · click or drag onto the page`}>
          <Thumb it={it} accent={cx.accent} />
        </button>
        <button type="button" className={'dz-fav' + (isFav ? ' on' : '')} aria-label={isFav ? `Take ${it.name} out of favourites` : `Add ${it.name} to favourites`} aria-pressed={isFav} onClick={() => toggleFav(id)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z" /></svg>
        </button>
        <span className="dz-tile-n">{it.name}</span>
      </div>
    );
  };

  return (
    <>
      <p className="dz-dr-note">{cx.mode === 'storyboard' ? 'Drag a backdrop, people and things into the panel. Where you drop someone is where they stand: nearer the bottom is nearer to you.' : 'Drag people, things and backdrops onto the page, or click to add them in the middle.'}</p>
      <form className="dz-search" onSubmit={(e) => e.preventDefault()}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Teacher, café, bus, happy…" aria-label="Search people, things and backdrops" />
      </form>
      <div className="dz-chips scroll" role="tablist" aria-label="Show">
        {([['all', 'All'], ['fav', `Favourites${fav.length ? ` · ${fav.length}` : ''}`], ['recent', 'Recent']] as const).map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {n}
          </button>
        ))}
        {GROUPS.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={filter === g} className={filter === g ? 'on' : ''} onClick={() => setFilter(filter === g ? 'all' : g)}>
            {g}
          </button>
        ))}
      </div>
      {!list.length && <p className="dz-dr-note">{filter === 'fav' ? 'No favourites yet. Press the star on anything to keep it here.' : filter === 'recent' ? 'Nothing used yet. Things you add appear here.' : 'Nothing found. Try another word, like “table” or “street”.'}</p>}
      {(!searching || scenes.length > 0) && (
        <>
          <h3 className="dz-dr-h">Backdrops</h3>
          <div className="dz-grid two">
            {(!searching ? [{ kind: 'scene', key: 'plain', name: 'No backdrop', group: 'Inside', tags: [] } as Item, ...scenes] : scenes).map(tile)}
          </div>
        </>
      )}
      {(!searching || people.length > 0) && (
        <>
          <h3 className="dz-dr-h">People</h3>
          <div className="dz-grid four">{people.map(tile)}</div>
        </>
      )}
      {!searching && <Cast cx={cx} />}
      {groups.map(([g, items]) => (
        <div key={g}>
          <h3 className="dz-dr-h">{g}</h3>
          <div className="dz-grid four">{items.map(tile)}</div>
        </div>
      ))}
      {!searching && <Bubbles cx={cx} />}
    </>
  );
}

// Tiles are the same cached pictures the canvas draws (assets.ts), not live SVG: a hundred filtered
// drawings in one drawer would otherwise make the whole editor slow to respond.
const thumbs = new Map<string, string>();
function Thumb({ it, accent }: { it: Item; accent: string }) {
  const key = `${it.kind}:${it.key}:${accent}`;
  const [src, setSrc] = useState(thumbs.get(key) ?? '');
  useEffect(() => {
    if (thumbs.has(key)) return void setSrc(thumbs.get(key)!);
    let on = true;
    const p = it.kind === 'scene' ? sceneImage(it.key, accent) : artImage({ id: 't', page: 't', z: 0, x: 0, y: 0, w: 0, h: 0, t: 'art', art: it.kind, ref: it.key, ...(it.kind === 'person' ? { pose: 'stand', face: 'happy' } : {}) }, accent);
    p.then((img) => {
      // Rasterised small, once: a drawer of a hundred live drawings would slow the whole editor.
      const w = it.kind === 'scene' ? 320 : it.kind === 'person' ? 88 : 104;
      const h = it.kind === 'scene' ? 180 : it.kind === 'person' ? 132 : 104;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const url = c.toDataURL('image/png');
      thumbs.set(key, url);
      if (on) setSrc(url);
    }).catch(() => on && setSrc(''));
    return () => void (on = false);
  }, [it.kind, it.key, accent, key]);
  if (it.kind === 'scene') return src ? <img src={src} alt="" draggable={false} style={{ width: '100%', aspectRatio: `${sceneBox.w} / ${sceneBox.h}`, display: 'block', background: '#fff' }} /> : <span className="dz-tile-blank" style={{ aspectRatio: `${sceneBox.w} / ${sceneBox.h}` }} />;
  if (it.kind === 'person') return src ? <img src={src} alt="" draggable={false} width={44} height={66} /> : <span className="dz-tile-blank" style={{ width: 44, height: 66 }} />;
  return src ? <img src={src} alt="" draggable={false} width={52} height={52} /> : <span className="dz-tile-blank" style={{ width: 52, height: 52 }} />;
}

// Saved characters: dragged on as their reference picture; their views, poses and expressions
// are changed on the page.
function Cast({ cx }: { cx: Ctx }) {
  const { user } = useAuth();
  const { items, error } = useCharacters();
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  // `items` is a new array on every render; only a change in which characters there are matters.
  const ids = items.map((a) => a.id).join(',');
  useEffect(() => {
    let on = true;
    const made: string[] = [];
    void Promise.all(
      ids.split(',').filter(Boolean).map((id) =>
        assetBlob(id)
          .then((b) => {
            const u = URL.createObjectURL(b);
            made.push(u);
            return [id, u] as const;
          })
          .catch(() => null),
      ),
    ).then((list) => on && setUrls(Object.fromEntries(list.filter((x): x is readonly [string, string] => !!x))));
    return () => {
      on = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ids]);
  const add = async (a: VideoAsset) => {
    try {
      const blob = urls[a.id] ? await fetch(urls[a.id]).then((r) => r.blob()) : await assetBlob(a.id);
      await cx.addPicture(blob, { name: a.name, throwOnError: true, el: { char: a.id, variant: 'ref', ground: true } });
    } catch (error) {
      console.error('Designer: adding a character failed', error);
      void tell('We couldn’t add that character. Check your connection and try again.');
    }
  };
  if (!user) return null;
  return (
    <>
      <h3 className="dz-dr-h">Your characters</h3>
      {error && <p className="dz-dr-note">We couldn’t open your characters just now.</p>}
      {items.length ? (
        <div className="dz-grid four">
          {items.map((a) => (
            <div key={a.id} className="dz-tile-wrap">
              <button type="button" className="dz-tile char" draggable={cx.canEdit && !!urls[a.id]} onDragStart={(e) => (urls[a.id] ? startDrag(e, { kind: 'char', id: a.id, name: a.name, src: urls[a.id] }, e.currentTarget.querySelector('img')) : e.preventDefault())} onClick={() => void add(a)} aria-label={a.name} data-tip={`${a.name} · click or drag onto the page`}>
                {urls[a.id] ? <img src={urls[a.id]} alt="" /> : <CharacterPortrait asset={a} />}
              </button>
              <span className="dz-tile-n">{a.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="dz-dr-note">No characters yet. Save one with a reference picture and it appears here, ready to drag into every scene.</p>
      )}
      <button type="button" className="btn dz-wide" onClick={() => setOpen(true)}>
        {items.length ? 'Add or edit characters' : 'Make a character'}
      </button>
      {open && <CharacterLibrary onClose={() => setOpen(false)} />}
    </>
  );
}

function Bubbles({ cx }: { cx: Ctx }) {
  const one = cx.sel.length === 1 ? cx.sel[0] : null;
  const who = one && ((one.t === 'art' && one.art === 'person') || one.char) ? one : null;
  const add = (kind: 'speech' | 'thought' | 'caption') => {
    if (kind === 'caption') {
      const h = Math.round(cx.page.h * 0.11);
      return cx.add([{ t: 'shape', shape: 'rect', x: Math.round(cx.page.w * 0.04), y: cx.page.h - h - Math.round(cx.page.h * 0.03), w: Math.round(cx.page.w * 0.92), h, fill: '#ffffff', stroke: '#262420', sw: 2, radius: 8, text: 'One morning…', font: 'Fraunces', size: Math.round(cx.page.h * 0.036), align: 'left', valign: 'middle', color: '#262420', name: 'Caption' }], { edit: true });
    }
    if (who) return cx.speak(who, kind);
    const fake: El = { id: '', page: cx.page.id, t: 'art', z: 0, x: cx.page.w * 0.35, y: cx.page.h * 0.4, w: cx.page.w * 0.12, h: cx.page.h * 0.45 };
    const b = bubbleFor(fake, cx.page, kind === 'thought' ? 'Hmm…' : 'Hello.');
    cx.add([{ ...b, shape: kind, name: kind === 'thought' ? 'Thought bubble' : 'Speech bubble' }], { edit: true });
  };
  return (
    <>
      <h3 className="dz-dr-h">Words</h3>
      <p className="dz-dr-note">{who ? `Bubbles go beside ${who.name ?? 'the person'} you’ve selected.` : 'Select someone first and their bubble goes beside their head.'}</p>
      <div className="dz-grid three">
        <button type="button" className="dz-tile words" onClick={() => add('speech')} aria-label="Speech bubble"><span>Speech</span></button>
        <button type="button" className="dz-tile words" onClick={() => add('thought')} aria-label="Thought bubble"><span>Thought</span></button>
        <button type="button" className="dz-tile words" onClick={() => add('caption')} aria-label="Add a caption box"><span>Caption</span></button>
      </div>
    </>
  );
}
