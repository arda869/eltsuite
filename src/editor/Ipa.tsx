import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Grip } from './nodes';
import { usePopPos } from './usePopPos';
import { useEditorClass } from './context';
import { MAX_AUDIO_BYTES, playAudio, saveAudio, speak } from '../lib/media';

// IPA transcription shown like a dictionary entry: grey, between slashes.
// The symbol picker follows the layout of Adrian Underhill's phonemic chart.

export type Accent = 'RP' | 'GA';
type Sym = [string, string]; // symbol, example word

const RP = {
  vowels: [
    [['iː', 'sheep'], ['ɪ', 'ship'], ['ʊ', 'good'], ['uː', 'shoot']],
    [['e', 'bed'], ['ə', 'teacher'], ['ɜː', 'bird'], ['ɔː', 'door']],
    [['æ', 'cat'], ['ʌ', 'up'], ['ɑː', 'far'], ['ɒ', 'on']],
  ] as Sym[][],
  diphthongs: [
    [['ɪə', 'here'], ['eɪ', 'wait']],
    [['ʊə', 'tourist'], ['ɔɪ', 'boy'], ['əʊ', 'show']],
    [['eə', 'hair'], ['aɪ', 'my'], ['aʊ', 'cow']],
  ] as Sym[][],
};
const GA = {
  vowels: [
    [['i', 'sheep'], ['ɪ', 'ship'], ['ʊ', 'good'], ['u', 'shoot']],
    [['ɛ', 'bed'], ['ə', 'about'], ['ɚ', 'teacher'], ['ɝ', 'bird']],
    [['æ', 'cat'], ['ʌ', 'up'], ['ɑ', 'father, hot'], ['ɔ', 'thought']],
  ] as Sym[][],
  diphthongs: [
    [['eɪ', 'wait'], ['aɪ', 'my'], ['ɔɪ', 'boy']],
    [['oʊ', 'show'], ['aʊ', 'cow']],
  ] as Sym[][],
};
const CONSONANTS: Sym[][] = [
  [['p', 'pea'], ['b', 'boat'], ['t', 'tea'], ['d', 'dog'], ['tʃ', 'cheese'], ['dʒ', 'June'], ['k', 'car'], ['ɡ', 'go']],
  [['f', 'fly'], ['v', 'video'], ['θ', 'think'], ['ð', 'this'], ['s', 'see'], ['z', 'zoo'], ['ʃ', 'shall'], ['ʒ', 'television']],
  [['m', 'man'], ['n', 'now'], ['ŋ', 'sing'], ['h', 'hat'], ['l', 'love'], ['r', 'red'], ['w', 'wet'], ['j', 'yes']],
];
const GA_EXTRA: Sym[] = [['ɾ', 'water (flap t)'], ['ʔ', 'button (glottal stop)']];
const MARKS: Sym[] = [['ˈ', 'main stress, before the syllable'], ['ˌ', 'secondary stress'], ['ː', 'long sound'], ['.', 'syllable break'], ['‿', 'linking']];

export const accentLabel = (a: Accent) => (a === 'GA' ? 'US' : 'UK');

export type Listen = { mode: 'off' | 'voice' | 'audio'; say?: string; audioId?: string; classId?: string };

