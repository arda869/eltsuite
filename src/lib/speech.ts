import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
export const SPEECH_VOICES = ['marin', 'cedar', 'coral', 'ash', 'sage', 'verse', 'alloy', 'ballad', 'echo', 'shimmer'];
export type SpeechRequest = { text: string; voice: string; accent: string; direction: string };
export type SpeechTake = { samples: Float32Array; rate: number; transcript: string };
export async function createSpeech(request: SpeechRequest): Promise<SpeechTake> {
  const result = await httpsCallable<SpeechRequest, { pcm: string; rate: number; transcript: string }>(getFunctions(app, 'us-central1'), 'recordingSpeech', { timeout: 110000 })(request);
  const { pcm, rate, transcript } = result.data;
  if (rate !== 24000 || typeof pcm !== 'string') throw Error('The voice service returned an invalid take.');
  const bytes = Uint8Array.from(atob(pcm), c => c.charCodeAt(0));
  if (!bytes.length || bytes.length % 2) throw Error('The voice service returned an empty take.');
  const view = new DataView(bytes.buffer), samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, rate, transcript };
}

export async function transcribeRecording(samples: Float32Array, rate: number) {
  if (samples.length / rate > 1200) throw Error('Transcribe recordings up to 20 minutes. Select a shorter clip.');
  const { encodeMp3 } = await import('./audioEncode');
  const blob = await encodeMp3(samples, rate, 'small');
  const audio = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(Error('Could not prepare the recording.')); reader.readAsDataURL(blob);
  });
  const response = await httpsCallable<{ audio: string; duration: number }, { segments: import('./transcriptTimeline').TranscriptSegment[] }>(getFunctions(app, 'us-central1'), 'recordingTranscript', { timeout: 310000 })({ audio, duration: samples.length / rate });
  return response.data.segments;
}

export async function draftDialogue(input: {situation:string;focus:string;level:string;turns:number;speakers:{id:string;name:string}[]}) {
  return (await httpsCallable<typeof input,{lines:{speaker:string;text:string;direction:string}[]}>(getFunctions(app,'us-central1'),'recordingDialogue',{timeout:240000})(input)).data.lines;
}
