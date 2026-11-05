import './InlineImages.css';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { newSharedDoc, useMyDocs, type SharedDoc } from '../lib/sharedDocs';
import { isImageFile } from './files';
import { loadAnyFile } from '../lib/fileStore';
import { useDesign, loadPicture, ensureFont, type DPage, type El } from './model';
import { pageBlob } from './tools';
import { drawPage } from './render';
import { drawnImages, searchPictures, type WebPic } from './assets';

// Designer pictures in a lesson: a page or panel, or a whole story as one strip. The lesson gets
// its own copy of the picture, so changing the design later doesn't change lessons already made.

async function imagesFor(id: string, pages: DPage[], els: El[], accent: string) {
  const imgs = new Map<string, CanvasImageSource>();
  await drawnImages(pages, els, accent, imgs);
  await Promise.all(
    els.map(async (e) => {
      if (e.t === 'image' && e.img) {
        const im = await loadPicture(id, e.img).catch(() => null);
        if (im) imgs.set(e.img, im);
      }
      if (e.font) await ensureFont(e.font).catch(() => {});
    }),
  );
  return imgs;
}
export async function designPageImage(id: string, page: DPage, els: El[], accent: string, scale = 1.6) {
  const mine = els.filter((e) => e.page === page.id);
  const imgs = await imagesFor(id, [page], mine, accent);
  return pageBlob(page, els, { imgs, view: 'all', accent }, scale);
}
// All the panels of a story as one picture: two to a row, each with its caption under it.
export async function storyStripImage(id: string, pages: DPage[], els: El[], accent: string, cols = 2, scale = 0.6) {
  const imgs = await imagesFor(id, pages, els, accent);
  await ensureFont('Fraunces').catch(() => {});
  await ensureFont('Karla').catch(() => {});
  const n = pages.length;
  const c = Math.min(cols, n);
  const rows = Math.ceil(n / c);
  const pw = Math.max(...pages.map((p) => p.w)) * scale;
  const ph = Math.max(...pages.map((p) => p.h)) * scale;
  const gap = 24 * scale;
  const capH = pages.some((p) => p.caption) ? 64 * scale : 0;
  const W = Math.round(c * pw + (c + 1) * gap);
  const H = Math.round(rows * (ph + capH) + (rows + 1) * gap);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * 2);
  canvas.height = Math.round(H * 2);
  const g = canvas.getContext('2d')!;
  g.scale(2, 2);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  pages.forEach((p, i) => {
    const x = gap + (i % c) * (pw + gap);
    const y = gap + Math.floor(i / c) * (ph + capH + gap);
    const s = Math.min(pw / p.w, ph / p.h);
    const ox = x + (pw - p.w * s) / 2;
    g.save();
    g.beginPath();
    g.roundRect(ox, y, p.w * s, p.h * s, 10 * scale);
    g.clip();
    drawPage(g, p, els, { imgs, view: 'all', accent }, s * 2, ox * 2, y * 2);
    g.restore();
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.strokeStyle = '#262420';
    g.lineWidth = 1.6 * scale;
    g.beginPath();
    g.roundRect(ox, y, p.w * s, p.h * s, 10 * scale);
    g.stroke();
    // The panel's number in an accent chip, and its caption.
    g.fillStyle = accent;
    g.beginPath();
    g.roundRect(ox + 10 * scale, y + 10 * scale, 36 * scale, 28 * scale, 8 * scale);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `800 ${16 * scale}px Karla, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(i + 1), ox + 28 * scale, y + 24 * scale + 1);
    if (p.caption) {
      g.fillStyle = '#262420';
      g.font = `${22 * scale}px Fraunces, serif`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(p.caption, ox, y + p.h * s + capH / 2, pw);
    }
  });
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
}

type Pick = (blob: Blob, title: string, credit?: string, designerId?: string) => Promise<void>;
export function DesignerImages({ uid, onPick, onBoard }: { uid?: string; onPick: Pick; onBoard: (d: SharedDoc) => Promise<void> }) {
  const { user } = useAuth();
  const { mine, withMe } = useMyDocs(uid);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<SharedDoc | null>(null);
  const [making, setMaking] = useState('');
  const docs = Array.from(new Map([...(mine ?? []), ...(withMe ?? [])].map((d) => [d.id, d])).values()).filter((d) => d.kind === 'design' || d.kind === 'storyboard' || isImageFile(d));
  const shown = docs.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));
  // A new design opens in Designer in a new tab; when it is saved it appears in this list, ready to insert.
  const make = async (type: 'image' | 'storyboard') => {
    if (!user) return;
    setMaking('Making it…');
    const w = window.open('', '_blank');
    try {
      const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, type === 'storyboard' ? 'storyboard' : 'design', type === 'storyboard' ? 'New storyboard' : 'New design');
      await (await import('./DesignerFile')).startDesigner(id, type);
      if (w) w.location.href = '/doc/' + id;
      else window.open('/doc/' + id, '_blank');
      setMaking('Your new design is open in another tab. When you’ve made it, come back here and insert it.');
    } catch {
      w?.close();
      setMaking('We couldn’t make a new design just now. Check your connection and try again.');
    }
  };
  return (
    <section>
      {!selected && (
        <div className="inline-image-make">
          <button type="button" className="btn" disabled={!user || making === 'Making it…'} onClick={() => void make('storyboard')}>Make a new storyboard</button>
          <button type="button" className="btn" disabled={!user || making === 'Making it…'} onClick={() => void make('image')}>Make a new design</button>
        </div>
      )}
      {making && <p className="hint" role="status">{making}</p>}
      <label>
        Search Designer
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {selected ? (
        <>
          <button type="button" className="btn" onClick={() => setSelected(null)}>Back to designs</button>
          <DesignPages key={selected.id} d={selected} onPick={onPick} onBoard={onBoard} />
        </>
      ) : (
        <div className="inline-image-list">
          {mine === null || withMe === null ? (
            <p role="status">Loading designs…</p>
          ) : (
            shown.map((d) => (
              <button type="button" className="btn" key={d.id} onClick={() => setSelected(d)}>
                {d.title || 'Untitled design'}
                <small>{d.kind === 'storyboard' || d.designType === 'storyboard' ? 'Storyboard' : 'Image design'}</small>
              </button>
            ))
          )}
          {mine !== null && withMe !== null && !shown.length && <p>No matching designs. Saved Designer files appear here automatically.</p>}
        </div>
      )}
    </section>
  );
}

function DesignPages({ d, onPick, onBoard }: { d: SharedDoc; onPick: Pick; onBoard: (d: SharedDoc) => Promise<void> }) {
  const { pages, els, meta } = useDesign(d.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const accent = meta.accent ?? '#c8764a';
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await f();
    } catch {
      setError('We couldn’t add this design. Your lesson is unchanged. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const board = d.kind === 'storyboard' || d.designType === 'storyboard' || meta.type === 'storyboard';
  const canvasStory = board && !!pages?.length;
  useEffect(() => {
    if (!pages?.length) return;
    let on = true;
    const urls: string[] = [];
    const t = setTimeout(() => {
      void Promise.all(
        pages.map((p) =>
          designPageImage(d.id, p, els, accent, 0.25)
            .then((b) => {
              const u = URL.createObjectURL(b);
              urls.push(u);
              return [p.id, u] as const;
            })
            .catch(() => null),
        ),
      ).then((list) => on && setThumbs(Object.fromEntries(list.filter((x): x is readonly [string, string] => !!x))));
    }, 150);
    return () => {
      on = false;
      clearTimeout(t);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [d.id, pages, els, accent]);
  return (
    <div>
      <h3>{d.title}</h3>
      {board && !canvasStory && pages !== null ? (
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => onBoard(d))}>Insert the storyboard</button>
      ) : pages === null ? (
        <p role="status">Loading pages…</p>
      ) : pages.length ? (
        <>
          {canvasStory && pages.length > 1 && (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void run(async () => onPick(await storyStripImage(d.id, pages, els, accent), d.title, '', d.id))}>
              Insert the whole story as a strip
            </button>
          )}
          <div className="inline-image-pages">
            {pages.map((p, i) => (
              <button type="button" className="inline-image-page" key={p.id} disabled={busy} onClick={() => void run(async () => onPick(await designPageImage(d.id, p, els, accent), p.caption || d.title, '', d.id))} aria-label={`Insert ${p.name || `${canvasStory ? 'panel' : 'page'} ${i + 1}`}`}>
                {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" style={{ aspectRatio: `${p.w} / ${p.h}` }} /> : <span className="inline-image-blank" style={{ aspectRatio: `${p.w} / ${p.h}` }} />}
                <span>{p.name || `${canvasStory ? 'Panel' : 'Page'} ${i + 1}`}</span>
                {p.caption && <small>{p.caption}</small>}
              </button>
            ))}
          </div>
        </>
      ) : isImageFile(d) ? (
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => onPick(await loadAnyFile(d.id, d.file), d.title, '', d.id))}>Insert the image</button>
      ) : (
        <p>This design has no pages yet.</p>
      )}
      {busy && <p role="status">Preparing your picture…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function CommonsImages({ onPick }: { onPick: Pick }) {
  const [q, setQ] = useState('');
  const [pics, setPics] = useState<WebPic[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  return (
    <section>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setBusy(true);
          setError('');
          try {
            setPics(await searchPictures(q));
            setSearched(true);
          } catch {
            setError('We couldn’t search Wikimedia just now. Check your connection and try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Search Wikimedia Commons
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example, a street market" />
        </label>
        <button className="btn" disabled={busy}>Search</button>
        {!q.trim() && <p className="hint">Type what you’re looking for.</p>}
      </form>
      {busy && <p role="status">One moment…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="inline-image-list">
        {pics.map((p) => (
          <button
            type="button"
            className="btn"
            key={p.id}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const r = await fetch(p.url);
                if (!r.ok) throw Error();
                await onPick(await r.blob(), p.title, p.credit);
              } catch {
                setError('We couldn’t add this picture. Try another one.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <img src={p.thumb} alt={p.title} loading="lazy" />
            <strong>{p.title}</strong>
            <small>{p.credit}</small>
          </button>
        ))}
      </div>
      {searched && !busy && !pics.length && <p>Nothing found. Try another word.</p>}
    </section>
  );
}
