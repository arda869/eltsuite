import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SPEECH_VOICES } from '../../lib/speech';
import { uploadVoicePreview } from '../../lib/voicePreviews';
export function VoicePreviews() {
  const [clips,setClips]=useState<Record<string,{data:string;name:string}>>({});
  const [busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>onSnapshot(collection(db,'voicePreviews'),snapshot=>setClips(Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data() as {data:string;name:string}]))),()=>setError('Could not load voice previews.')),[]);
  return <div><p>Upload a short sample of each voice. Teachers hear this saved recording every time they preview; no AI generation is needed. These samples do not change or clone the voice used for dialogue.</p><p className="hint">MP3, WAV or other browser-supported audio · up to 30 seconds · maximum 20 MB</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>{SPEECH_VOICES.map(voice=><section key={voice} style={{border:'1px solid var(--border,#d4ddd7)',borderRadius:14,padding:16,display:'grid',gap:12}}><strong style={{textTransform:'capitalize'}}>{voice}</strong>{clips[voice]?<><audio controls preload="none" src={clips[voice].data} aria-label={voice+' saved preview'} style={{width:'100%'}}/><small>{clips[voice].name}</small></>:<small>No preview uploaded</small>}<label>{busy===voice?'Uploading…':clips[voice]?'Replace preview':'Upload preview'}<input aria-label={'Upload '+voice+' preview'} type="file" accept="audio/*" disabled={!!busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(voice);setError('');setMessage('');try{await uploadVoicePreview(voice,file);setMessage(voice+' preview saved.');}catch(err){setError((err as Error).message);}finally{setBusy('');}}}/></label></section>)}</div>
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
