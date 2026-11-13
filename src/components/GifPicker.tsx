import { useEffect, useRef, useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSuper } from '../lib/admin';
import { saveImage } from '../lib/media';
import { useDismiss } from '../lib/useDismiss';

// GIFs for messages: GIPHY's Web SDK fetches G-rated GIFs so learners can use this picker too.
// A super admin adds the browser SDK key once in admin/gif. It is a client-side key.

type Gif = { id: string; alt: string; full: string; tiny: string; w: number; h: number };

async function search(key: string, q: string): Promise<Gif[]> {
  const gf = new GiphyFetch(key);
  const { data } = q.trim()
    ? await gf.search(q.trim().slice(0, 50), { limit: 24, rating: 'g', lang: 'en' })
    : await gf.trending({ limit: 24, rating: 'g' });
  return data.filter((x) => x.images?.downsized?.url && x.images?.fixed_width?.url)
    .map((x) => ({ id: String(x.id), alt: x.alt_text || x.title || 'GIF', full: x.images.downsized.url, tiny: x.images.fixed_width.url, w: x.images.fixed_width.width || 200, h: x.images.fixed_width.height || 200 }));
}

// Existing searches keep working until the owner adds the GIPHY key.
async function searchTenor(key: string, q: string): Promise<Gif[]> {
  const u = new URL(`https://tenor.googleapis.com/v2/${q.trim() ? 'search' : 'featured'}`);
  u.searchParams.set('key', key);
  u.searchParams.set('client_key', 'eltsuite');
  u.searchParams.set('limit', '24');
  u.searchParams.set('contentfilter', 'high');
  u.searchParams.set('media_filter', 'gif,tinygif');
  u.searchParams.set('locale', 'en_GB');
  if (q.trim()) u.searchParams.set('q', q.trim());
  const response = await fetch(u);
  if (!response.ok) throw new Error(String(response.status));
  const data = await response.json() as { results?: { id: string; content_description?: string; media_formats: Record<string, { url: string; dims: [number, number] }> }[] };
  return (data.results ?? []).filter((x) => x.media_formats.gif && x.media_formats.tinygif)
    .map((x) => ({ id: x.id, alt: x.content_description ?? 'GIF', full: x.media_formats.gif.url, tiny: x.media_formats.tinygif.url, w: x.media_formats.tinygif.dims[0], h: x.media_formats.tinygif.dims[1] }));
}

export function GifPicker({ space, onPick, onClose }: { space: string; onPick: (src: string, alt: string) => void; onClose: () => void }) {
  const isSuper = useSuper();
  const [key, setKey] = useState<string | null>(null);
  const [oldKey, setOldKey] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState<Gif[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [retry, setRetry] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const ref = useDismiss<HTMLDivElement>(true, onClose);
  const provider = key ? 'giphy' : oldKey ? 'tenor' : '';
  useEffect(() => onSnapshot(doc(db, 'admin', 'gif'), (snapshot) => {
    setKey(String(snapshot.data()?.giphyKey ?? '').trim());
    setOldKey(String(snapshot.data()?.tenorKey ?? '').trim());
  }, () => setKey('')), []);
  useEffect(() => {
    if (!provider) return;
    let current = true;
    setList(null);
    const t = window.setTimeout(() => {
      setErr('');
      (provider === 'giphy' ? search(key!, q) : searchTenor(oldKey, q)).then((items) => current && setList(items), () => {
        if (current) { setList([]); setErr('We couldn’t reach the GIF library just now. Check your connection and try again.'); }
      });
    }, q ? 300 : 0);
    return () => { current = false; window.clearTimeout(t); };
  }, [key, oldKey, provider, q, retry]);
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
    const candidate = newKey.trim();
    setBusy(true); setErr('');
    try {
      await search(candidate, 'hello');
      await setDoc(doc(db, 'admin', 'gif'), { giphyKey: candidate }, { merge: true });
      setKey(candidate);
      setEditingKey(false);
      setNewKey('');
    } catch {
      setErr('This GIPHY key could not load GIFs. Check that it is a Web SDK key and try again.');
    } finally { setBusy(false); }
  };
  return (
    <div className="gif-pop" ref={ref} role="dialog" aria-label="GIFs">
      {provider && !editingKey ? (
        <input className="gif-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a GIF" aria-label="Search for a GIF" autoFocus enterKeyHint="search" />
      ) : key === '' || editingKey ? (
        <div className="gif-nokey">
          {isSuper ? (
            <>
              <b>{editingKey ? (key ? 'Change GIPHY key' : 'Switch to GIPHY') : 'Searching for GIFs needs a GIPHY Web SDK key'}</b>
              <span className="hint">Add the Web SDK key from your GIPHY developer account. We’ll check it before saving. Everyone can then search G-rated GIFs.</span>
              <span className="gif-key">
                <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="GIPHY Web SDK key" aria-label="GIPHY Web SDK key" spellCheck={false} autoComplete="off" />
                <button type="button" className="btn small-btn primary" disabled={busy || !newKey.trim()} onClick={() => void saveKey()}>
                  {busy ? 'Checking…' : 'Save key'}
                </button>
                {editingKey && <button type="button" className="btn small-btn" onClick={() => setEditingKey(false)}>Cancel</button>}
              </span>
              {!newKey.trim() && <span className="hint">Enter your key to save it.</span>}
            </>
          ) : (
            <span className="hint">Searching for GIFs isn’t set up yet. You can still send a GIF from your device.</span>
          )}
        </div>
      ) : null}
      {provider && !editingKey && (
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
      {err && <span className="error" role="alert">{err} {provider && !editingKey && <button type="button" className="btn link small" onClick={() => setRetry((n) => n + 1)}>Try again</button>}</span>}
      <div className="gif-foot">
        <button type="button" className="btn link small" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? 'Uploading…' : 'Send a GIF from your device'}
        </button>
        {provider && isSuper && <button type="button" className="btn link small" onClick={() => setEditingKey(true)}>{key ? 'Change GIPHY key' : 'Switch to GIPHY'}</button>}
        {provider === 'giphy' && <a className="gif-via" href="https://giphy.com" target="_blank" rel="noopener noreferrer">Powered by GIPHY</a>}
        {provider === 'tenor' && <span className="gif-via">Via Tenor</span>}
        <input ref={file} type="file" accept="image/gif" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
      </div>
    </div>
  );
}
