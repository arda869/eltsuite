import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { speakingCall } from './api';
import type { SpeakingConfig, SpeakingFeedback, SpeakingSession, SpeakingTurn } from './types';
import './speaking.css';
const clock = (n: number) => `${Math.floor(Math.max(0,n)/60)}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
export function SpeakingActivity({ config: initialConfig, classId, teacher = false, preview = false, disabled = false, classmates = [] }: { config: SpeakingConfig; classId: string; teacher?: boolean; preview?: boolean; disabled?: boolean; classmates?: { id: string; name: string }[] }) {
  const { user } = useAuth();
  const [previewReply,setPreviewReply]=useState(''),[partnerTalking,setPartnerTalking]=useState(false);
  const [published,setPublished]=useState<SpeakingConfig|null>(null);
  const config=teacher?initialConfig:published||initialConfig;
  const [focusChoice,setFocusChoice]=useState<number|null>(null),[chosenFocus,setChosenFocus]=useState(''),[lessonFocus,setLessonFocus]=useState(config.focus);
  const [sessions,setSessions]=useState<SpeakingSession[]>([]),[enabled,setEnabled]=useState(false);
  const [status,setStatus]=useState('ready'),[error,setError]=useState(''),[remaining,setRemaining]=useState(config.seconds),[help,setHelp]=useState(false),[muted,setMuted]=useState(false);
  const [feedback,setFeedback]=useState<SpeakingFeedback|null>(null),[turns,setTurns]=useState<SpeakingTurn[]>([]),[selected,setSelected]=useState('');
  const pc=useRef<RTCPeerConnection|null>(null),stream=useRef<MediaStream|null>(null),dc=useRef<RTCDataChannel|null>(null),audio=useRef<HTMLAudioElement>(null);
  const sessionId=useRef(''),deadline=useRef(0),turnRef=useRef<SpeakingTurn[]>([]),running=useRef(false),wrapping=useRef(false),closing=useRef(false),responding=useRef(false),finishing=useRef(false),mounted=useRef(true),queue=useRef(Promise.resolve());
  const inputSpeaking=useRef(false);
  const helpRef=useRef(false),statusRef=useRef('ready');
  const liveStatus=(s:string)=>{statusRef.current=s;setStatus(s);};
  const base={classId,activityId:config.id};
  const disconnect=()=>{running.current=false;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;dc.current?.close();dc.current=null;pc.current?.close();pc.current=null;if(audio.current)audio.current.srcObject=null;};
  const progress=()=>{
    if(!sessionId.current)return;
    const payload={...base,action:'progress',sessionId:sessionId.current,turns:[...turnRef.current],status:statusRef.current,help:helpRef.current};
    queue.current=queue.current.then(async()=>{await speakingCall(payload);}).catch(()=>{if(mounted.current)setError('The teacher view is temporarily offline. Your conversation is still here.');});
  };
  const finish=async()=>{
    if(finishing.current || !sessionId.current)return;
    finishing.current=true;running.current=false;
    const wasSpeaking=inputSpeaking.current;
    stream.current?.getTracks().forEach(t=>t.stop());
    if(audio.current)audio.current.pause();
    if(wasSpeaking&&dc.current?.readyState==='open')dc.current.send(JSON.stringify({type:'input_audio_buffer.commit'}));
    liveStatus('feedback');setError('');
    // Let pending final transcription events arrive before closing the data channel.
    await new Promise(resolve=>window.setTimeout(resolve,1000));disconnect();
    try {await queue.current;const r=await speakingCall<{feedback?:SpeakingFeedback}>({...base,action:'finish',sessionId:sessionId.current,turns:turnRef.current});if(mounted.current){if(r.feedback){setFeedback(r.feedback);liveStatus('complete');}else{liveStatus('ended');setError('Feedback is still being prepared. Try again in a moment.');}}}
    catch(e){if(mounted.current){setError((e as Error).message);liveStatus('ended');}}
    finally{finishing.current=false;}
  };
  const send=(event:unknown)=>{if(dc.current?.readyState==='open')dc.current.send(JSON.stringify(event));};
  const append=(role:SpeakingTurn['role'],text:string)=>{
    if(!text.trim() || turnRef.current.length>=100)return;
    turnRef.current=[...turnRef.current,{role,text:text.slice(0,2000),at:Math.min(320,Math.max(0,(Date.now()-(deadline.current-config.seconds*1000))/1000))}];setTurns(turnRef.current);progress();
  };
  const finalTurn=()=>{
    if(closing.current || responding.current || !running.current)return;
    closing.current=true;
    send({type:'session.update',session:{type:'realtime',audio:{input:{turn_detection:null}}}});
    if(inputSpeaking.current){send({type:'input_audio_buffer.commit'});inputSpeaking.current=false;}
    stream.current?.getAudioTracks().forEach(t=>t.enabled=false);setMuted(true);
    send({type:'response.create',response:{instructions:'The speaking task time has ended. In your assigned role, say one natural brief closing sentence and goodbye. No question, no feedback, no further conversation.',max_output_tokens:100}});
  };
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;disconnect();};
  },[]);
  useEffect(()=>{
    if(!classId || !config.id || !user)return;
    const path=doc(db,'classes',classId,'speakingActivities',config.id);
    const off=onSnapshot(path,s=>{setEnabled(s.exists()&&s.data().enabled===true);if(s.exists())setPublished({...s.data(),id:initialConfig.id} as SpeakingConfig);},()=>setEnabled(false));
    const offLesson=config.feedbackMode==='lesson'&&config.lessonId?onSnapshot(doc(db,'classes',classId,'items',config.lessonId),s=>setLessonFocus(s.data()?.speakingFocus||config.focus)):()=>{};
    const list=collection(path,'sessions');
    const q=teacher?query(list,orderBy('startedAt','desc'),limit(100)):query(list,where('uid','==',user.uid));
    const offSessions=onSnapshot(q,s=>{const rows=s.docs.map(d=>({...d.data(),id:d.id} as SpeakingSession)).sort((a,b)=>b.startedAt-a.startedAt);setSessions(rows);const current=rows.find(r=>r.id===sessionId.current);if(current?.feedback){setFeedback(current.feedback);if(!running.current)liveStatus('complete');}if(current?.status==='ended'&&running.current)void finish();},()=>setError('The speaking progress view could not connect.'));
    return ()=>{off();offSessions();offLesson();};
  },[classId,config.id,config.lessonId,config.feedbackMode,user?.uid,teacher]);
  useEffect(()=>{
    if(!['connecting','listening','speaking','wrapping-up'].includes(status))return;
    const timer=window.setInterval(()=>{
      if(!running.current || !deadline.current)return;
      const seconds=Math.ceil((deadline.current-Date.now())/1000);setRemaining(seconds);
      if(seconds<=20 && !wrapping.current){wrapping.current=true;liveStatus('wrapping-up');send({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'TIME CHECK: about 20 seconds remain. Bring this scenario to a natural conclusion in the next short exchange. Do not introduce another topic.'}]}});progress();}
      if(seconds<=0)finalTurn();
      if(seconds<=-10)void finish();
    },250);
    return ()=>window.clearInterval(timer);
  },[status,config.seconds]);
  const start=async()=>{
    if(running.current || status==='connecting')return;
    if(config.feedbackMode==='learner'&&focusChoice===null){setError('Choose a development area before starting.');return;}
    liveStatus('connecting');setError('');setFeedback(null);setTurns([]);turnRef.current=[];wrapping.current=false;closing.current=false;responding.current=false;finishing.current=false;helpRef.current=false;setHelp(false);setMuted(false);sessionId.current='';deadline.current=0;
    try {
      if((!preview&&!navigator.mediaDevices?.getUserMedia) || !window.RTCPeerConnection)throw Error('Use a current browser with microphone access to practise speaking.');
      if(!preview)stream.current=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(!mounted.current){disconnect();return;}
      const connection=new RTCPeerConnection();pc.current=connection;
      const channel=connection.createDataChannel('oai-events');dc.current=channel;
      connection.ontrack=e=>{if(audio.current){audio.current.srcObject=e.streams[0];void audio.current.play().catch(()=>setError('Tap Play partner audio to hear your partner.'));}};
      if(preview)connection.addTransceiver('audio',{direction:'recvonly'});else stream.current!.getTracks().forEach(t=>connection.addTrack(t,stream.current!));
      channel.onopen=()=>{running.current=true;liveStatus('listening');progress();send({type:'response.create'});};
      channel.onmessage=e=>{
        try {const event=JSON.parse(e.data);
          if(event.type==='input_audio_buffer.speech_started'){inputSpeaking.current=true;if(!wrapping.current)liveStatus('speaking');progress();}
          if(event.type==='input_audio_buffer.speech_stopped'){inputSpeaking.current=false;if(!wrapping.current)liveStatus('listening');progress();}
          if(event.type==='conversation.item.input_audio_transcription.completed')append('learner',event.transcript || '');
          if(event.type==='response.output_audio_transcript.done')append('partner',event.transcript || '');
          if(event.type==='response.created'){responding.current=true;setPartnerTalking(true);}
          if(event.type==='output_audio_buffer.cleared'||(event.type==='response.done'&&event.response?.status!=='completed')){responding.current=false;setPartnerTalking(false);}
          if(event.type==='output_audio_buffer.stopped'){responding.current=false;setPartnerTalking(false);if(closing.current)void finish();else if(Date.now()>=deadline.current)finalTurn();}
          if(event.type==='error')setError('The voice partner had a connection problem. You can end the task and keep your transcript.');
        }catch{/* ignore non-JSON control events */}
      };
      connection.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(connection.connectionState)&&running.current){setError('The voice connection was interrupted. Your transcript is kept.');void finish();}};
      const offer=await connection.createOffer();await connection.setLocalDescription(offer);
      const response=await speakingCall<{sdp:string;sessionId:string;deadline:number;seconds:number;focus:string}>({...base,action:'start',sdp:offer.sdp,focusChoice,preview});
      if(!mounted.current){disconnect();void speakingCall({...base,action:'finish',sessionId:response.sessionId,turns:[]}).catch(()=>{});return;}
      sessionId.current=response.sessionId;deadline.current=response.deadline;setRemaining(response.seconds);setChosenFocus(response.focus);
      await connection.setRemoteDescription({type:'answer',sdp:response.sdp});
    }catch(e){disconnect();liveStatus('ready');setError((e as Error).name==='NotAllowedError'?'Allow microphone access to begin. Nothing has been recorded.':(e as Error).message);if(sessionId.current)void speakingCall({...base,action:'finish',sessionId:sessionId.current,turns:[]}).catch(()=>{});}
  };
  const active=['connecting','listening','speaking','wrapping-up'].includes(status);
  const latestByUser=[...new Map(sessions.filter(s=>!s.preview).reverse().map(s=>[s.uid,s])).values()];
  const selectedSession=sessions.find(s=>s.id===selected);
  return <section className="speak-card" aria-label="AI conversation">
    <div className="speak-heading"><span className="speak-kicker">SPEAKING PRACTICE</span><span className="speak-duration">{config.seconds/60} min · {config.level}</span></div>
    {preview&&<p className="speak-note"><strong>Teacher preview</strong> · Hear the partner and type a learner’s replies. Your microphone stays off. Save the task before trying it.</p>}
    <h3>{config.title}</h3><p className="speak-scenario"><strong>Your task:</strong> {config.scenario}</p>
    <div className="speak-focus"><span>{config.feedbackMode==='learner'?'Your development area':'Today’s focus'}</span><strong>{chosenFocus||(config.feedbackMode==='learner'?(focusChoice===null?'Choose what you want to work on':config.focusOptions?.[focusChoice]):config.feedbackMode==='lesson'?lessonFocus:config.focus)}</strong></div>
    {config.feedbackMode==='learner'&&!teacher&&!active&&status!=='feedback'&&<fieldset className="speak-choices"><legend>What would you like feedback on?</legend><p>Pick the development area that matters to you today.</p>{config.focusOptions?.map((option,i)=><label key={i} className={focusChoice===i?'selected':''}><input type="radio" name={'speaking-focus-'+config.id} checked={focusChoice===i} onChange={()=>{setFocusChoice(i);setChosenFocus('');}}/><span>{option}</span></label>)}</fieldset>}
    {teacher ? <div className="speak-monitor"><div className="speak-monitor-head"><h4>Live class view</h4><span>{latestByUser.length} started{classmates.length?` / ${classmates.length} learners`:''} · {latestByUser.filter(s=>s.status==='complete').length} finished</span></div>
      {!latestByUser.length?<p className="speak-note">Learners appear here when they start. Each conversation stays private to that learner and their teachers.</p>:<div className="speak-roster">{latestByUser.map(s=><button type="button" key={s.id} className={'speak-learner'+(s.help?' help':'')} onClick={()=>setSelected(s.id)}><span className="speak-avatar">{s.name.slice(0,1)}</span><span><strong>{s.name}</strong><small>{s.help?'Needs help':s.status==='complete'?'Feedback ready':Date.now()>s.deadline+15000?'Finished':s.status.replaceAll('-',' ')}</small></span><span>{s.turns.filter(t=>t.role==='learner').length} turns</span></button>)}</div>}
      {selectedSession&&<div className="speak-review"><h4>{selectedSession.name}’s conversation</h4><p className="speak-note">Feedback focus: {selectedSession.config?.focus||config.focus}</p><Transcript turns={selectedSession.turns}/>{selectedSession.feedback?<Feedback value={selectedSession.feedback}/>:<button type="button" className="btn" onClick={()=>void speakingCall({...base,action:'finish',sessionId:selectedSession.id}).catch(e=>setError(e.message))}>End attempt and get feedback</button>}</div>}
    </div> : <>
      <div className="speak-roles"><span>Your role: <b>{config.learnerRole}</b></span><span>Your AI partner’s role: <b>{config.partnerRole}</b></span></div>
      <p className="speak-task-time">This will take approximately {config.seconds/60} {config.seconds===60?'minute':'minutes'}.</p>
      {active?<div className={'speak-live'+(wrapping.current?' wrapping':'')}><div className="speak-orb" aria-hidden="true"><span/><span/><span/><span/><span/></div><div><strong>{status==='connecting'?'Connecting your microphone…':status==='wrapping-up'?'Bringing the conversation to a close':status==='speaking'?'Your turn — I’m listening':'Talk naturally with your partner'}</strong><p>{status==='connecting'?'A moment to get ready.':'A short pause lets your partner respond.'}</p></div><output aria-label="Time remaining">{remaining>0?clock(remaining):'Closing…'}</output></div>:null}
      <div className="speak-controls">{!active&&status!=='feedback'?<button type="button" className="speak-start" disabled={disabled||!enabled||(config.feedbackMode==='learner'&&focusChoice===null)} onClick={()=>void start()}>{sessions.length?'Practise again':'Start speaking'}</button>:status==='feedback'?<p role="status">Preparing feedback for today’s focus…</p>:<>{!preview&&<button type="button" className="btn" disabled={status==='connecting'||closing.current} onClick={()=>{const next=!muted;stream.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next);}}>{muted?'Unmute microphone':'Mute microphone'}</button>}<button type="button" className="btn" disabled={!sessionId.current} onClick={()=>{helpRef.current=!helpRef.current;setHelp(helpRef.current);progress();}}>{help?'Help requested':'Ask teacher for help'}</button><button type="button" className="btn" disabled={!sessionId.current} onClick={()=>void finish()}>Finish</button></>}
      {status==='ended'&&<button type="button" className="btn" onClick={()=>void finish()}>Retry feedback</button>}</div>
      {preview&&active&&<form className="speak-preview-reply" onSubmit={e=>{e.preventDefault();if(!previewReply.trim()||closing.current||responding.current)return;append('learner',previewReply.trim());send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:previewReply.trim()}]}});send({type:'response.create'});setPreviewReply('');}}><label>Reply as the learner<input aria-label="Preview learner reply" value={previewReply} maxLength={2000} disabled={status==='connecting'||closing.current} onChange={e=>setPreviewReply(e.target.value)}/></label><button type="submit" className="btn" disabled={!previewReply.trim()||closing.current||partnerTalking}>{partnerTalking?'Partner speaking…':'Send reply'}</button></form>}
      <audio ref={audio} autoPlay playsInline />
      {error.includes('Play partner audio')&&<button type="button" className="btn" onClick={()=>void audio.current?.play().then(()=>setError(''))}>Play partner audio</button>}
      {!enabled&&!active&&<p className="speak-note">Your teacher will make this task available when it’s ready.</p>}
      <p className="speak-note">{preview?'AI voice partner · Your test replies go to OpenAI. Preview attempts are excluded from the learner count.':'AI voice partner · Use headphones in class. Your microphone audio goes to OpenAI; your teacher can see your transcript and feedback. Other learners cannot listen in.'}</p>
      {feedback&&<Feedback value={feedback}/>}
      {!!turns.length&&<details className="speak-transcript"><summary>Your conversation · {turns.filter(t=>t.role==='learner').length} speaking turns</summary><Transcript turns={turns}/></details>}
      {!active&&sessions[0]&&!sessions[0].feedback&&sessions[0].status==='ended'&&<button type="button" className="btn" onClick={()=>{sessionId.current=sessions[0].id;turnRef.current=sessions[0].turns;void finish();}}>Get feedback for last attempt</button>}
      {!active&&sessions[0]?.feedback&&!feedback&&<details><summary>Feedback from your last attempt</summary><Feedback value={sessions[0].feedback}/><Transcript turns={sessions[0].turns}/></details>}
    </>}
    {error&&<p className="speak-error" role="alert">{error}</p>}
  </section>;
}
function Transcript({turns}:{turns:SpeakingTurn[]}){return <ol className="speak-turns">{turns.map((t,i)=><li key={i} className={t.role}><span>{t.role==='learner'?'Learner':'AI partner'} · {clock(Math.floor(t.at))}</span><p>{t.text}</p></li>)}</ol>;}
function Feedback({value}:{value:SpeakingFeedback}){return <div className="speak-feedback"><span className="speak-kicker">YOUR NEXT STEP</span><h4>Feedback for today’s focus</h4><p>{value.focusFeedback}</p>{value.evidence.length>0&&<ul>{value.evidence.map((e,i)=><li key={i}>{e}</li>)}</ul>}<p>{value.communication}</p><div className="speak-next"><strong>Try this next</strong><p>{value.nextStep}</p><blockquote>{value.retryPrompt}</blockquote></div><small>AI feedback is a practice aid. Your teacher can help you review it.</small></div>;}
