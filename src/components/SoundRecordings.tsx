import { useEffect, useRef, useState } from 'react';
import { auth } from '../lib/firebase';
import { CHARTS, type Accent, type Phoneme } from '../lib/phonemes';
import { defaultSound, fileToData, isOwner, removeSound, saveSound, teacherSound } from '../lib/phonAudio';
import { Example } from '../editor/Phonemes';
import { tell } from '../lib/ask';

// A teacher's own recordings of the sounds of English. Learners hear them in this teacher's
// charts and cards; sounds without one use the default recording.

type State = { mine: string | null; def: string | null };

function SoundRow({ p, accent, target }: { p: Phoneme; accent: Accent; target: 'mine' | 'default' }) {
  const [st, setSt] = useState<State | null>(null);
  const [rec, setRec] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = auth.currentUser?.uid ?? '';
  const load = () => void Promise.all([uid ? teacherSound(uid, accent, p.id) : null, defaultSound(accent, p.id)]).then(([mine, def]) => setSt({ mine, def }));
  useEffect(load, [accent, p.id, uid]);
  const play = (src?: string | null) => src && void new Audio(src).play().catch(() => {});
  const keep = async (blob: Blob) => {
    try {
      await saveSound(target, accent, p.id, await fileToData(blob));
      load();
    } catch (e) {
      void tell((e as Error).message === 'too big' ? 'That file is too big. Keep sound clips under 650 KB, a few seconds long.' : 'The recording could not be saved.');
    }
  };
  const record = async () => {
    if (rec) return recRef.current?.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      const parts: Blob[] = [];
      mr.ondataavailable = (e) => parts.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(false);
        void keep(new Blob(parts, { type: mr.mimeType }));
      };
      recRef.current = mr;
      mr.start();
      setRec(true);
      window.setTimeout(() => mr.state === 'recording' && mr.stop(), 6000);
    } catch {
      void tell('The microphone could not be opened.');
    }
  };
  const have = target === 'mine' ? st?.mine : st?.def;
  return (
    <div className={`snd-row k-${p.kind}`}>
      <span className="snd-sym">{p.sym}</span>
      <Example ex={p.ex} />
      <span className="snd-state">
        {st === null ? '' : target === 'mine' ? (st.mine ? <b>Yours</b> : st.def ? 'Default' : 'None yet') : st.def ? <b>Default set</b> : 'None yet'}
      </span>
      <span className="snd-acts">
        <button type="button" className="btn small-btn" disabled={!(have || st?.def)} onClick={() => play(target === 'mine' ? st?.mine ?? st?.def : st?.def)}>
          Play
        </button>
        <button type="button" className={'btn small-btn' + (rec ? ' snd-rec' : '')} onClick={() => void record()}>
          {rec ? 'Stop' : 'Record'}
        </button>
        <button type="button" className="btn small-btn" onClick={() => fileRef.current?.click()}>
          Upload
        </button>
        {have && (
          <button type="button" className="btn link small" onClick={() => void removeSound(target, accent, p.id).then(load)}>
            {target === 'mine' ? 'Use the default' : 'Remove'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => (e.target.files?.[0] && void keep(e.target.files[0]), (e.target.value = ''))} />
      </span>
    </div>
  );
}

export function SoundRecordings() {
  const [accent, setAccent] = useState<Accent>('RP');
  const [target, setTarget] = useState<'mine' | 'default'>('mine');
  const [open, setOpen] = useState(false);
  const ch = CHARTS[accent];
  const groups: [string, Phoneme[]][] = [
    ['Single vowels', ch.vowels.flat()],
    ['Diphthongs', ch.diphs.flat()],
    ['Consonants', ch.cons.flat()],
  ];
  return (
    <div className="snd">
      <p className="hint snd-intro">
        English has many accents, and no single correct way to say each sound. ELT Suite comes with a recording of every sound, and you can replace any of them with your own: your accent, a colleague, or the variety your learners need. Your learners hear your recordings in your charts and sound cards. Sounds you do not record use the default.
      </p>
      <div className="snd-bar">
        <span className="seg small-seg" role="radiogroup" aria-label="Accent">
          {(['RP', 'GA'] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={accent === a} className={accent === a ? 'on' : ''} onClick={() => setAccent(a)}>
              {CHARTS[a].name}
            </button>
          ))}
        </span>
        {isOwner() && (
          <span className="seg small-seg" role="radiogroup" aria-label="Whose recordings">
            <button type="button" role="radio" aria-checked={target === 'mine'} className={target === 'mine' ? 'on' : ''} onClick={() => setTarget('mine')}>
              My recordings
            </button>
            <button type="button" role="radio" aria-checked={target === 'default'} className={target === 'default' ? 'on' : ''} onClick={() => setTarget('default')}>
              The default set, for everyone
            </button>
          </span>
        )}
        <button type="button" className="btn small-btn" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide the sounds' : 'Show the sounds'}
        </button>
      </div>
      {open &&
        groups.map(([g, list]) => (
          <div key={g} className="snd-group">
            <span className="snd-h">{g}</span>
            {list.map((p) => (
              <SoundRow key={accent + p.id + target} p={p} accent={accent} target={target} />
            ))}
          </div>
        ))}
    </div>
  );
}