const SPEAKER = (
  <svg className="ipa-spk" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export function playListen(l: Listen, accent: Accent) {
  if (l.mode === 'voice' && l.say?.trim()) speak(l.say, accent);
  if (l.mode === 'audio' && l.audioId && l.classId) playAudio(l.classId, l.audioId);
}

export function IpaText({ text, accent, showAccent, listen }: { text: string; accent: Accent; showAccent?: boolean; listen?: Listen }) {
  const inner = (
    <>
      {showAccent && <span className="ipa-acc">{accentLabel(accent)}</span>}/{text}/
    </>
  );
  const can = listen && ((listen.mode === 'voice' && listen.say?.trim()) || (listen.mode === 'audio' && listen.audioId));
  if (!can)
    return (
      <span className="ipa" lang="en-fonipa" title={accent === 'GA' ? 'Standard American' : 'British (RP)'}>
        {inner}
      </span>
    );
  return (
    <button type="button" className="ipa ipa-play" lang="en-fonipa" title="Listen" onClick={() => playListen(listen!, accent)}>
      {inner}
      {SPEAKER}
    </button>
  );
}

// Teacher's recording or upload for an IPA item.
function Recorder({ classId, audioId, onSaved, accent }: { classId: string; audioId?: string; onSaved: (id: string) => void; accent: Accent }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  void accent;

  async function start() {
    setMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        const blob = new Blob(parts, { type: r.mimeType || 'audio/webm' });
        await store(blob);
      };
      r.start();
      setRec(r);
      setSecs(0);
    } catch {
      setMsg('The microphone could not be used. Check that the browser is allowed to use it.');
    }
  }
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(() => setSecs((s) => {
      if (s + 1 >= 10) rec.state === 'recording' && rec.stop();
      return s + 1;
    }), 1000);
    return () => window.clearInterval(t);
  }, [rec]);

  async function store(blob: Blob) {
    if (!classId) return setMsg('Open this task from a class to save recordings.');
    if (blob.size > MAX_AUDIO_BYTES) return setMsg('That file is too big. Use a clip under 600 KB (about 30 seconds).');
    setMsg('Saving…');
    try {
      onSaved(await saveAudio(classId, blob));
      setMsg('Saved.');
    } catch {
      setMsg('The recording could not be saved. Please try again.');
    }
  }

  return (
    <span className="ipa-rec">
      {rec ? (
        <button type="button" className="btn small-btn rec-on" onClick={() => rec.stop()}>
          <span className="rec-dot" aria-hidden="true" /> Stop · {secs}s
        </button>
      ) : (
        <button type="button" className="btn small-btn" onClick={start}>
          <span className="rec-dot idle" aria-hidden="true" /> {audioId ? 'Record again' : 'Record'}
        </button>
      )}
      <button type="button" className="btn small-btn" onClick={() => fileRef.current?.click()}>
        Upload a file
      </button>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && store(e.target.files[0])} />
      {audioId && !rec && (
        <button type="button" className="btn small-btn" onClick={() => playAudio(classId, audioId)}>
          ▶ Play
        </button>
      )}
      {msg && <span className="hint">{msg}</span>}
    </span>
  );
}

