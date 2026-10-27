import { useEffect, useRef, useState } from 'react';
import { SFX, synth } from '../lib/mix';
import { isOwner } from '../lib/phonAudio';
import { addMySfx, defaultSfx, removeDefaultSfx, removeMySfx, saveDefaultSfx, useMySfx } from '../lib/sfxAudio';
import { tell } from '../lib/ask';

// Sound effects for the sound editor: the set everyone uses, and your own.

let ctx: AudioContext | null = null;
const play = async (src: string | Float32Array, rate = 44100) => {
  ctx ??= new AudioContext();
  await ctx.resume();
  if (typeof src === 'string') return void new Audio(src).play().catch(() => {});
  const b = ctx.createBuffer(1, src.length, rate);
  b.getChannelData(0).set(src);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start();
};

function DefaultRow({ k, label, dur, owner }: { k: string; label: string; dur: number; owner: boolean }) {
  const [rec, setRec] = useState<string | null | undefined>(undefined);
  const ref = useRef<HTMLInputElement>(null);
  const load = () => void defaultSfx(k).then(setRec);
  useEffect(load, [k]);
  return (
    <div className="sfx-row">
      <button type="button" className="btn small-btn" onClick={() => void play(rec ?? synth(k, 44100, Math.min(dur, 4)))}>
        Play
      </button>
      <span className="sfx-l">{label}</span>
      <span className="hint">{rec ? 'Recorded' : rec === null ? 'Made by the app' : ''}</span>
      {owner && (
        <span className="sfx-acts">
          <button type="button" className="btn small-btn" onClick={() => ref.current?.click()}>
            Upload
          </button>
          {rec && (
            <button type="button" className="btn link small" onClick={() => void removeDefaultSfx(k).then(load)}>
              Remove
            </button>
          )}
          <input ref={ref} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void saveDefaultSfx(k, f).then(load).catch(() => tell('That file is too big. Keep sound effects under 650 KB.')); }} />
        </span>
      )}
    </div>
  );
}

export function SfxSettings() {
  const mine = useMySfx();
  const owner = isOwner();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const [allName, setAllName] = useState('');
  const allRef = useRef<HTMLInputElement>(null);
  const forAll = mine.filter((s) => s.everyone);
  const own = mine.filter((s) => !s.everyone);
  const row = (s: (typeof mine)[number], canDelete: boolean) => (
    <div key={s.id} className="sfx-row">
      <button type="button" className="btn small-btn" onClick={() => void play(s.data)}>
        Play
      </button>
      <span className="sfx-l">{s.label}</span>
      <span className="hint">{s.dur.toFixed(1)} s</span>
      <span className="sfx-acts">
        {canDelete && (
          <button type="button" className="btn link small" onClick={() => void removeMySfx(s.id)}>
            Delete
          </button>
        )}
      </span>
    </div>
  );
  return (
    <div className="snd">
      {/* The owner keeps the set for everyone, so has no sounds of their own here. */}
      {owner ? (
        <p className="hint snd-intro">The sound editor comes with {SFX.length} sound effects. What you add or record here is for every teacher.</p>
      ) : (
        <>
      <p className="hint snd-intro">The sound editor comes with {SFX.length} sound effects for everyone. Add your own here: they appear under “Your sounds” when you add an effect, in your projects only.</p>
          <div className="sfx-add">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, for example: School canteen" maxLength={40} aria-label="Name of the sound" />
            <button type="button" className="btn small-btn primary" onClick={() => ref.current?.click()}>
              Upload a sound
            </button>
            <input ref={ref} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addMySfx(name || f.name.replace(/\.[^.]+$/, ''), f).then(() => setName('')).catch(() => tell('That file is too big. Keep sound effects under 650 KB, a few seconds long.')); }} />
          </div>
        </>
      )}
      {!owner && own.length > 0 && (
        <div className="snd-group">
          <span className="snd-h">Your sounds</span>
          {own.map((s) => row(s, true))}
        </div>
      )}
      {(owner || forAll.length > 0) && (
        <div className="snd-group">
          <span className="snd-h">Added for everyone</span>
          {owner && (
            <div className="sfx-add">
              <input value={allName} onChange={(e) => setAllName(e.target.value)} placeholder="Name, for example: Classroom applause" maxLength={40} aria-label="Name of the sound for everyone" />
              <button type="button" className="btn small-btn primary" onClick={() => allRef.current?.click()}>
                Add a sound for everyone
              </button>
              <input ref={allRef} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addMySfx(allName || f.name.replace(/\.[^.]+$/, ''), f, true).then(() => setAllName('')).catch(() => tell('That file is too big. Keep sound effects under 650 KB, a few seconds long.')); }} />
            </div>
          )}
          {forAll.map((s) => row(s, owner))}
          {owner && !forAll.length && <span className="hint">Every teacher finds these under More sounds when they add an effect.</span>}
        </div>
      )}
      <button type="button" className="btn small-btn" onClick={() => setOpen((o) => !o)} style={{ alignSelf: 'flex-start' }}>
        {open ? 'Hide the sound effects for everyone' : 'The sound effects for everyone'}
      </button>
      {open && (
        <div className="snd-group">
          {owner && <span className="hint">You keep this set: what you upload replaces the sound the app makes, for every teacher.</span>}
          {SFX.map((s) => (
            <DefaultRow key={s.k} k={s.k} label={s.label} dur={s.dur} owner={owner} />
          ))}
        </div>
      )}
    </div>
  );
}
