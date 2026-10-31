import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { SPEECH_VOICES, type SpeechTake } from './speech';
import { encodeMp3 } from './audioEncode';
const decoded = new Map<string, { data: string; take: SpeechTake }>();
export async function loadVoicePreview(voice: string, context: AudioContext): Promise<SpeechTake> {
  const snapshot = await getDoc(doc(db, 'voicePreviews', voice));
  const data = snapshot.data()?.data;
  if (typeof data !== 'string') throw Error('No saved preview for this voice yet. A super admin can upload one in Sounds for everyone.');
  const cached = decoded.get(voice);
  if (cached?.data === data) return cached.take;
  const response = await fetch(data);
  const audio = await context.decodeAudioData(await response.arrayBuffer());
  const take = { samples: audio.getChannelData(0).slice(), rate: audio.sampleRate, transcript: '' };
  decoded.set(voice, { data, take });
  return take;
}
export async function uploadVoicePreview(voice: string, file: File) {
  if (!SPEECH_VOICES.includes(voice)) throw Error('Choose a supported voice.');
  if (file.size > 20 * 1024 * 1024) throw Error('Choose an audio file smaller than 20 MB.');
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    if (audio.duration < 1 || audio.duration > 30) throw Error('Choose a preview between 1 and 30 seconds.');
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) { const channel = audio.getChannelData(c); for(let i=0;i<mono.length;i++) mono[i] += channel[i] / audio.numberOfChannels; }
    const blob = await encodeMp3(mono, audio.sampleRate, 'clear');
    const data = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read the audio.'));reader.readAsDataURL(blob);});
    if (data.length >= 900000) throw Error('This preview is too large. Choose a shorter recording.');
    await setDoc(doc(db, 'voicePreviews', voice), { data, name: file.name.slice(0,150), updatedAt: Date.now() });
    decoded.delete(voice);
  } finally { await context.close(); }
}