function Chart({ accent, onPick }: { accent: Accent; onPick: (s: string) => void }) {
  const set = accent === 'GA' ? GA : RP;
  const btn = ([s, ex]: Sym, cls = '') => (
    <button key={s} type="button" className={'ipa-key ' + cls} title={`${s} as in “${ex}”`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(s)}>
      <span className="ipa-sym">{s}</span>
      <span className="ipa-ex">{ex.split(/[ ,(]/)[0]}</span>
    </button>
  );
  return (
    <div className="ipa-chart">
      <div className="ipa-top">
        <div className="ipa-block vowels">
          <span className="ipa-cap">Monophthongs</span>
          {set.vowels.map((row, i) => (
            <div key={i} className="ipa-row">
              {row.map((s) => btn(s, 'v'))}
            </div>
          ))}
        </div>
        <div className="ipa-block diph">
          <span className="ipa-cap">Diphthongs</span>
          {set.diphthongs.map((row, i) => (
            <div key={i} className="ipa-row">
              {row.map((s) => btn(s, 'd'))}
            </div>
          ))}
        </div>
      </div>
      <div className="ipa-block cons">
        <span className="ipa-cap">Consonants</span>
        {CONSONANTS.map((row, i) => (
          <div key={i} className="ipa-row">
            {row.map((s) => btn(s, 'c'))}
          </div>
        ))}
        {accent === 'GA' && <div className="ipa-row">{GA_EXTRA.map((s) => btn(s, 'c'))}</div>}
      </div>
      <div className="ipa-row ipa-marks">
        {MARKS.map((s) => btn(s, 'm'))}
      </div>
    </div>
  );
}

function IpaView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const text: string = node.attrs.text ?? '';
  const accent = (node.attrs.accent ?? 'RP') as Accent;
  const showAccent = !!node.attrs.showAccent;
  const listen = (node.attrs.listen ?? 'off') as Listen['mode'];
  const say: string = node.attrs.say ?? '';
  const { classId } = useEditorClass();
  // The word just before the IPA, used as the default for the computer voice.
  const wordBefore = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return '';
    const $p = editor.state.doc.resolve(pos);
    const before = $p.parent.textBetween(0, $p.parentOffset, ' ', ' ').trim();
    return before.split(/\s+/).pop()?.replace(/[^\p{L}'’-]/gu, '') ?? '';
  };
  const [open, setOpen] = useState(!text);
  const ref = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popStyle = usePopPos(ref, open, 440);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  });

  // Insert a symbol where the cursor is in the input.
  const insert = (s: string) => {
    const el = inputRef.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    const next = text.slice(0, a) + s + text.slice(b);
    updateAttributes({ text: next });
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(a + s.length, a + s.length);
    }, 0);
  };

  return (
    <NodeViewWrapper as="span" className={'ipa-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <Grip editor={editor} getPos={getPos} />
      <span className="ipa-chip" contentEditable={false} onClick={() => setOpen(true)} title="Edit IPA">
        {text ? <IpaText text={text} accent={accent} showAccent={showAccent} /> : <span className="stress-empty">IPA</span>}
        {text && listen !== 'off' && <span className="ipa-has-audio" title="Learners can listen">{SPEAKER}</span>}
      </span>
      {open && (
        <span className="gap-pop ipa-pop" contentEditable={false} style={popStyle}>
          <span className="ipa-pop-head">
            <span className="pop-type">IPA</span>
            <span className="seg small-seg" role="radiogroup" aria-label="Accent">
              {(['RP', 'GA'] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={accent === a} className={accent === a ? 'on' : ''} onClick={() => updateAttributes({ accent: a })}>
                  {a === 'RP' ? 'British (RP)' : 'Standard American'}
                </button>
              ))}
            </span>
          </span>
          <span className="ipa-input">
            <span className="ipa-slash">/</span>
            <input ref={inputRef} value={text} placeholder="tap the symbols below" onChange={(e) => updateAttributes({ text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setOpen(false))} spellCheck={false} />
            <span className="ipa-slash">/</span>
          </span>
          <Chart accent={accent} onPick={insert} />
          <span className="ipa-listen">
            <span className="ipa-cap">Learners can listen</span>
            <span className="seg small-seg" role="radiogroup" aria-label="Listening">
              {([
                ['off', 'Off'],
                ['voice', 'Computer voice'],
                ['audio', 'My recording'],
              ] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={listen === k} className={listen === k ? 'on' : ''} onClick={() => updateAttributes({ listen: k, ...(k === 'voice' && !say ? { say: wordBefore() } : {}) })}>
                  {l}
                </button>
              ))}
            </span>
            {listen === 'voice' && (
              <span className="ipa-say">
                <input value={say} placeholder="The word or phrase to say" onChange={(e) => updateAttributes({ say: e.target.value })} />
                <button type="button" className="btn small-btn" disabled={!say.trim()} onClick={() => speak(say, accent)}>
                  ▶ Try it
                </button>
              </span>
            )}
            {listen === 'audio' && <Recorder classId={classId} audioId={node.attrs.audioId || undefined} accent={accent} onSaved={(id) => updateAttributes({ audioId: id })} />}
            {listen !== 'off' && <span className="hint">Learners tap the transcription to hear it.</span>}
          </span>
          <label className="ipa-show">
            <input type="checkbox" checked={showAccent} onChange={() => updateAttributes({ showAccent: !showAccent })} />
            Show {accentLabel(accent)} before the transcription
          </label>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Ipa = Node.create({
  name: 'ipa',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({
    text: { default: '' },
    accent: { default: 'RP' },
    showAccent: { default: false },
    listen: { default: 'off' },
    say: { default: '' },
    audioId: { default: '' },
  }),
  parseHTML: () => [{ tag: 'span[data-ipa]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-ipa': '' })],
  addNodeView: () => ReactNodeViewRenderer(IpaView),
});

export const newIpa = (accent: Accent = 'RP') => ({ type: 'ipa', attrs: { text: '', accent, showAccent: false } });
