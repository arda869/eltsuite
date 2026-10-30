// Explicit fixture-only voice transport: no microphone, network or provider calls.
export function installFakeRtc() {
  const track={enabled:true,stop(){this.enabled=false;}};
  const fakeStream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>fakeStream}});
  class Channel {
    readyState='open';onopen:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;
    emit(event:unknown){this.onmessage?.({data:JSON.stringify(event)});}
    send(raw:string){const e=JSON.parse(raw);if(e.type==='response.create'){
      const closing=String(e.response?.instructions).includes('ended');
      this.emit({type:'response.created'});
      if(!closing){this.emit({type:'input_audio_buffer.speech_started'});this.emit({type:'conversation.item.input_audio_transcription.completed',transcript:'I would choose the park because it is quieter.'});this.emit({type:'input_audio_buffer.speech_stopped'});}
      this.emit({type:'response.output_audio_transcript.done',transcript:closing?'That sounds good. See you then!':'That sounds like a good reason. Shall we meet there?'});
      setTimeout(()=>this.emit({type:'output_audio_buffer.stopped'}),100);
    }}
    close(){this.readyState='closed';}
  }
  class Peer {
    connectionState='connected';ontrack=null;onconnectionstatechange=null;channel=new Channel();
    createDataChannel(){return this.channel;}addTrack(){}async createOffer(){return {type:'offer',sdp:'v=0\r\nfixture'};}async setLocalDescription(){}async setRemoteDescription(){setTimeout(()=>this.channel.onopen?.(),100);}close(){this.connectionState='closed';}
  }
  Object.defineProperty(window,'RTCPeerConnection',{configurable:true,value:Peer});
}
