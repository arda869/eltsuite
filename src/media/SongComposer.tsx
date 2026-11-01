import { useEffect, useRef, useState } from 'react';
import { NSelect, Select } from '../components/Select';
import { UiIcon } from '../components/UiIcon';
import { useTeacherClasses } from '../lib/coteach';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Item } from '../lib/classes';
import { useAuth } from '../lib/auth';
import { songBlob, songResult, startLyrics, startSong, loadSongLesson, startSongStems, type SongStems, type SongLesson, type SongBrief } from '../lib/songs';
import { decodeSound } from '../lib/sound';
import './speech.css';
import './songs.css';
const initial:SongBrief={title:'',audience:'',level:'A1',style:'',language:'English',delivery:'Solo singer',duration:60,focus:'',prompt:'',lyrics:'',lesson:null};
const musicStyles=[
  {name:'Pop',hint:'Bright melodies, an easy chorus',value:'Pop: bright melody and a memorable chorus'},
  {name:'Acoustic',hint:'Warm, gentle and easy to hear',value:'Acoustic: warm guitar, gentle rhythm and clear vocals'},
  {name:'Chant',hint:'Simple phrases, plenty of rhythm',value:'Rhythmic classroom chant: clear words and repeated patterns'},
  {name:'Rap',hint:'Spoken rhythm and word play',value:'Clean classroom rap: clear, manageable rhythmic speech'},
  {name:'Folk',hint:'A simple tune that tells a story',value:'Folk: a simple, singable melody and acoustic instruments'},
  {name:'Dance',hint:'An upbeat beat for movement',value:'Dance pop: upbeat rhythm, clear vocals and space for movement'},
];
function SongProgress({kind}:{kind:string}){
  const [seconds,setSeconds]=useState(0);
  useEffect(()=>{const started=Date.now();setSeconds(0);const timer=window.setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(timer);},[kind]);
  const lyrics=kind==='lyrics',recovering=kind==='recover';
  return <section className="song-work" aria-label="Creation progress">
    <div className="song-work-icon" aria-hidden="true"><span/><UiIcon name={lyrics?'pen':'music'} size={30}/></div>
    <div role="status" aria-live="polite" aria-atomic="true"><p className="song-work-eyebrow">AI IS WORKING</p><h3>{lyrics?'Writing your lyrics…':recovering?'Checking your last creation…':'Creating your song…'}</h3><p>{lyrics?'Shaping your topic into words that fit your learners and music style.':recovering?'Looking for the saved result. This won’t start a new creation.':'Turning your reviewed lyrics into music and vocals. This can take a few minutes.'}</p></div>
    <div className="song-work-track" role="progressbar" aria-label={lyrics?'Lyric writing in progress':recovering?'Creation recovery in progress':'Song creation in progress'}><span/></div>
    <p className="song-work-time" aria-hidden="true">Elapsed {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</p>
    <p className="song-work-note">{seconds>=60?'Still working. Keep this window open; your words and settings are kept.':'Keep this window open. Your words and settings are kept.'}</p>
  </section>;
}
export function SongComposer({open,onClose,onInsert}:{open:boolean;onClose:()=>void;onInsert:(buffer:AudioBuffer,title:string,lyrics:string,stems?:SongStems)=>void}){
  const {user}=useAuth(),key='ll.songDraft:'+user?.uid;
  const [step,setStep]=useState(0),[classPick,setClassPick]=useState(''),[lessons,setLessons]=useState<Item[]>([]),[lessonInfo,setLessonInfo]=useState<SongLesson|null>(null),[lessonBusy,setLessonBusy]=useState(false),[lessonError,setLessonError]=useState('');
  const classroom=useTeacherClasses(open?user?.uid:null);
  const lessonRequest=useRef(0);
  const taughtClasses=(classroom.classes||[]).filter(c=>c.status==='active'&&(c.teacherId===user?.uid||c.coTeachers?.[user?.uid||'']?.role==='co')).sort((a,b)=>a.name.localeCompare(b.name));
  const [brief,setBrief]=useState<SongBrief>(initial),[approved,setApproved]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(''),[draft,setDraft]=useState(''),[take,setTake]=useState<{id:string;blob:Blob;url:string;lyrics:string;title:string;signature:string;providerLyrics:string}|null>(null);
  const [stemState,setStemState]=useState<{status:'working'|'complete'|'failed';progress:number;error?:string;vocals?:Blob;instrumental?:Blob;vocalUrl?:string;instrumentalUrl?:string}|null>(null),[skipStems,setSkipStems]=useState(false),[previewMode,setPreviewMode]=useState<'full'|'instrumental'|'vocals'>('full'),[stemAttempt,setStemAttempt]=useState(0);
  const [loadedKey,setLoadedKey]=useState('');
  const [savedSong,setSavedSong]=useState<{id:string;brief:SongBrief}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),alive=useRef(true),audio=useRef<HTMLAudioElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(!user?.uid)return;let saved;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}setBrief({...initial,...saved?.brief,language:'English'});setClassPick(saved?.brief?.lesson?.classId||'');setPending(saved?.pending||'');setSavedSong(saved?.savedSong||null);setDraft('');setTake(null);setApproved(false);setLoadedKey(key);},[key,user?.uid]);
  useEffect(()=>{if(user?.uid&&loadedKey===key)try{sessionStorage.setItem(key,JSON.stringify({brief,pending,savedSong}));}catch{}},[brief,pending,savedSong,key,loadedKey,user?.uid]);
  useEffect(()=>{if(open)dialog.current?.showModal();else{dialog.current?.close();audio.current?.pause();}},[open]);
  useEffect(()=>()=>{if(take)URL.revokeObjectURL(take.url);},[take]);
  useEffect(()=>()=>{if(stemState?.vocalUrl)URL.revokeObjectURL(stemState.vocalUrl);if(stemState?.instrumentalUrl)URL.revokeObjectURL(stemState.instrumentalUrl);},[stemState?.vocalUrl,stemState?.instrumentalUrl]);
  useEffect(()=>{
    if(!take)return;let active=true;setStemState({status:'working',progress:0});setSkipStems(false);setPreviewMode('full');
    const id=take.id;
    void (async()=>{
      try{
        const initial=await songResult(id,{metaOnly:true});
        if(!active)return;let startError:Error|undefined;const started=Date.now();let observedWorking=false;if(initial.stems?.status!=='complete')void startSongStems(id).catch(e=>{startError=e;});
        const deadline=Date.now()+1840000;
        while(active){
          const result=await songResult(id,{metaOnly:true});
          if(result.stems?.status==='working')observedWorking=true;if(startError&&result.stems?.status!=='complete')throw startError;if(result.stems?.status==='failed'&&(observedWorking||Date.now()-started>10000))throw Error(result.stems.error||'Track preparation could not finish.');
          if(result.stems?.status==='complete'){
            const [v,b]=await Promise.all([songResult(id,{stem:'vocals'}),songResult(id,{stem:'instrumental'})]);
            if(!active)return;const vocals=songBlob(v),instrumental=songBlob(b);
            setStemState({status:'complete',progress:1,vocals,instrumental,vocalUrl:URL.createObjectURL(vocals),instrumentalUrl:URL.createObjectURL(instrumental)});return;
          }
          setStemState({status:'working',progress:result.stems?.progress||0});
          if(Date.now()>deadline)throw Error('Track preparation took too long. Recover this song later, or use the original mix.');
          await new Promise(resolve=>setTimeout(resolve,4000));
        }
      }catch(e){if(active)setStemState({status:'failed',progress:0,error:(e as Error).message||'Sing-along tracks could not be prepared. Your original song is kept.'});}
    })();
    return()=>{active=false;};
  },[take?.id,stemAttempt]);
  const patch=(change:Partial<SongBrief>)=>{setBrief(b=>({...b,...change}));setApproved(false);setDraft('');setError('');};
  useEffect(()=>{setLessons([]);if(!open||!classPick)return;return onSnapshot(collection(db,'classes',classPick,'items'),s=>setLessons(s.docs.map(d=>({id:d.id,...d.data()} as Item)).filter(i=>i.type==='lesson').sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title))),()=>setLessonError('We couldn’t load these lessons. Try another classroom.'));},[open,classPick]);
  const chooseLesson=async(reference:{classId:string;itemId:string}|null)=>{
    const request=++lessonRequest.current;setLessonInfo(null);setLessonError('');patch({lesson:null});
    if(!reference){setLessonBusy(false);return;}
    setLessonBusy(true);
    try{const info=await loadSongLesson(reference);if(request!==lessonRequest.current)return;setLessonInfo(info);patch({lesson:reference,...(!brief.title.trim()?{title:(info.title+' song').slice(0,100)}:{}),...(['Young learners','Teenagers','Adults'].includes(info.audience)?{audience:info.audience}:{}),...(['Pre-A1','A1','A2','B1','B2','C1','C2'].includes(info.level)?{level:info.level}:{})});}
    catch(e){if(request===lessonRequest.current)setLessonError((e as Error).message||'This lesson could not be linked.');}
    finally{if(request===lessonRequest.current)setLessonBusy(false);}
  };
  useEffect(()=>{if(!open||!brief.lesson||(lessonInfo?.reference.classId===brief.lesson.classId&&lessonInfo?.reference.itemId===brief.lesson.itemId))return;let active=true;setLessonBusy(true);setLessonError('');loadSongLesson(brief.lesson).then(info=>{if(active)setLessonInfo(info);}).catch(()=>{if(active){setLessonInfo(null);setLessonError('The linked lesson is unavailable. Choose another lesson or unlink it.');}}).finally(()=>{if(active)setLessonBusy(false);});return()=>{active=false;};},[open,brief.lesson?.classId,brief.lesson?.itemId]);
  const generating=!!busy&&busy!=='insert';
  useEffect(()=>{if(generating)dialog.current?.querySelector('.song-content')?.scrollTo({top:0});},[generating]);
  const signature=JSON.stringify(brief),valid=!!brief.audience&&!!brief.style.trim()&&!!brief.language.trim();
  const current=!!take&&take.signature===signature;
  const recover=async(id:string,snapshot:SongBrief)=>{
    const deadline=Date.now()+550000;
    while(alive.current){
      const result=await songResult(id);
      if(result.status==='failed'){setPending('');throw Error(result.error||'This attempt did not finish. Your words are kept.');}
      if(result.status==='complete'){
        if(id.startsWith('lyrics-')){setDraft(result.lyrics||'');setStep(2);}
        else {const blob=songBlob(result);setTake({id,blob,url:URL.createObjectURL(blob),lyrics:snapshot.lyrics,title:snapshot.title,signature:JSON.stringify(snapshot),providerLyrics:result.providerLyrics||''});setSavedSong({id,brief:snapshot});setStep(2);}
        setPending('');return;
      }
      if(Date.now()>deadline)throw Error('The song is still being prepared. Use Recover creation to check it without creating another.');
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
  };
  const run=async(kind:'lyrics'|'song'|'recover')=>{
    if(lock.current)return;lock.current=true;setError('');setBusy(kind);
    const id=kind==='recover'?(pending||savedSong?.id||''):kind+'-'+crypto.randomUUID(),snapshot=kind==='recover'&&!pending&&savedSong?{...savedSong.brief}:{...brief};
    if(kind!=='recover'){
      if(!snapshot.title.trim()){
        snapshot.title=(snapshot.prompt.trim()||snapshot.focus.trim()||lessonInfo?.title||'Classroom song').split(/\r?\n/)[0].slice(0,100);
        setBrief(snapshot);
      }
      setPending(id);
    }
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
    try{const buffer=await decodeSound(take.blob);const stems=!skipStems&&stemState?.vocals&&stemState.instrumental?{vocals:await decodeSound(stemState.vocals),instrumental:await decodeSound(stemState.instrumental)}:undefined;onInsert(buffer,take.title,take.lyrics,stems);setTake(null);setApproved(false);}
    catch{setError('The song could not be opened. Your preview is kept; try adding it again.');}
    finally{lock.current=false;setBusy('');}
  };
  const styleReady=!!brief.style.trim()&&brief.style.trim()!=='Custom:';
  const learnersReady=!!brief.audience&&!lessonBusy&&!lessonError&&(!brief.lesson||!!lessonInfo);
  const songBlockReason=lessonBusy?'Wait for the lesson to finish linking.':lessonError?'Go back to Learners & lesson to choose another lesson or continue without one.':!brief.audience?'Choose your learners in Learners & lesson.':!styleReady?'Choose a music style in Music & mood.':!brief.lyrics.trim()?(draft?'Click “Use these lyrics” to put the AI draft into your song.':'Write lyrics above, or draft them and click “Use these lyrics”.'):!approved?'Review the lyrics, then tick “I’ve reviewed the lyrics. Use these exact words.” to enable Create song.':'';
  const nextReady=step===0?learnersReady:styleReady;
  const move=(next:number)=>{setStep(next);dialog.current?.querySelector('.song-content')?.scrollTo({top:0});};
  const styleCustom=!!brief.style&&!musicStyles.some(s=>s.value===brief.style);
  return <dialog ref={dialog} className="speech-dialog song-dialog" aria-labelledby="song-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onKeyDown={e=>e.stopPropagation()}>
    <header className="song-header"><div className="song-heading-icon"><UiIcon name="music" size={24}/></div><div><p className="song-eyebrow">RECORDING STUDIO</p><h2 id="song-title">Create a classroom song</h2><p>Make the music fit your learners and what you’re teaching.</p></div><button type="button" className="btn song-close" disabled={!!busy} onClick={onClose} aria-label="Close song creator"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <nav className="song-steps" aria-label="Song steps">{['Learners & lesson','Music & mood','Lyrics & preview'].map((label,i)=><button type="button" key={label} aria-current={step===i?'step':undefined} disabled={!!busy||!!pending||i===1&&!learnersReady||i===2&&(!learnersReady||!styleReady)} onClick={()=>move(i)}><span>{i+1}</span>{label}</button>)}</nav>
    <div className="song-content">
      {generating&&<SongProgress kind={busy}/>}
      <div hidden={generating} aria-busy={!!busy}>
      {(pending||savedSong&&!take)&&!busy&&<div className="song-recovery"><UiIcon name="music"/><div><strong>Your last creation is still available</strong><p>Recover it within 24 hours without creating it again.</p></div><button type="button" className="btn" onClick={()=>void run('recover')}>Recover creation</button></div>}
      {step===0&&<fieldset className="song-step-panel" disabled={!!busy||!!pending}><legend>Who is this song for?</legend><p className="song-intro">Choose your learners, then give the song a teaching purpose.</p>
        <div className="song-audiences" role="group" aria-label="Learners">{[{name:'Young learners',hint:'Simple, playful and easy to repeat'},{name:'Teenagers',hint:'Engaging, with age-respectful themes'},{name:'Adults',hint:'Relevant topics and natural language'}].map(a=><label key={a.name} className="song-choice"><input type="radio" name="song-audience" aria-label={a.name} checked={brief.audience===a.name} onChange={()=>patch({audience:a.name})}/><UiIcon name="groups" size={21}/><strong>{a.name}</strong><small>{a.hint}</small></label>)}</div>
        <label className="song-level">Language level<NSelect aria-label="Language level" value={brief.level} onChange={e=>patch({level:e.target.value})}>{['Pre-A1','A1','A2','B1','B2','C1','C2'].map(x=><option key={x}>{x}</option>)}</NSelect></label>
        <section className="song-lesson"><div className="song-section-title"><UiIcon name="classes" size={22}/><div><h3>Start with a Classroom lesson</h3><span>Optional</span></div></div><p>Linking a lesson gives the AI its aims, vocabulary and level, helping it write words that fit what you’re teaching.</p>
          <div className="song-lesson-pickers"><label>Classroom<Select label="Classroom" value={classPick} options={[{v:'',label:classroom.loading?'Loading classrooms…':'Choose a classroom',icon:'classes'},...taughtClasses.map(c=>({v:c.id,label:c.name,icon:'classes',hint:c.level}))]} onChange={id=>{setClassPick(id);void chooseLesson(null);}} disabled={classroom.loading||!!busy||!!pending}/></label><label>Lesson<Select label="Classroom lesson" value={brief.lesson?.itemId||''} options={[{v:'',label:classPick?'Choose a lesson':'Choose a classroom first',icon:'task'},...lessons.map(i=>({v:i.id,label:i.title,icon:'task'}))]} onChange={id=>void chooseLesson(id?{classId:classPick,itemId:id}:null)} disabled={!classPick||lessonBusy||!!busy||!!pending}/></label></div>
          {lessonBusy&&<p role="status">Linking your lesson…</p>}{(lessonError||classroom.error)&&<p className="song-inline-error" role="alert">{lessonError||classroom.error}</p>}{lessonError&&<button type="button" className="btn" onClick={()=>{setClassPick('');void chooseLesson(null);}}>Continue without a lesson</button>}
          {lessonInfo&&<div className="song-linked"><UiIcon name="check" size={18}/><div><strong>{lessonInfo.title}</strong><span>{lessonInfo.className} · {lessonInfo.level}</span>{lessonInfo.focus&&<p>{lessonInfo.focus}</p>}</div><button type="button" className="btn" onClick={()=>void chooseLesson(null)}>Unlink</button></div>}
        </section>
        <label>Anything else to practise? <span className="song-optional">Optional</span><textarea aria-label="Teaching focus" rows={2} maxLength={1000} value={brief.focus} onChange={e=>patch({focus:e.target.value})} placeholder="e.g. daily routines, the present simple, or words about animals"/></label>
      </fieldset>}
      {step===1&&<fieldset className="song-step-panel" disabled={!!busy||!!pending}><legend>Find the right sound</legend><p className="song-intro">Pick a style that suits your class. The words will always be in English.</p>
        <div className="song-styles" role="group" aria-label="Music style">{musicStyles.map(s=><label key={s.name} className="song-choice"><input type="radio" name="song-style" aria-label={s.name} checked={brief.style===s.value} onChange={()=>patch({style:s.value})}/><UiIcon name="music" size={22}/><strong>{s.name}</strong><small>{s.hint}</small></label>)}<label className="song-choice song-custom"><input type="radio" name="song-style" aria-label="Custom style" checked={styleCustom} onChange={()=>patch({style:'Custom: '})}/><UiIcon name="pen" size={22}/><strong>Your own style</strong><small>Describe a different sound</small></label></div>
        {styleCustom&&<label>Describe your style<input aria-label="Custom music style" maxLength={190} value={brief.style.replace(/^Custom: /,'')} onChange={e=>patch({style:'Custom: '+e.target.value})} placeholder="e.g. relaxed jazz with piano and clear vocals"/></label>}
        <div className="song-music-options"><fieldset className="song-length"><legend>How long?</legend><div role="group" aria-label="Song length">{[30,60,90,120,180].map(n=><label key={n}><input type="radio" name="song-duration" aria-label={n===30?'30 seconds':n===60?'1 minute':n/60+' minutes'} checked={brief.duration===n} onChange={()=>patch({duration:n})}/><span>{n===30?'30 sec':n===60?'1 min':n/60+' min'}</span></label>)}</div><p>Longer songs may vary a little in length.</p></fieldset><label>Singing style<Select label="Singing style" value={brief.delivery} options={['Solo singer','Group singing','Call and response'].map(v=>({v,label:v,icon:v==='Solo singer'?'mic':'groups'}))} onChange={delivery=>patch({delivery})} disabled={!!busy||!!pending}/></label></div>
      </fieldset>}
      {step===2&&<fieldset className="song-step-panel song-lyrics-panel" disabled={!!busy||!!pending}><legend>Make every word count</legend><p className="song-intro">Use your own words, or start with an AI draft. You choose the final lyrics.</p>
        <div className="song-brief-strip"><span><UiIcon name="groups" size={15}/>{brief.audience} · {brief.level}</span><span><UiIcon name="music" size={15}/>{musicStyles.find(s=>s.value===brief.style)?.name||'Custom style'}</span><span><UiIcon name="timer" size={15}/>{brief.duration<60?brief.duration+' sec':brief.duration/60+' min'}</span>{brief.lesson&&lessonInfo&&<span><UiIcon name="task" size={15}/>{lessonInfo.title}</span>}</div>
        <label>Song title <span className="song-optional">Optional</span><input aria-label="Song title" value={brief.title} maxLength={100} onChange={e=>patch({title:e.target.value})} placeholder="Leave blank to use your topic as the title"/></label>
        <label>Lyrics<textarea aria-label="Lyrics" rows={8} maxLength={6000} value={brief.lyrics} onChange={e=>patch({lyrics:e.target.value})} placeholder="Write exactly what you want sung. Include repeated lines as you want them to appear."/></label>
        <details className="song-ai"><summary><UiIcon name="pen" size={18}/>Help me write the lyrics</summary><label>{lessonInfo||brief.focus.trim()?<>Extra ideas for the lyrics <span className="song-optional">Optional</span></>:<>What should the song be about?</>}<textarea aria-label="Lyric ideas" rows={3} maxLength={2000} value={brief.prompt} onChange={e=>patch({prompt:e.target.value})} placeholder="Describe a topic, a story or a few words you want to include."/></label>{lessonInfo&&<p>Your linked lesson will help guide the vocabulary and wording.</p>}{!brief.prompt.trim()&&!lessonInfo&&!brief.focus.trim()&&<p>Add a topic above, enter a teaching focus, or link a lesson to draft lyrics.</p>}<button type="button" className="btn" disabled={!learnersReady||!styleReady||(!brief.prompt.trim()&&!lessonInfo&&!brief.focus.trim())||lessonBusy||!!lessonError} onClick={()=>void run('lyrics')}><UiIcon name="pen" size={16}/>Draft lyrics</button></details>
        {draft&&<section className="song-draft" aria-label="Proposed lyrics"><h3>Try these words</h3><pre>{draft}</pre><div><button type="button" className="btn" onClick={()=>patch({lyrics:draft})}>Use these lyrics</button><button type="button" className="btn" onClick={()=>setDraft('')}>Keep my current lyrics</button></div></section>}
        <label className="song-check"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/><span>I’ve reviewed the lyrics. Use these exact words.</span></label>
      </fieldset>}
      {take&&step===2&&<section className="song-preview" aria-label="Song preview"><div className="song-section-title"><UiIcon name="music" size={22}/><div><h3>{take.title}</h3><span>Your song is ready to preview</span></div></div><audio ref={audio} controls src={previewMode==='instrumental'?stemState?.instrumentalUrl:previewMode==='vocals'?stemState?.vocalUrl:take.url} preload="metadata" aria-label="Listen to the generated song"/>{stemState?.status==='complete'?<div className="song-stem-options"><div className="seg" role="group" aria-label="Song preview track">{(['full','instrumental','vocals'] as const).map(mode=><button key={mode} type="button" aria-pressed={previewMode===mode} className={previewMode===mode?'on':''} onClick={()=>setPreviewMode(mode)}>{mode==='full'?'Full song':mode==='instrumental'?'Sing-along · no vocals':'Vocals only'}</button>)}</div><p>Vocals and backing will be saved separately. Mute the Vocals track in the editor, or turn vocals off in the saved player.</p></div>:<div className="song-stem-status" aria-live="polite">{stemState?.status==='failed'?<p role="alert">{stemState.error}</p>:<><strong>Preparing sing-along tracks… {Math.round((stemState?.progress||0)*100)}%</strong><progress max="1" value={stemState?.progress||0}/><p>You can listen to the original while vocals and backing are separated. This may take several minutes.</p></>}{!skipStems&&<button className="btn" type="button" onClick={()=>setSkipStems(true)}>Use original mix only</button>}{stemState?.status==='failed'&&<button className="btn" type="button" onClick={()=>setStemAttempt(n=>n+1)}>Retry sing-along tracks</button>}{skipStems&&<p>The original mix will be added without separate tracks.</p>}</div>}<p>Listen for the right words, clear pronunciation and a comfortable pace before adding your song.</p><p id="song-stem-guidance">{!skipStems&&stemState?.status!=='complete'?'Wait for the sing-along tracks, or choose “Use original mix only” to add the song now.':''}</p><div className="song-preview-actions"><a className="btn" href={take.url} download={take.title.replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,100)+(take.blob.type.includes('wav')?'.wav':'.mp3')}><UiIcon name="export" size={16}/>Download preview</a>{!current&&<button type="button" className="btn" disabled={!!busy} onClick={()=>{setBrief(JSON.parse(take.signature));setApproved(false);setDraft('');}}>Use this song’s settings</button>}</div>{!current&&<p>You’ve changed the brief. Create a new version to hear those changes, or restore this preview’s settings.</p>}<details><summary>Song lyrics</summary><pre>{take.lyrics}</pre></details></section>}
      </div>
    </div>
    <footer className="song-footer"><div id="song-create-guidance" className="song-feedback" aria-live="polite">{error?<p role="alert">{error}</p>:busy?<p>{busy==='insert'?'Adding your song…':'Your words and settings are kept while AI works.'}</p>:<p>{step===2?(songBlockReason||'Ready to create your song. Listen before adding it to the timeline.'):'Step '+(step+1)+' of 3'}</p>}</div><div className="song-footer-actions">{step>0&&<button type="button" className="btn" disabled={!!busy||!!pending} onClick={()=>move(step-1)}>Back</button>}{step<2?<button type="button" className="btn primary" disabled={!!busy||!!pending||!nextReady} onClick={()=>move(step+1)}>{step===0?'Next: music':'Next: lyrics'}<span aria-hidden="true"> →</span></button>:<><button type="button" aria-describedby="song-create-guidance" className={'btn'+(!current?' primary':'')} disabled={!!busy||!!pending||!valid||!styleReady||!brief.lyrics.trim()||!approved||current||lessonBusy||!!lessonError} onClick={()=>void run('song')}>{take?'Create a new version':'Create song'}</button>{take&&<button type="button" className="btn primary" aria-describedby="song-stem-guidance" disabled={!!busy||!current||(!skipStems&&stemState?.status!=='complete')} onClick={()=>void insert()}>Add song to timeline</button>}</>}</div></footer>
  </dialog>;
}
