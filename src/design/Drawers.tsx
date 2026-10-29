import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useArchive } from '../lib/archive';
import { audioUrl } from '../lib/media';
import { tell } from '../lib/ask';
import { FACES, PEOPLE, POSES, THINGS } from '../storyboard/art';
import type { Ctx } from './Editor';
import { ensureFont, SIZES, TEXT_STYLES, blobOf, type El, type ShapeKind } from './model';
import { drawPage, shapePath, textHeight, isLine } from './render';
import { TEMPLATES, type Tpl } from './templates';
import { searchPictures, type WebPic } from './assets';

export type DrawerKey = 'templates' | 'elements' | 'text' | 'pictures' | 'people' | 'teach' | 'draw' | 'layers';

export function Drawer({ k, cx, onClose }: { k: DrawerKey; cx: Ctx; onClose: () => void }) {
  const title = { templates: 'Templates', elements: 'Elements', text: 'Text', pictures: 'Pictures', people: 'People and things', teach: 'Teaching tools', draw: 'Draw', layers: 'Layers' }[k];
  return (
    <div className="dz-dr">
      <div className="dz-dr-head">
        <h2>{title}</h2>
        <button type="button" className="dz-ib" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      </div>
      <div className="dz-dr-body">
        {k === 'templates' && <Templates cx={cx} />}
        {k === 'elements' && <Elements cx={cx} />}
        {k === 'text' && <TextDrawer cx={cx} />}
        {k === 'pictures' && <Pictures cx={cx} />}
        {k === 'people' && <People cx={cx} />}
        {k === 'teach' && <Teach cx={cx} />}
        {k === 'draw' && <Draw cx={cx} />}
        {k === 'layers' && <Layers cx={cx} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ templates

function TplThumb({ t }: { t: Tpl }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const p = { id: 'p', order: 0, ...t.pages[0].p };
    const s = 150 / Math.max(p.w, p.h);
    c.width = Math.round(p.w * s * 2);
    c.height = Math.round(p.h * s * 2);
    const els = t.pages[0].els.map((e, i) => ({ ...e, id: 'e' + i, page: 'p', z: i }) as El);
    const fonts = [...new Set(els.map((e) => e.font).filter(Boolean) as string[])];
    void Promise.all(fonts.map(ensureFont)).then(() => drawPage(c.getContext('2d')!, p, els, { imgs: new Map(), view: 'A', accent: '#c8764a', editing: true }, s * 2));
  }, [t]);
  return <canvas ref={ref} className="dz-tpl-c" aria-hidden="true" />;
}

function Templates({ cx }: { cx: Ctx }) {
  return (
    <>
      <p className="dz-dr-note">Adds the template’s pages after this one.</p>
      <div className="dz-tpls">
        {TEMPLATES.map((t) => (
          <button key={t.k} type="button" className="dz-tpl" onClick={() => void cx.addPages(t)} disabled={!cx.canEdit}>
            <span className="dz-tpl-f">
              <TplThumb t={t} />
            </span>
            <strong>{t.name}</strong>
            <span>{t.about}</span>
          </button>
        ))}
      </div>
      <h3 className="dz-dr-h">Blank pages</h3>
      <div className="dz-sizes">
        {SIZES.map((s) => (
          <button key={s.k} type="button" onClick={() => void cx.addPages({ k: s.k, name: s.name, about: '', pages: [{ p: { w: s.w, h: s.h, bg: '#ffffff' }, els: [] }] })} disabled={!cx.canEdit}>
            <span className="dz-size-sh" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
            <span>
              <strong>{s.name}</strong>
              <em>{s.about}</em>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ elements

function ShapeThumb({ k }: { k: ShapeKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 112;
    c.height = 112;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 112, 112);
    g.translate(16, 16);
    const line = isLine(k) || k === 'tick' || k === 'cross';
    const p = shapePath(k, 80, line && isLine(k) ? 80 : 80, k === 'rect' ? 12 : 0);
    if (!line) {
      g.fillStyle = '#c9c5be';
      g.fill(p);
    } else {
      g.strokeStyle = '#4a4641';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.stroke(p);
      if (k === 'arrow' || k === 'double') {
        g.fillStyle = '#4a4641';
        const head = (x: number, d: number) => (g.beginPath(), g.moveTo(x, 40), g.lineTo(x - d * 18, 29), g.lineTo(x - d * 18, 51), g.closePath(), g.fill());
        head(80, 1);
        if (k === 'double') head(0, -1);
      }
    }
  }, [k]);
  return <canvas ref={ref} width={112} height={112} aria-hidden="true" />;
}

const SHAPES: [ShapeKind, string][] = [['rect', 'Rectangle'], ['ellipse', 'Circle'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['star', 'Star'], ['heart', 'Heart'], ['banner', 'Banner'], ['tick', 'Tick'], ['cross', 'Cross'], ['cloud', 'Cloud']];
const LINES: [ShapeKind, string][] = [['line', 'Line'], ['arrow', 'Arrow'], ['double', 'Two-way arrow']];
const BUBBLES: [ShapeKind, string][] = [['speech', 'Speech bubble'], ['thought', 'Thought bubble'], ['shout', 'Shout'], ['cloud', 'Cloud']];

function middle(cx: Ctx, w: number, h: number) {
  return cx.spot(w, h);
}

function Elements({ cx }: { cx: Ctx }) {
  const shape = (k: ShapeKind) => {
    const line = isLine(k);
    const size = line ? { w: 260, h: 24 } : k === 'speech' || k === 'thought' ? { w: 280, h: 190 } : k === 'banner' ? { w: 360, h: 120 } : { w: 180, h: 180 };
    const bubble = k === 'speech' || k === 'thought' || k === 'shout';
    cx.add(
      [
        {
          t: 'shape',
          shape: k,
          ...middle(cx, size.w, size.h),
          fill: bubble || k === 'cloud' ? '#ffffff' : k === 'tick' || k === 'cross' ? 'none' : cx.accent,
          stroke: bubble || k === 'cloud' ? '#262420' : k === 'tick' ? '#4f7a55' : k === 'cross' ? '#b64a3c' : '#262420',
          sw: line ? 5 : bubble || k === 'cloud' ? 2.5 : k === 'tick' || k === 'cross' ? 14 : 0,
          radius: k === 'rect' ? 16 : 0,
          ...(bubble ? { text: 'Hello!', font: 'Playpen Sans', size: 26, align: 'center', valign: 'middle', color: '#262420' } : {}),
        },
      ],
      { edit: bubble },
    );
  };
  const frame = (kind: 'rect' | 'round' | 'circle' | 'polaroid') => {
    const w = kind === 'circle' ? 260 : 340;
    const h = kind === 'circle' ? 260 : kind === 'polaroid' ? 300 : 240;
    cx.add([{ t: 'image', ...middle(cx, w, h), radius: kind === 'circle' ? 999 : kind === 'round' ? 22 : 0, border: kind === 'polaroid' ? 14 : 0, borderC: '#ffffff', shadow: kind === 'polaroid' }]);
  };
  return (
    <>
      <h3 className="dz-dr-h">Picture frames</h3>
      <p className="dz-dr-note">Drop a picture on a frame, or select the frame and add one.</p>
      <div className="dz-grid four">
        {(['rect', 'round', 'circle', 'polaroid'] as const).map((k) => (
          <button key={k} type="button" className="dz-tile" onClick={() => frame(k)} aria-label={{ rect: 'Square frame', round: 'Rounded frame', circle: 'Round frame', polaroid: 'Photo with a border' }[k]}>
            <span className={'dz-frame-ic ' + k} />
          </button>
        ))}
      </div>
      <h3 className="dz-dr-h">Speech bubbles</h3>
      <div className="dz-grid four">
        {BUBBLES.map(([k, n]) => (
          <button key={k} type="button" className="dz-tile" onClick={() => shape(k)} aria-label={n} data-tip={n}>
            <ShapeThumb k={k} />
          </button>
        ))}
      </div>
      <h3 className="dz-dr-h">Shapes</h3>
      <div className="dz-grid four">
        {SHAPES.map(([k, n]) => (
          <button key={k} type="button" className="dz-tile" onClick={() => shape(k)} aria-label={n} data-tip={n}>
            <ShapeThumb k={k} />
          </button>
        ))}
      </div>
      <h3 className="dz-dr-h">Lines and arrows</h3>
      <div className="dz-grid four">
        {LINES.map(([k, n]) => (
          <button key={k} type="button" className="dz-tile" onClick={() => shape(k)} aria-label={n} data-tip={n}>
            <ShapeThumb k={k} />
          </button>
        ))}
      </div>
      <h3 className="dz-dr-h">For worksheets</h3>
      <div className="dz-list">
        <button type="button" onClick={() => cx.add([{ t: 'lines', ...middle(cx, Math.min(654, cx.page.w - 140), 140), gap: 28 }])}>
          <strong>Writing lines</strong>
          <span>7.4 mm apart, as on printed worksheets</span>
        </button>
        <button type="button" onClick={() => cx.add([{ t: 'shape', shape: 'rect', ...middle(cx, 220, 44), fill: '#ffffff', stroke: '#d6d3cd', sw: 1.5, radius: 8, text: 'Name', font: 'Karla', size: 12, color: '#66615b' }])}>
          <strong>A name box</strong>
          <span>For learners to write their name</span>
        </button>
        <button type="button" onClick={() => cx.add([{ t: 'shape', shape: 'ellipse', ...middle(cx, 48, 48), fill: cx.accent, text: '1', font: 'Karla', size: 22, bold: true, color: '#ffffff', align: 'center', valign: 'middle' }])}>
          <strong>A number</strong>
          <span>For exercises and steps</span>
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ text

const IPA = ['iː', 'ɪ', 'e', 'æ', 'ɑː', 'ɒ', 'ɔː', 'ʊ', 'uː', 'ʌ', 'ɜː', 'ə', 'eɪ', 'aɪ', 'ɔɪ', 'əʊ', 'aʊ', 'ɪə', 'eə', 'ʊə', 'p', 'b', 't', 'd', 'k', 'g', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'tʃ', 'dʒ', 'm', 'n', 'ŋ', 'h', 'l', 'r', 'w', 'j', 'ˈ', 'ˌ', '/', '.'];

function TextDrawer({ cx }: { cx: Ctx }) {
  useEffect(() => void TEXT_STYLES.forEach((s) => s.el.font && void ensureFont(s.el.font)), []);
  const addText = (el: Partial<El>) => {
    const w = Math.min(cx.page.w - 120, el.size && el.size > 40 ? 620 : 460);
    const e = { t: 'text' as const, color: '#262420', lh: 1.4, align: 'left' as const, ...el };
    const h = textHeight(e, w);
    cx.add([{ ...e, ...middle(cx, w, h) }], { edit: true });
  };
  const one = cx.sel.length === 1 && ['text', 'shape', 'label'].includes(cx.sel[0].t) ? cx.sel[0] : null;
  const sym = (s: string) => {
    if (one) {
      const text = (one.text ?? '') + s;
      cx.patch({ [one.id]: { text, ...(one.t === 'text' ? { h: textHeight({ ...one, text }, one.w) } : {}) } }, 'ipa');
    } else addText({ text: '/' + s + '/', font: 'Noto Sans', size: 40 });
  };
  return (
    <>
      <div className="dz-textstyles">
        {TEXT_STYLES.map((s) => (
          <button key={s.k} type="button" onClick={() => addText(s.el)} style={{ fontFamily: `"${s.el.font}"`, fontWeight: s.el.bold ? 700 : 400, fontSize: Math.min(30, Math.max(14, (s.el.size ?? 20) * 0.5)), letterSpacing: s.el.ls ? s.el.ls / 2 : undefined, color: s.el.color, textTransform: s.el.upper ? 'uppercase' : undefined }}>
            {s.name}
          </button>
        ))}
      </div>
      <h3 className="dz-dr-h">Phonemic symbols</h3>
      <p className="dz-dr-note">{one ? 'Adds the symbol to the end of the selected text.' : 'Adds the symbol as new text. Select some text first to add to it.'}</p>
      <div className="dz-ipa">
        {IPA.map((s) => (
          <button key={s} type="button" onClick={() => sym(s)}>
            {s}
          </button>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ pictures

function Pictures({ cx }: { cx: Ctx }) {
  const { user } = useAuth();
  const archive = useArchive(user?.uid);
  const pics = useMemo(() => (archive ?? []).filter((a) => a.kind === 'image' && (a.home || a.link)).slice(0, 60), [archive]);
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'mine' | 'web'>('mine');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | 'illustration' | 'photograph'>('');
  const [found, setFound] = useState<WebPic[] | null>(null);
  const [busy, setBusy] = useState('');
  const [credit, setCredit] = useState(true);
  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy('Searching…');
    try {
      setFound(await searchPictures(q.trim(), 1, kind));
    } catch {
      setFound([]);
      void tell('We couldn’t search for pictures just now. Check your connection and try again.');
    } finally {
      setBusy('');
    }
  };
  const fromWeb = async (p: WebPic) => {
    setBusy('Adding the picture…');
    try {
      const blob = await blobOf(p.url).catch(() => blobOf(p.thumb));
      await cx.addPicture(blob, { credit: p.credit, name: p.title || q });
      if (credit) {
        const size = 11;
        cx.add([{ t: 'text', text: p.credit, font: 'Karla', size, color: '#66615b', lh: 1.3, x: 40, y: cx.page.h - 40, w: cx.page.w - 80, h: textHeight({ text: p.credit, font: 'Karla', size, lh: 1.3 }, cx.page.w - 80), name: 'Picture credit' }], { select: false });
      }
    } catch {
      void tell('We couldn’t add that picture. Try another one.');
    } finally {
      setBusy('');
    }
  };
  const fromFiles = async (a: (typeof pics)[number]) => {
    setBusy('Adding the picture…');
    try {
      const src = a.home ? await audioUrl(a.home.classId, a.home.mediaId) : a.link!;
      await cx.addPicture(await blobOf(src), { name: a.name });
    } catch {
      void tell('We couldn’t add that picture. Try another one.');
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <button type="button" className="btn primary dz-wide" onClick={() => input.current?.click()} disabled={!cx.canEdit}>
        Upload pictures
      </button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => (void (async () => { for (const f of Array.from(e.target.files ?? [])) await cx.addPicture(f, { name: f.name.replace(/\.[a-z0-9]+$/i, '') }); })(), (e.target.value = ''))} />
      <p className="dz-dr-note">You can also drag pictures onto the page, or paste one.</p>
      <div className="dz-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          Your files
        </button>
        <button type="button" role="tab" aria-selected={tab === 'web'} className={tab === 'web' ? 'on' : ''} onClick={() => setTab('web')}>
          Free pictures
        </button>
      </div>
      {busy && <p className="dz-dr-note" role="status">{busy}</p>}
      {tab === 'mine' ? (
        archive === null ? (
          <p className="dz-dr-note">One moment…</p>
        ) : pics.length ? (
          <div className="dz-pics">
            {pics.map((a) => (
              <button key={a.id} type="button" onClick={() => void fromFiles(a)} aria-label={a.name} data-tip={a.name}>
                <img src={a.thumb || a.link} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <p className="dz-dr-note">No pictures in your files yet. Pictures you upload anywhere in ELT Suite appear here.</p>
        )
      ) : (
        <>
          <form className="dz-search" onSubmit={(e) => void search(e)}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="A cat, a kitchen, a train station…" aria-label="Search for pictures" />
            <button type="submit" className="btn">Search</button>
          </form>
          <div className="dz-chips">
            {([['', 'All'], ['photograph', 'Photos'], ['illustration', 'Drawings']] as const).map(([k, n]) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => (setKind(k), found && setTimeout(() => void search(), 0))}>
                {n}
              </button>
            ))}
          </div>
          <label className="dz-checkrow">
            <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} /> Add who made it to the page
          </label>
          {found && !found.length && <p className="dz-dr-note">Nothing found. Try another word.</p>}
          {found && (
            <div className="dz-pics web">
              {found.map((p) => (
                <button key={p.id} type="button" onClick={() => void fromWeb(p)} aria-label={p.title} data-tip={p.credit}>
                  <img src={p.thumb} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <p className="dz-dr-note small">Openly licensed pictures from Wikimedia Commons. Check each licence before you share your design outside class.</p>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ people and things

function People({ cx }: { cx: Ctx }) {
  const [who, setWho] = useState('maya');
  const [pose, setPose] = useState('stand');
  const [face, setFace] = useState('happy');
  const groups = useMemo(() => {
    const m = new Map<string, [string, string][]>();
    for (const [k, t] of Object.entries(THINGS)) m.set(t.group, [...(m.get(t.group) ?? []), [k, t.name]]);
    return [...m.entries()];
  }, []);
  return (
    <>
      <p className="dz-dr-note">The same people as in Storyboards, in your accent colour.</p>
      <div className="dz-chips wrap">
        {Object.entries(PEOPLE).map(([k, p]) => (
          <button key={k} type="button" className={who === k ? 'on' : ''} onClick={() => setWho(k)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="dz-two">
        <label>
          <span>Pose</span>
          <select value={pose} onChange={(e) => setPose(e.target.value)}>
            {Object.entries(POSES).map(([k, p]) => (
              <option key={k} value={k}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Face</span>
          <select value={face} onChange={(e) => setFace(e.target.value)}>
            {Object.entries(FACES).map(([k, f]) => (
              <option key={k} value={k}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="btn primary dz-wide" onClick={() => cx.add([{ t: 'art', art: 'person', ref: who, pose, face, ...middle(cx, 160, 240), name: PEOPLE[who]?.name }])}>
        Add {PEOPLE[who]?.name}
      </button>
      {groups.map(([g, list]) => (
        <div key={g}>
          <h3 className="dz-dr-h">{g}</h3>
          <div className="dz-grid four">
            {list.map(([k, n]) => (
              <ThingTile key={k} k={k} n={n} accent={cx.accent} onAdd={() => cx.add([{ t: 'art', art: 'thing', ref: k, ...middle(cx, 180, 180), name: n }])} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
function ThingTile({ k, n, accent, onAdd }: { k: string; n: string; accent: string; onAdd: () => void }) {
  return (
    <button type="button" className="dz-tile" onClick={onAdd} aria-label={n} data-tip={n}>
      <svg viewBox="0 0 200 200" width="56" height="56" style={{ ['--sb-accent' as string]: accent }} aria-hidden="true">
        {(THINGS[k] ?? THINGS.table).draw()}
      </svg>
    </button>
  );
}

// ------------------------------------------------------------------ teaching tools

function Teach({ cx }: { cx: Ctx }) {
  const one = cx.sel.length === 1 ? cx.sel[0] : null;
  const pic = one?.t === 'image' && one.img ? one : null;
  const cover = (mode: El['mode']) => {
    const b = one && one.t !== 'label' ? { x: one.x + one.w * 0.3, y: one.y + one.h * 0.3, w: one.w * 0.4, h: one.h * 0.4 } : middle(cx, 200, 140);
    cx.add([{ t: 'cover', mode, ...b, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), radius: 10, name: { blur: 'Blur', pixel: 'Pixels', solid: 'Cover', mystery: 'Mystery card' }[mode ?? 'blur'] }]);
  };
  const setVer = (v: El['ver']) => {
    const p: Record<string, Partial<El>> = {};
    for (const e of cx.sel) p[e.id] = { ver: v };
    cx.patch(p);
  };
  return (
    <div className="dz-teach">
      <section>
        <h3>Label a picture</h3>
        <p>Click on the picture where each label should point. Each label gets a number, and the words go in a word bank.</p>
        <div className="dz-row">
          <button type="button" className={'btn' + (cx.tool === 'label' ? ' primary' : '')} onClick={() => cx.setTool(cx.tool === 'label' ? 'select' : 'label')}>
            {cx.tool === 'label' ? 'Stop adding labels' : 'Add labels'}
          </button>
          <button type="button" className="btn" onClick={() => cx.add([{ t: 'wordbank', ...middle(cx, Math.min(654, cx.page.w - 100), 110), title: 'Word bank', size: 18 }])}>
            Add a word bank
          </button>
        </div>
        <p className="hint">Tick “Learners’ copy” at the top to see the labels as lines to write on.</p>
      </section>
      <section>
        <h3>Hide part of a picture</h3>
        <p>For faces you shouldn’t share, a “What’s this?” guess, or a gap to talk about.</p>
        <div className="dz-grid two">
          <button type="button" className="dz-tool" onClick={() => cover('blur')}><span className="dz-ti blur" />Blur</button>
          <button type="button" className="dz-tool" onClick={() => cover('pixel')}><span className="dz-ti pixel" />Pixels</button>
          <button type="button" className="dz-tool" onClick={() => cover('solid')}><span className="dz-ti solid" />Cover</button>
          <button type="button" className="dz-tool" onClick={() => cover('mystery')}><span className="dz-ti mystery" style={{ background: cx.accent }}>?</span>Mystery card</button>
        </div>
      </section>
      <section>
        <h3>Learner A and learner B</h3>
        <p>For information gaps and pairwork: some things only learner A sees, some only learner B. Download each learner’s copy.</p>
        <div className="dz-seg wide">
          <button type="button" disabled={!cx.sel.length} className={cx.sel.length && cx.sel.every((e) => !e.ver) ? 'on' : ''} onClick={() => setVer(undefined)}>Both</button>
          <button type="button" disabled={!cx.sel.length} className={cx.sel.length && cx.sel.every((e) => e.ver === 'A') ? 'on' : ''} onClick={() => setVer('A')}>Only A</button>
          <button type="button" disabled={!cx.sel.length} className={cx.sel.length && cx.sel.every((e) => e.ver === 'B') ? 'on' : ''} onClick={() => setVer('B')}>Only B</button>
        </div>
        <p className="hint">{cx.sel.length ? `For the ${cx.sel.length === 1 ? 'thing' : `${cx.sel.length} things`} you’ve selected.` : 'Select something on the page first.'}</p>
      </section>
      <section>
        <h3>Pictures for the classroom</h3>
        <div className="dz-list">
          <button type="button" disabled={!pic} onClick={() => pic && cx.patch({ [pic.id]: { fx: { gray: 100, contrast: 25, bright: 8 } } })}>
            <strong>Make it print well</strong>
            <span>Black and white with more contrast, for the photocopier</span>
          </button>
          <button type="button" disabled={!pic} onClick={() => cx.setTool(cx.tool === 'magic' ? 'select' : 'magic')}>
            <strong>{cx.tool === 'magic' ? 'Stop taking away the background' : 'Take away the background'}</strong>
            <span>Click a plain background to make it see-through</span>
          </button>
          <button type="button" onClick={() => cx.add([{ t: 'qr', ...middle(cx, 150, 176), url: '', text: 'Listen', name: 'QR code' }], { edit: true })}>
            <strong>A QR code</strong>
            <span>To a recording, a video or a web page, for learners’ phones</span>
          </button>
        </div>
        {!pic && <p className="hint">Select a picture to use the first two.</p>}
      </section>
      <section>
        <h3>Cut-outs and jigsaws</h3>
        <p>Download from the top right: “Cut into cards” cuts each page into equal pieces, with lines to cut along. Shuffle them for a jigsaw or a picture story.</p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ drawing

function Draw({ cx }: { cx: Ctx }) {
  const tools: [Ctx['tool'], string][] = [['pen', 'Pen'], ['marker', 'Marker'], ['highlighter', 'Highlighter'], ['eraser', 'Rubber']];
  return (
    <>
      <div className="dz-grid two">
        {tools.map(([k, n]) => (
          <button key={k} type="button" className={'dz-tool' + (cx.tool === k ? ' on' : '')} onClick={() => (cx.setTool(k), k === 'highlighter' ? cx.setPen({ color: '#ffd84d', size: 26 }) : k === 'marker' ? cx.setPen({ color: cx.accent, size: 14 }) : k === 'pen' && cx.pen.size > 12 && cx.setPen({ color: '#262420', size: 6 }))}>
            <span className={'dz-pen ' + k} style={{ ['--pc' as string]: cx.pen.color }} />
            {n}
          </button>
        ))}
      </div>
      <h3 className="dz-dr-h">Colour</h3>
      <div className="dz-sw">
        {['#262420', '#ffffff', cx.accent, '#b64a3c', '#d9a23a', '#ffd84d', '#4f7a55', '#3667a6', '#8b3d6b', '#a9a49d'].map((c) => (
          <button key={c} type="button" className={cx.pen.color === c ? 'on' : ''} style={{ background: c }} onClick={() => cx.setPen({ ...cx.pen, color: c })} aria-label={c} />
        ))}
        <input type="color" value={cx.pen.color} onChange={(e) => cx.setPen({ ...cx.pen, color: e.target.value })} aria-label="Another colour" />
      </div>
      <h3 className="dz-dr-h">Size</h3>
      <input type="range" min={1} max={60} value={cx.pen.size} onChange={(e) => cx.setPen({ ...cx.pen, size: Number(e.target.value) })} aria-label="Size" className="dz-range" />
      <p className="dz-dr-note">With a pen or stylus, the line follows how hard you press. Each line you draw can be moved and sized like anything else.</p>
    </>
  );
}

// ------------------------------------------------------------------ layers

const NAME: Record<string, string> = { image: 'Picture', text: 'Text', shape: 'Shape', path: 'Drawing', art: 'Person or thing', label: 'Label', cover: 'Cover', wordbank: 'Word bank', qr: 'QR code', lines: 'Writing lines' };
const SHAPE_NAME = Object.fromEntries([...SHAPES, ...LINES, ...BUBBLES]);
export const nameOf = (e: El) => e.name || (e.t === 'shape' && !e.text ? SHAPE_NAME[e.shape ?? 'rect'] ?? 'Shape' : e.t === 'art' ? e.ref ?? 'Person or thing' : e.t === 'text' || e.t === 'label' || (e.t === 'shape' && e.text) ? (e.text ?? '').split('\n')[0].slice(0, 40) || NAME[e.t] : e.t === 'image' && !e.img ? 'Empty frame' : NAME[e.t]);

function LayerIcon({ t }: { t: El['t'] }) {
  const d: Record<string, string> = {
    image: 'M4 5.5h16v13H4zM4 16l5-5 4 4 2.5-2.5L20 17',
    text: 'M6 6V5h12v1M12 5v14M9.5 19h5',
    shape: 'M4 4h8v8H4zM17 12a4 4 0 1 1 0 .01',
    path: 'M4 17c3-6 5 2 8-4s5 1 8-3',
    art: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 21v-5a5 5 0 0 1 10 0v5',
    label: 'M5 19l5-5M10 14h9v-5h-9z',
    cover: 'M4 4h16v16H4zM4 12h16M12 4v16',
    wordbank: 'M3 8h7v5H3zM12 8h9v5h-9zM6 16h10',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z',
    lines: 'M4 8h16M4 12h16M4 16h16',
  };
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d[t] ?? d.shape} /></svg>;
}

function Layers({ cx }: { cx: Ctx }) {
  const list = [...cx.here].reverse();
  const [renaming, setRenaming] = useState('');
  const [dragId, setDragId] = useState('');
  const move = (from: string, to: string) => {
    const order = [...cx.here];
    const a = order.findIndex((e) => e.id === from);
    const b = order.findIndex((e) => e.id === to);
    if (a < 0 || b < 0 || a === b) return;
    const [x] = order.splice(a, 1);
    order.splice(b, 0, x);
    const p: Record<string, Partial<El>> = {};
    order.forEach((e, i) => e.z !== i + 1 && (p[e.id] = { z: i + 1 }));
    cx.patch(p);
  };
  if (!list.length) return <p className="dz-dr-note">Nothing on this page yet. Things you add appear here, the top one first.</p>;
  return (
    <ul className="dz-layers">
      {list.map((e) => (
        <li
          key={e.id}
          className={(cx.sel.some((s) => s.id === e.id) ? 'on' : '') + (e.hidden ? ' off' : '') + (dragId === e.id ? ' dragging' : '')}
          draggable={cx.canEdit}
          onDragStart={() => setDragId(e.id)}
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={() => (move(dragId, e.id), setDragId(''))}
          onDragEnd={() => setDragId('')}
        >
          <span className="dz-grip" aria-hidden="true">⋮⋮</span>
          {renaming === e.id ? (
            <input autoFocus onFocus={(ev) => ev.target.select()} defaultValue={nameOf(e)} onBlur={(ev) => (cx.patch({ [e.id]: { name: ev.target.value.trim() || undefined } }), setRenaming(''))} onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} aria-label="Name" />
          ) : (
            <button type="button" className="dz-lname" onClick={(ev) => cx.select(ev.shiftKey ? [...cx.sel.map((s) => s.id), e.id] : [e.id])} onDoubleClick={() => setRenaming(e.id)}>
              <span className={'dz-lk t-' + e.t} aria-hidden="true"><LayerIcon t={e.t} /></span>
              {nameOf(e)}
              {e.ver && <em className="dz-ver">{e.ver}</em>}
            </button>
          )}
          <button type="button" className="dz-ib sm" onClick={() => cx.patch({ [e.id]: { hidden: !e.hidden } })} aria-label={e.hidden ? 'Show' : 'Hide'} data-tip={e.hidden ? 'Show' : 'Hide'}>
            {e.hidden ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 6.6C4.4 8.1 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.4-1.2" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.6" /></svg>
            )}
          </button>
          <button type="button" className={'dz-ib sm' + (e.locked ? ' on' : '')} onClick={() => cx.patch({ [e.id]: { locked: !e.locked } })} aria-label={e.locked ? 'Unlock' : 'Lock'} data-tip={e.locked ? 'Unlock' : 'Lock'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="11" width="14" height="9" rx="2" />{e.locked ? <path d="M8 11V8a4 4 0 0 1 8 0v3" /> : <path d="M8 11V8a4 4 0 0 1 7.5-2" />}</svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
