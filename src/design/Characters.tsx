import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useMyOrg } from '../lib/admin';
import { assetBlob, saveAsset, useVideoLibrary } from '../video/library';
import { VideoDialog } from '../video/VideoDialog';
import type { VideoAsset } from '../video/model';
import '../video/video.css';
import './Characters.css';

export function useCharacters() {
  const { user } = useAuth();
  const org = useMyOrg();
  const library = useVideoLibrary(user?.uid ?? '', org?.id ?? '');
  return { ...library, items: library.items.filter(a => a.kind === 'character') };
}
export function CharacterPortrait({ asset }: { asset: VideoAsset }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true, url = '';
    void assetBlob(asset.id).then(blob => { if (active) { url = URL.createObjectURL(blob); setUrl(url); } }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [asset.id]);
  return url ? <img src={url} alt={asset.name} /> : <span aria-hidden="true">◉</span>;
}
export function CharacterLibrary({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { items, error: loadError } = useCharacters();
  const [editing, setEditing] = useState<VideoAsset | null>(null);
  const [name, setName] = useState(''), [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const reset = () => { setEditing(null); setName(''); setDescription(''); setFile(null); setError(''); };
  const save = async () => {
    if (!user) return;
    if (!name.trim()) return setError('Give your character a name.');
    if (items.some(a => a.id !== editing?.id && a.owner === user.uid && a.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return setError('You already have a character with this name. Choose a different name.');
    if (!editing && !file) return setError('Upload a reference image for your character.');
    setBusy(true); setError(''); setSaved('');
    try {
      if (editing) await updateDoc(doc(db, 'videoAssets', editing.id), { name: name.trim(), description: description.trim() });
      else await saveAsset(file!, { owner: user.uid, ownerName: user.displayName || 'Teacher', kind: 'character', name: name.trim(), description: description.trim(), voice: '', duration: 5, org: '', readers: [] });
      setSaved(`${name.trim()} saved to your character library.`); reset();
    } catch { setError('Could not save your character. Your details are still here. Please try again.'); }
    finally { setBusy(false); }
  };
  return <VideoDialog name="Character library" onClose={() => { if (!busy) onClose(); }}><div className="dc-library">
    <header><div><small>DESIGNER · CHARACTERS</small><h2>Your recurring cast</h2><p>People, animals and imaginary friends. Save a reference once and use it across designs and videos.</p></div><button className="btn" disabled={busy} onClick={onClose} aria-label="Close character library">Close</button></header>
    <div className="dc-columns"><section><label>Find a character<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {loadError && <p role="alert">Could not open your characters. Try reopening the library.</p>}
      <div className="dc-grid">{items.filter(a => a.name.toLowerCase().includes(search.toLowerCase())).map(a => <button type="button" className={'dc-card '+(editing?.id === a.id ? 'chosen' : '')} key={a.id} disabled={busy || a.owner !== user?.uid} onClick={() => { setEditing(a); setName(a.name); setDescription(a.description); setFile(null); setError(''); setSaved(''); }}><CharacterPortrait asset={a}/><strong>{a.name}</strong><small>{a.owner === user?.uid ? 'Edit character' : 'Shared character'}</small></button>)}</div>
      {!items.length && <p className="hint">Your characters will appear here. Start with a photo or illustration.</p>}
    </section><section className="dc-form"><h3>{editing ? `Edit ${editing.name}` : 'Add a character'}</h3>
      {editing && <div className="dc-reference"><CharacterPortrait asset={editing}/></div>}
      <label>Character name<input maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} placeholder="Carla, Pip the fox…" /></label>
      {!editing && <label>Reference image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const f=e.target.files?.[0]; if (!f) return; if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 12*1024*1024) { setError('Choose a PNG, JPEG or WebP image up to 12 MB.'); return; } setError(''); setFile(f); }} /><small>PNG, JPEG or WebP · up to 12 MB</small></label>}
      {preview && <img className="dc-upload" src={preview} alt="New character reference"/>}
      <label>Details to keep (optional)<textarea rows={2} maxLength={1000} value={description} disabled={busy} onChange={e => setDescription(e.target.value)} placeholder="Round glasses, a blue scarf, striped tail…" /></label>
      <p className="hint">{editing ? 'Changes apply to your shared character library. Images already created stay as they are.' : 'Then mention the name in an image request, such as “Carla running in a park”.'}</p>
      {error && <p role="alert">{error}</p>}{saved && <p role="status">{saved}</p>}
      <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving character…' : editing ? 'Save character' : 'Add character'}</button>
      {editing && <button className="btn" disabled={busy} onClick={reset}>Add another character</button>}
    </section></div></div></VideoDialog>;
}
export function mentionedCharacters(prompt: string, characters: VideoAsset[]) {
  const text = prompt.normalize('NFKC').toLocaleLowerCase();
  return characters.filter(a => { const name=a.name.trim().normalize('NFKC').toLocaleLowerCase(); if (!name) return false; let at=text.indexOf(name); while(at>=0) { const before=text.slice(0,at).at(-1)??'', after=text.slice(at+name.length)[0]??''; if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after)) return true; at=text.indexOf(name,at+1); } return false; });
}
