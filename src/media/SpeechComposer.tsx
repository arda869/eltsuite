import { NSelect } from '../components/Select';
import { VoiceDiversityPrompt } from '../components/VoiceDiversityPrompt';
import { useEffect, useRef, useState } from 'react';
import { createSpeech, draftDialogue, SPEECH_VOICES, type SpeechTake } from '../lib/speech';
import { loadVoicePreview } from '../lib/voicePreviews';
import { bufferOf } from '../lib/sound';
import { newId } from '../lib/tasks';
import './speech.css';
import { performanceText, spokenText } from '../lib/performanceText';
import type { SpeechInsertion } from '../lib/speechTimeline';

type Speaker = { id: string; name: string; voice: string; accent: string };
type Utterance = { id: string; speaker: string; text: string; direction: string; gap: number; take?: SpeechTake; signature?: string };
const signature = (line: Utterance, speaker: Speaker) => JSON.stringify([line.text, line.direction, speaker.voice, speaker.accent]);
const presets = ['Natural', 'Loud', 'Whisper', 'Hesitant', 'Excited', 'Self-correction'];
const directions: Record<string, string> = { Natural: '', Loud: 'Speak loudly, projecting to someone across the room, without clipping.', Whisper: 'Whisper confidentially but intelligibly.', Hesitant: 'Sound unsure; preserve the scripted fillers and pauses.', Excited: 'Sound animated and excited, with natural changes of pitch.', 'Self-correction': 'Cut yourself off at the dash, pause briefly, then naturally repair what you just said.' };
const plain = spokenText;
export function SpeechComposer({ open, onInsert, onClose }: { open: boolean; onInsert: (lines: SpeechInsertion[]) => void; onClose: () => void }) {
  const [speakers, setSpeakers] = useState<Speaker[]>([{ id: 'a', name: 'Speaker A', voice: 'marin', accent: '' }, { id: 'b', name: 'Speaker B', voice: 'cedar', accent: '' }]);
  const [lines, setLines] = useState<Utterance[]>([{ id: newId(), speaker: 'a', text: '', direction: '', gap: 0.25 }]);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [playing, setPlaying] = useState('');
  const [paste, setPaste] = useState(''), [showPaste, setShowPaste] = useState(false);
  const [aiOpen,setAiOpen] = useState(false), [aiBusy,setAiBusy] = useState(false);
  const [brief,setBrief] = useState({situation:'',focus:'',level:'B1',turns:12});
  const textAreas=useRef<Record<string,HTMLTextAreaElement|null>>({});
  const cancel = useRef(false), mounted = useRef(true), lock = useRef(false);
  const ctx = useRef<AudioContext | null>(null), nodes = useRef<AudioBufferSourceNode[]>([]);
  const dragId=useRef<string|null>(null);
  const [dragOver,setDragOver]=useState('');
  const [moveNotice,setMoveNotice]=useState('');
  const moveLine=(id:string,target:string)=>{setLines(rows=>{const next=[...rows],from=next.findIndex(l=>l.id===id),to=next.findIndex(l=>l.id===target);if(from<0||to<0||from===to)return rows;next.splice(to,0,next.splice(from,1)[0]);setMoveNotice(`Take moved to line ${to+1}.`);return next;});};
  const dialog = useRef<HTMLDialogElement>(null);
  const stop = () => { nodes.current.forEach(n => { try { n.stop(); } catch { /* ended */ } }); nodes.current = []; setPlaying(''); };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel.current = true; nodes.current.forEach(n => { try { n.stop(); } catch {} }); void ctx.current?.close(); };
  }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const change = (id: string, patch: Partial<Utterance>) => setLines(rows => rows.map(l => l.id === id ? { ...l, ...patch } : l));
  const speakerOf = (l: Utterance) => speakers.find(s => s.id === l.speaker)!;
  const ready = (l: Utterance) => !!l.take && l.signature === signature(l, speakerOf(l));
  const play = async (rows: Utterance[]) => {
    stop();
    const c = ctx.current ??= new AudioContext(); await c.resume();
    let at = c.currentTime + 0.05, previousStart = at, latestEnd = at;
    let last: AudioBufferSourceNode | undefined;
    rows.forEach((l, i) => {
      if (!l.take) return;
      if (i) at = Math.max(previousStart, at + l.gap);
      previousStart = at;
      const n = c.createBufferSource(); n.buffer = bufferOf(l.take.samples, l.take.rate); n.connect(c.destination); n.start(at); at += n.buffer.duration; nodes.current.push(n); if (at > latestEnd) { latestEnd = at; last = n; }
    });
    setPlaying(rows.length === 1 ? rows[0].id : 'all');
    const endingNode = last;
    if (endingNode) endingNode.onended = () => { if (nodes.current.includes(endingNode)) stop(); };
  };
  const previewVoice=async(s:Speaker)=>{
    const id='preview:'+s.id;
    if(playing===id){stop();return;}
    if(lock.current||aiBusy)return;
    lock.current=true;setBusy(id);setError('');stop();
    try{
      // Resume on the click gesture so Safari can play after the network request.
      const c=ctx.current??=new AudioContext();await c.resume();
      const take=await loadVoicePreview(s.voice,c);
      if(mounted.current)await play([{id,speaker:s.id,text:'',direction:'',gap:0,take}]);
    }catch(e){if(mounted.current)setError((e as Error).message||'Could not preview this voice. Try again.');}
    finally{lock.current=false;if(mounted.current)setBusy('');}
  };
  const generate = async (only?: string) => {
    if (lock.current) return;
    lock.current = true; cancel.current = false; setError(''); stop();
    try {
      for (const l of lines) {
        if ((only && only !== l.id) || (!only && ready(l))) continue;
        if (cancel.current) break;
        if (!l.text.trim()) continue;
        setBusy(l.id);
        const s = speakerOf(l);
        const take = await createSpeech({ text: performanceText(l.text), voice: s.voice, accent: s.accent, direction: l.direction });
        if (!mounted.current) return;
        // A completed take is kept even when stopping a batch; no paid work is discarded.
        change(l.id, { take, signature: signature(l, s) });
      }
    } catch (e) { if (mounted.current) setError((e as Error).message || 'Could not create the take. Try again.'); }
    finally { lock.current = false; if (mounted.current) setBusy(''); }
  };
  const importScript = () => {
    const rows = paste.split('\n').map(t => t.trim()).filter(Boolean);
    if (!rows.length || rows.length > 40) return setError('Paste between 1 and 40 utterances, one per line.');
    const nextSpeakers = speakers.map(s => ({ ...s }));
    const parsed = rows.map((text,index) => {
      const match = /^([^:\n]{1,40}):\s*(.+)$/.exec(text);
      let speaker = nextSpeakers[index%nextSpeakers.length];
      if (match) {
        speaker = nextSpeakers.find(s => s.name.toLowerCase() === match[1].trim().toLowerCase())!;
        if (!speaker) { speaker = { id: newId(), name: match[1].trim(), voice: SPEECH_VOICES[nextSpeakers.length % SPEECH_VOICES.length], accent: nextSpeakers[0].accent }; nextSpeakers.push(speaker); }
      }
      return { id: newId(), speaker: speaker.id, text: match ? match[2] : text, direction: '', gap: 0.25 };
    });
    const used=new Set(parsed.map(l=>l.speaker));
    const cast=nextSpeakers.filter(s=>used.has(s.id));
    if (cast.length > 8 || parsed.some(l => l.text.length > 1200)) return setError('Use up to 8 speakers and 1,200 characters per utterance.');
    setSpeakers(cast); setLines(parsed); setShowPaste(false); setError('');
  };
  const close = () => { if (!busy && !aiBusy) { stop(); onClose(); } };
  const nextLine = (index:number,selection?:{start:number;end:number}) => {
    if(lines.length>=40){setError('Use up to 40 lines in one dialogue.');return;}
    const current=lines[index],at=selection?.start??current.text.length;
    const row:Utterance={id:newId(),speaker:speakers[(speakers.findIndex(s=>s.id===current.speaker)+1)%speakers.length].id,text:current.text.slice(selection?.end??at),direction:'',gap:.25};
    setLines([...lines.slice(0,index),{...current,text:current.text.slice(0,at)},row,...lines.slice(index+1)]);
    requestAnimationFrame(()=>{const el=textAreas.current[row.id];el?.focus();el?.setSelectionRange(0,0);});
  };
  const makeDialogue = async () => {
    if(lock.current || aiBusy)return;
    setAiBusy(true);setError('');
    try {const rows=await draftDialogue({...brief,speakers:speakers.map(({id,name})=>({id,name}))});
      if(!mounted.current)return;
      setLines(rows.map(l=>({...l,text:(l.direction?'('+l.direction+') ':'')+l.text,direction:'',id:newId(),gap:.25})));setAiOpen(false);
    }catch(e){setError((e as Error).message);}finally{if(mounted.current)setAiBusy(false);}
  };
  const writtenLines = lines.filter(l=>l.text.trim());
  const allReady = writtenLines.length > 0 && writtenLines.every(ready);
  return <dialog ref={dialog} className="speech-dialog" aria-labelledby="speech-title" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => e.stopPropagation()}>
    <header className="speech-head"><div><span className="speech-eyebrow">RECORDING STUDIO</span><h2 id="speech-title">Bring your dialogue to life</h2><p>Choose your cast. Write a conversation. Hear it come to life.</p></div><button type="button" className="btn" onClick={close} disabled={!!busy || aiBusy} aria-label="Close speech composer">Close</button></header>
    <div className="speech-body">
      <VoiceDiversityPrompt />
      <section aria-label="Speakers"><div className="speech-section"><h3>1. Cast your voices</h3><button type="button" className="btn small-btn" disabled={!!busy || aiBusy || speakers.length >= 8} onClick={() => setSpeakers([...speakers, { id: newId(), name: `Speaker ${String.fromCharCode(65+speakers.length)}`, voice: SPEECH_VOICES[speakers.length % SPEECH_VOICES.length], accent: '' }])}>+ Add speaker</button></div>
        <div className="speech-speakers">{speakers.map((s, i) => <fieldset className={'speech-cast-card cast-'+i%4} key={s.id} disabled={!!busy || aiBusy}><legend>Speaker {i + 1}</legend><span className="speech-avatar" aria-hidden="true">{String.fromCharCode(65+i)}</span><label>Name<input aria-label={"Speaker "+(i+1)+" name"} value={s.name} maxLength={40} onChange={e => setSpeakers(speakers.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} /></label><label>Voice<NSelect aria-label={"Speaker "+(i+1)+" voice"} value={s.voice} onChange={e => setSpeakers(speakers.map(x => x.id === s.id ? { ...x, voice: e.target.value } : x))}>{SPEECH_VOICES.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}</NSelect></label><button type="button" className="btn speech-voice-preview" disabled={!!busy||aiBusy} onClick={()=>void previewVoice(s)} aria-label={"Preview voice for "+s.name}>{busy==='preview:'+s.id?'Loading…':playing==='preview:'+s.id?'■ Stop':'▷ Preview'}</button></fieldset>)}</div>
        <p className="speech-preview-note">Voice previews use saved recordings. No speech is generated when you preview.</p>
      </section>
      <section aria-label="Dialogue"><div className="speech-section"><h3>2. Shape the conversation</h3><button type="button" className="btn small-btn" disabled={!!busy || aiBusy} onClick={()=>setAiOpen(!aiOpen)}>Draft with AI</button><button type="button" className="btn small-btn" disabled={!!busy || aiBusy} onClick={() => setShowPaste(!showPaste)}>Paste a script</button></div>
        {aiOpen && <div className="speech-paste"><h4>Describe the dialogue</h4><label>Situation<textarea rows={2} maxLength={2000} value={brief.situation} onChange={e=>setBrief({...brief,situation:e.target.value})} placeholder="Two colleagues rearrange a meeting after a misunderstanding."/></label><label>Language or skill to focus on<input maxLength={1000} value={brief.focus} onChange={e=>setBrief({...brief,focus:e.target.value})} placeholder="e.g. polite requests, clarification, past experiences"/></label><div className="speech-line-top"><label>Learner level<NSelect aria-label="Dialogue level" value={brief.level} onChange={e=>setBrief({...brief,level:e.target.value})}>{['A1','A2','B1','B2','C1','C2'].map(l=><option key={l}>{l}</option>)}</NSelect></label><label>Length<NSelect aria-label="Dialogue length" value={brief.turns} onChange={e=>setBrief({...brief,turns:Number(e.target.value)})}>{[6,12,20].map(n=><option key={n} value={n}>{n} utterances</option>)}</NSelect></label></div><p className="hint">Uses your speakers above. The new draft replaces the composer’s script; edit it before creating voices.</p><button type="button" className="btn primary" disabled={aiBusy||!brief.situation.trim()} onClick={()=>void makeDialogue()}>{aiBusy?'Writing your dialogue…':'Create dialogue'}</button></div>}
        {showPaste && <div className="speech-paste"><label>One utterance per line, with optional speaker names<textarea rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Alex: I was going to— no, hang on. Friday works.\nSam: Friday? Um… yes, I think so.'} /></label><p className="hint">Import replaces the lines in this composer.</p><button type="button" className="btn" onClick={importScript}>Use this script</button></div>}
        <p className="speech-hint">Write naturally. <kbd>Enter</kbd> starts the next speaker’s line; <kbd>Shift + Enter</kbd> stays with the same speaker. Put directions in parentheses: <b>(hesitates)</b>, <b>(whispers)</b>, <b>(laughs)</b>. Directions guide the voice; they aren’t read aloud.</p>
        <p className="speech-sr" role="status">{moveNotice}</p><div className="speech-script" aria-label="Dialogue script"><div className="speech-table-head" aria-hidden="true"><span>Speaker</span><span>Your dialogue</span><span>Take controls</span></div>{lines.map((l,i)=><div className={'speech-script-row'+(dragOver===l.id?' drop-target':'')} key={l.id} onDragOver={e=>{if(dragId.current&&!busy&&!aiBusy){e.preventDefault();setDragOver(l.id);e.dataTransfer.dropEffect='move';}}} onDrop={e=>{e.preventDefault();if(dragId.current&&!busy&&!aiBusy)moveLine(dragId.current,l.id);dragId.current=null;setDragOver('');}}>
          <button type="button" className="speech-drag" aria-label={"Move line "+(i+1)+". Use Arrow Up or Arrow Down to reorder."} title="Drag to reorder · Arrow keys to move" disabled={!!busy||aiBusy} draggable={!busy&&!aiBusy} onDragStart={e=>{dragId.current=l.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',l.id);}} onDragEnd={()=>{dragId.current=null;setDragOver('');}} onKeyDown={e=>{const to=e.key==='ArrowUp'?i-1:e.key==='ArrowDown'?i+1:-1;if(to>=0&&to<lines.length){e.preventDefault();moveLine(l.id,lines[to].id);}}}><svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">{[4,10,16].flatMap(y=>[3,9].map(x=><circle key={x+':'+y} cx={x} cy={y} r="1.5" fill="currentColor"/>))}</svg></button>
          <div className="speech-script-speaker"><span className="speech-line-number">{String(i+1).padStart(2,'0')}</span><NSelect aria-label={`Line ${i+1} speaker`} disabled={!!busy||aiBusy} value={l.speaker} onChange={e=>change(l.id,{speaker:e.target.value})}>{speakers.map(s=><option key={s.id} value={s.id}>{s.name||'Unnamed speaker'}</option>)}</NSelect></div>
          <textarea aria-label={`Dialogue line ${i+1}`} disabled={!!busy||aiBusy} ref={el=>{textAreas.current[l.id]=el;if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}}} rows={1} maxLength={1200} value={l.text} placeholder={i===0?'(hesitates) I thought it was Thursday— sorry, Friday.':'Write the next reply…'} onChange={e=>change(l.id,{text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();nextLine(i,{start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd});}if(e.key==='Backspace'&&!l.text&&i>0){e.preventDefault();setLines(lines.filter(x=>x.id!==l.id));requestAnimationFrame(()=>textAreas.current[lines[i-1].id]?.focus());}}}/>
          <div className="speech-row-actions"><button type="button" className="btn" aria-label={"Listen to line "+(i+1)} title={ready(l)?'Listen to take':'Create a take to listen'} disabled={!!busy||aiBusy||!ready(l)} onClick={()=>playing===l.id?stop():void play([l])}>{playing===l.id?'■':'▷'}</button><button type="button" className="btn" aria-label={"Regenerate line "+(i+1)} title={l.take?'Regenerate take':'Create take'} disabled={!!busy||aiBusy||!l.text.trim()} onClick={()=>void generate(l.id)}>{busy===l.id?'…':'↻'}</button></div>
          <details className="speech-line-settings"><summary aria-label={`Options for line ${i+1}`}>•••{ready(l)&&<span aria-label="Take ready"> ✓</span>}</summary><div>
            <label>Delivery<NSelect aria-label={`Line ${i+1} delivery`} disabled={!!busy||aiBusy} value={presets.find(k=>directions[k]===l.direction)??'Custom'} onChange={e=>change(l.id,{direction:directions[e.target.value]??l.direction})}>{presets.map(k=><option key={k}>{k}</option>)}<option>Custom</option></NSelect></label>
            <label>Extra performance directions<input disabled={!!busy||aiBusy} value={l.direction} maxLength={600} onChange={e=>change(l.id,{direction:e.target.value})}/></label>
            <label>Before this line<NSelect aria-label={`Pause before line ${i+1}`} value={l.gap} disabled={i===0||!!busy||aiBusy} onChange={e=>change(l.id,{gap:Number(e.target.value)})}><option value={-.4}>Interrupt · overlap 0.4 s</option><option value={0}>No gap</option><option value={.25}>Natural pause · 0.25 s</option><option value={.6}>Thinking pause · 0.6 s</option><option value={1.2}>Long pause · 1.2 s</option></NSelect></label>
            <div className="speech-line-buttons"><button type="button" className="btn" disabled={!!busy||aiBusy||!l.text.trim()} onClick={()=>void generate(l.id)}>{l.take?'New take':'Create take'}</button><button type="button" className="btn" disabled={!!busy||aiBusy||!ready(l)} onClick={()=>playing===l.id?stop():void play([l])}>{playing===l.id?'Stop':'Listen'}</button><button type="button" className="btn" disabled={!!busy||aiBusy||i===0} onClick={()=>{const next=[...lines];[next[i-1],next[i]]=[next[i],next[i-1]];setLines(next);}}>Move up</button><button type="button" className="btn" disabled={!!busy||aiBusy||lines.length===1} onClick={()=>setLines(lines.filter(x=>x.id!==l.id))}>Remove line</button></div>
            {l.take?.transcript&&<p className="speech-transcript"><b>What was spoken:</b> {l.take.transcript}</p>}
          </div></details>
        </div>)}</div>
        <button type="button" className="btn" disabled={!!busy || aiBusy || lines.length >= 40} onClick={() => setLines([...lines, { id: newId(), speaker: speakers[(lines.length) % speakers.length].id, text: '', direction: '', gap: 0.25 }])}>+ Add line</button>
      </section>
    </div>
    <footer className="speech-footer"><div className="speech-feedback"><span>AI-generated voices · OpenAI</span>{error && <p role="alert">{error}</p>}{busy && <p role="status">{busy.startsWith('preview:')?'Preparing voice preview…':`Creating line ${lines.findIndex(l => l.id === busy) + 1}… Completed takes stay here.`}</p>}</div><div className="speech-actions">{busy ? <button type="button" className="btn" onClick={() => { cancel.current = true; setError('Stopping after the current take finishes.'); }}>{busy.startsWith('preview:')?'Preparing preview…':'Stop after this take'}</button> : <><button type="button" className="btn" disabled={aiBusy || allReady || !writtenLines.length} onClick={() => void generate()}>Create missing takes</button><button type="button" className="btn" disabled={aiBusy || !allReady} onClick={() => playing ? stop() : void play(writtenLines)}>{playing ? 'Stop playback' : 'Listen to dialogue'}</button><button type="button" className="btn primary" disabled={aiBusy || !allReady || speakers.some(s => !s.name.trim())} onClick={() => { stop(); onInsert(writtenLines.map(l => ({ speakerId: l.speaker, speaker: speakerOf(l).name.trim(), text: plain(l.text) || l.text, gap: l.gap, take: l.take! }))); setLines([{ id: newId(), speaker: speakers[0].id, text: '', direction: '', gap: 0.25 }]); }}>Add to timeline</button></>}</div></footer>
  </dialog>;
}
