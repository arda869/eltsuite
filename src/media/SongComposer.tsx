import { useEffect, useRef, useState } from 'react';
import { NSelect } from '../components/Select';
import { useAuth } from '../lib/auth';
import { songBlob, songResult, startLyrics, startSong, type SongBrief } from '../lib/songs';
import { decodeSound } from '../lib/sound';
import './speech.css';
import './songs.css';
const initial:SongBrief={title:'',audience:'',level:'A1',style:'',language:'English',delivery:'Solo singer',duration:60,focus:'',prompt:'',lyrics:''};
export function SongComposer({open,onClose,onInsert}:{open:boolean;onClose:()=>void;onInsert:(buffer:AudioBuffer,title:string,lyrics:string)=>void}){
  const {user}=useAuth(),key='ll.songDraft:'+user?.uid;
  const [brief,setBrief]=useState<SongBrief>(initial),[approved,setApproved]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(''),[draft,setDraft]=useState(''),[take,setTake]=useState<{blob:Blob;url:string;lyrics:string;title:string;signature:string;providerLyrics:string}|null>(null);
  const [loadedKey,setLoadedKey]=useState('');
  const [savedSong,setSavedSong]=useState<{id:string;brief:SongBrief}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),alive=useRef(true),audio=useRef<HTMLAudioElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(!user?.uid)return;let saved;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}setBrief({...initial,...saved?.brief});setPending(saved?.pending||'');setSavedSong(saved?.savedSong||null);setDraft('');setTake(null);setApproved(false);setLoadedKey(key);},[key,user?.uid]);
  useEffect(()=>{if(user?.uid&&loadedKey===key)try{sessionStorage.setItem(key,JSON.stringify({brief,pending,savedSong}));}catch{}},[brief,pending,savedSong,key,loadedKey,user?.uid]);
  useEffect(()=>{if(open)dialog.current?.showModal();else{dialog.current?.close();audio.current?.pause();}},[open]);
  useEffect(()=>()=>{if(take)URL.revokeObjectURL(take.url);},[take]);
  const patch=(change:Partial<SongBrief>)=>{setBrief(b=>({...b,...change}));setApproved(false);setDraft('');setError('');};
  const signature=JSON.stringify(brief),valid=!!brief.title.trim()&&!!brief.audience&&!!brief.style.trim()&&!!brief.language.trim();
  const current=!!take&&take.signature===signature;
  const recover=async(id:string,snapshot:SongBrief)=>{
    const deadline=Date.now()+550000;
    while(alive.current){
      const result=await songResult(id);
      if(result.status==='failed'){setPending('');throw Error(result.error||'This attempt did not finish. Your words are kept.');}
      if(result.status==='complete'){
        if(id.startsWith('lyrics-'))setDraft(result.lyrics||'');
        else {const blob=songBlob(result);setTake({blob,url:URL.createObjectURL(blob),lyrics:snapshot.lyrics,title:snapshot.title,signature:JSON.stringify(snapshot),providerLyrics:result.providerLyrics||''});setSavedSong({id,brief:snapshot});}
        setPending('');return;
      }
      if(Date.now()>deadline)throw Error('The song is still being prepared. Use Recover creation to check it without creating another.');
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
  };
  const run=async(kind:'lyrics'|'song'|'recover')=>{
    if(lock.current)return;lock.current=true;setError('');setBusy(kind);
    const id=kind==='recover'?(pending||savedSong?.id||''):kind+'-'+crypto.randomUUID(),snapshot=kind==='recover'&&!pending&&savedSong?{...savedSong.brief}:{...brief};
    if(kind!=='recover')setPending(id);
    // Persist before starting the paid request so refresh/reconnection can recover it.
    if(kind!=='recover')try{sessionStorage.setItem(key,JSON.stringify({brief,pending:id,savedSong}));}catch{}
    try{
      if(kind!=='recover'){
        try{if(kind==='lyrics')await startLyrics(id,snapshot);else await startSong(id,snapshot);}
        catch(e){
          // A network timeout may still leave a completed server-side job. Check it first.
          try{await recover(id,snapshot);return;}catch(recovery){
            const code=String((recovery as {code?:string}).code||'');
            if(code.includes('not-found')){setPending('');throw e;}throw recovery;
          }
        }
      }
      await recover(id,snapshot);
    }catch(e){if(alive.current){if(String((e as {code?:string}).code||'').includes('not-found')){setPending('');setSavedSong(null);}setError((e as Error).message||'Creation could not finish. Your lyrics are kept.');}}
    finally{lock.current=false;if(alive.current)setBusy('');}
  };
  const insert=async()=>{
    if(!take||!current||lock.current)return;lock.current=true;setBusy('insert');setError('');
    try{const buffer=await decodeSound(take.blob);onInsert(buffer,take.title,take.lyrics);setTake(null);setApproved(false);}
    catch{setError('The song could not be opened. Your preview is kept; try adding it again.');}
    finally{lock.current=false;setBusy('');}
  };
  return <dialog ref={dialog} className="speech-dialog song-dialog" aria-labelledby="song-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onKeyDown={e=>e.stopPropagation()}>
    <header className="speech-head"><div><span className="speech-eyebrow">RECORDING STUDIO</span><h2 id="song-title">Make a song for your learners</h2><p>Shape the brief. Choose the words. Listen before adding it.</p></div><button type="button" className="btn" disabled={!!busy} onClick={onClose}>Close</button></header>
    <div className="speech-body">
      {(pending||savedSong&&!take)&&!busy&&<div className="song-recovery"><p>Your previous creation can be recovered for 24 hours without generating it again.</p><button type="button" className="btn" onClick={()=>void run('recover')}>Recover creation</button></div>}
      <fieldset disabled={!!busy||!!pending} className="song-fields"><legend>1. Your song brief</legend>
        <label>Song title<input value={brief.title} maxLength={100} onChange={e=>patch({title:e.target.value})} placeholder="A song about daily routines"/></label>
        <label>Learners<NSelect aria-label="Learners" value={brief.audience} onChange={e=>patch({audience:e.target.value})}><option value="">Choose your learners</option>{['Young learners','Teenagers','Adults'].map(x=><option key={x}>{x}</option>)}</NSelect></label>
        <label>Language level<NSelect aria-label="Language level" value={brief.level} onChange={e=>patch({level:e.target.value})}>{['Pre-A1','A1','A2','B1','B2','C1','C2'].map(x=><option key={x}>{x}</option>)}</NSelect></label>
        <label>Musical style<input value={brief.style} maxLength={200} onChange={e=>patch({style:e.target.value})} placeholder="e.g. acoustic pop, jazz, a rhythmic chant"/></label>
        <label>Song length<NSelect aria-label="Song length" value={brief.duration} onChange={e=>patch({duration:Number(e.target.value)})}>{[30,60,90,120,180].map(n=><option key={n} value={n}>{n<60?n+' seconds':n===60?'1 minute':n/60+' minutes'}{n===30?' · clip':' · approximate'}</option>)}</NSelect></label>
        <label>Singing style<NSelect aria-label="Singing style" value={brief.delivery} onChange={e=>patch({delivery:e.target.value})}>{['Solo singer','Group singing','Call and response'].map(x=><option key={x}>{x}</option>)}</NSelect></label>
        <label>Language<input maxLength={80} value={brief.language} onChange={e=>patch({language:e.target.value})}/></label>
        <label className="song-wide">Teaching focus <span>(optional)</span><input maxLength={1000} value={brief.focus} onChange={e=>patch({focus:e.target.value})} placeholder="e.g. morning routines and present simple"/></label>
      </fieldset>
      <fieldset disabled={!!busy||!!pending} className="song-words"><legend>2. Choose the exact words</legend><p>Write or paste your own lyrics, or ask ChatGPT for a draft. Review and edit the words before creating audio.</p>
        <label>Lyrics<textarea aria-label="Lyrics" rows={9} maxLength={6000} value={brief.lyrics} onChange={e=>patch({lyrics:e.target.value})} placeholder="Write exactly what you want sung, including repeated lines."/></label>
        <details><summary>Draft lyrics with ChatGPT</summary><label>What should the lyrics be about?<textarea rows={3} maxLength={2000} value={brief.prompt} onChange={e=>patch({prompt:e.target.value})} placeholder="Describe the topic, vocabulary, story or chorus you want."/></label><button type="button" className="btn" disabled={!valid||!brief.prompt.trim()} onClick={()=>void run('lyrics')}>Draft lyrics with ChatGPT</button></details>
        {draft&&<section className="song-draft" aria-label="Proposed lyrics"><h3>Review the draft</h3><pre>{draft}</pre><button type="button" className="btn" onClick={()=>patch({lyrics:draft})}>Use these lyrics</button><button type="button" className="btn" onClick={()=>setDraft('')}>Keep my current lyrics</button></section>}
        <label className="song-check"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>I have reviewed these lyrics and want these exact words sung.</label>
      </fieldset>
      <p className="song-note">Your written lyrics stay unchanged. Listen for missed or extra words before using the song: AI vocals and longer-song durations can vary. Lyrics are added as one script block, without word-level timing.</p>
      {take&&<section className="song-preview" aria-label="Song preview"><h3>{take.title}</h3><audio ref={audio} controls src={take.url} preload="metadata" aria-label="Listen to the generated song"/><a className="btn" href={take.url} download={take.title.replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,100)+(take.blob.type.includes('wav')?'.wav':'.mp3')}>Download preview ↓</a>{!current&&<div><p>The brief or lyrics have changed. Create a new song to use those changes, or restore this preview’s settings.</p><button type="button" className="btn" disabled={!!busy} onClick={()=>{setBrief(JSON.parse(take.signature));setApproved(false);setDraft('');}}>Use this song’s settings</button></div>}<details><summary>Words sent to the singer</summary><pre>{take.lyrics}</pre></details>{take.providerLyrics&&<details><summary>Music service’s returned lyrics and structure</summary><pre>{take.providerLyrics}</pre></details>}</section>}
    </div>
    <footer className="speech-footer"><div className="speech-feedback"><span>Lyrics: ChatGPT · Music: Google Lyria · AI-generated audio</span>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">{busy==='lyrics'?'Drafting your lyrics…':busy==='insert'?'Adding your song…':'Creating your song. This may take several minutes. Your words are kept.'}</p>}</div><div className="speech-actions"><button type="button" className="btn" disabled={!!busy||!!pending||!valid||!brief.lyrics.trim()||!approved||current} onClick={()=>void run('song')}>{take?'Create a new song':'Create song'}</button><button type="button" className="btn primary" disabled={!!busy||!current} onClick={()=>void insert()}>Add song to timeline</button></div></footer>
  </dialog>;
}
