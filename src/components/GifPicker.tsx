import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSuper } from '../lib/admin';
import { saveImage } from '../lib/media';
import { useDismiss } from '../lib/useDismiss';

// GIFs for messages: search Tenor (Google's GIF library, with its strictest safe-search, as
// learners use it too), or send a GIF from your device. Tenor needs a free key, which a super
// admin pastes in once (admin/gif); it is a public key, like the app's other client ids.

type Gif = { id: string; alt: string; full: string; tiny: string; w: number; h: number };
let keyAsked: Promise<string> | null = null;
const tenorKey = () => (keyAsked ??= getDoc(doc(db, 'admin', 'gif')).then((d) => String(d.data()?.tenorKey ?? '').trim(), () => ''));

async function search(key: string, q: string): Promise<Gif[]> {
  const base = 'https://tenor.googleapis.com/v2/' + (q.trim() ? 'search' : 'featured');
  const u = new URL(base);
  u.searchParams.set('key', key);
  u.searchParams.set('client_key', 'eltsuite');
  u.searchParams.set('limit', '24');
  u.searchParams.set('contentfilter', 'high');
  u.searchParams.set('media_filter', 'gif,tinygif');
  u.searchParams.set('locale', 'en_GB');
  if (q.trim()) u.searchParams.set('q', q.trim());
  const r = await fetch(u);
  if (!r.ok) throw new Error(String(r.status));
  const j = (await r.json()) as { results?: { id: string; content_description?: string; media_formats: Record<string, { url: string; dims: [number, number] }> }[] };
  return (j.results ?? [])
    .filter((x) => x.media_formats.gif && x.media_formats.tinygif)
    .map((x) => ({ id: x.id, alt: x.content_description ?? 'GIF', full: x.media_formats.gif.url, tiny: x.media_formats.tinygif.url, w: x.media_formats.tinygif.dims[0], h: x.media_formats.tinygif.dims[1] }));
}

export function GifPicker({ space, onPick, onClose }: { space: string; onPick: (src: string, alt: string) => void; onClose: () => void }) {
  const isSuper = useSuper();
  const [key, setKey] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [list, setList] = useState<Gif[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const ref = useDismiss<HTMLDivElement>(true, onClose);
  useEffect(() => void tenorKey().then(setKey), []);
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => {
      setErr('');
      search(key, q).then(setList, () => (setList([]), setErr('We couldn’t reach the GIF library just now. Try again in a moment.')));
    }, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [key, q]);
  const upload = async (f: File) => {
    if (f.type !== 'image/gif') return setErr('That isn’t a GIF. Choose a file that ends in .gif.');
    if (f.size > 600 * 1024) return setErr('That GIF is over 600 KB. Choose a smaller one, or search for one above.');
    setBusy(true);
    try {
      onPick('media:' + (await saveImage(space, f)), f.name.replace(/\.gif$/i, ''));
    } catch {
      setErr('We couldn’t upload the GIF. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const saveKey = async () => {
    await setDoc(doc(db, 'admin', 'gif'), { tenorKey: newKey.trim() }, { merge: true });
    keyAsked = Promise.resolve(newKey.trim());
    setKey(newKey.trim());
  };
  return (
    <div className="gif-pop" ref={ref} role="dialog" aria-label="GIFs">
      {key ? (
        <input className="gif-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a GIF" aria-label="Search for a GIF" autoFocus enterKeyHint="search" />
      ) : key === '' ? (
        <div className="gif-nokey">
          {isSuper ? (
            <>
              <b>Searching for GIFs needs a Tenor key</b>
              <span className="hint">It’s free: in Google Cloud (project lesson-lit), turn on the Tenor API, then make an API key under Credentials and paste it here. Everyone can then search.</span>
              <span className="gif-key">
                <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Tenor API key" aria-label="Tenor API key" spellCheck={false} autoComplete="off" />
                <button type="button" className="btn small-btn primary" disabled={newKey.trim().length < 20} onClick={() => void saveKey()}>
                  Save
                </button>
              </span>
            </>
          ) : (
            <span className="hint">Searching for GIFs isn’t set up yet. You can still send a GIF from your device.</span>
          )}
        </div>
      ) : null}
      {key && (
        <div className="gif-grid" aria-busy={list === null}>
          {list === null && <span className="hint">One moment…</span>}
          {list?.map((g) => (
            <button key={g.id} type="button" className="gif-i" onClick={() => onPick(g.full, g.alt)} aria-label={g.alt} style={{ aspectRatio: `${g.w} / ${g.h}` }}>
              <img src={g.tiny} alt="" loading="lazy" />
            </button>
          ))}
          {list && !list.length && !err && <span className="hint">No GIFs for that. Try another word.</span>}
        </div>
      )}
      {err && <span className="error">{err}</span>}
      <div className="gif-foot">
        <button type="button" className="btn link small" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? 'Uploading…' : 'Send a GIF from your device'}
        </button>
        {key && <span className="gif-via">Via Tenor</span>}
        <input ref={file} type="file" accept="image/gif" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
      </div>
    </div>
  );
}
