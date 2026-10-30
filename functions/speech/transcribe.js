import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { authorizeTeacher, reserveSpeech } from './access.js';
const key = defineSecret('OPENAI_API_KEY');
export function validateAudio(data) {
  if (typeof data?.audio !== 'string' || data.audio.length < 100 || data.audio.length > 8_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.audio)) throw Error('Choose a recording of up to 20 minutes.');
  if (!Number.isFinite(data.duration) || data.duration <= 0 || data.duration > 1200) throw Error('Choose a recording of up to 20 minutes.');
  return Buffer.from(data.audio, 'base64');
}
export function transcriptSegments(body, duration) {
  if (!Array.isArray(body?.segments)) throw Error('The transcription service did not return timed lines.');
  return body.segments.filter(s => typeof s.text === 'string' && s.text.trim() && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.start < duration && s.end > 0)
    .map(s => ({ text: s.text.trim().slice(0, 6000), speaker: String(s.speaker ?? 'A').slice(0, 40), start: Math.max(0, s.start), end: Math.min(duration, s.end) })).sort((a,b) => a.start-b.start).slice(0, 2000);
}
export const recordingTranscript = onCall({ region: 'us-central1', secrets: [key], maxInstances: 3, concurrency: 2, timeoutSeconds: 300, memory: '512MiB' }, async req => {
  const uid = await authorizeTeacher(req);
  let bytes;
  try { bytes = validateAudio(req.data); } catch (e) { throw new HttpsError('invalid-argument', e.message); }
  await reserveSpeech(uid, Math.max(1, Math.ceil(req.data.duration / 60)));
  const body = new FormData();
  body.set('file', new Blob([bytes], { type: 'audio/mpeg' }), 'recording.mp3');
  body.set('model', 'gpt-4o-transcribe-diarize');
  body.set('response_format', 'diarized_json');
  body.set('chunking_strategy', 'auto');
  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key.value()}` }, body, signal: AbortSignal.timeout(270000) });
    if (!response.ok) throw Error('The transcription service is unavailable. Your recording is safe; try again later.');
    const segments = transcriptSegments(await response.json(), req.data.duration);
    if (!segments.length) throw Error('No speech was detected. Your recording is unchanged.');
    return { segments };
  } catch (e) { throw new HttpsError('unavailable', e.name === 'TimeoutError' ? 'Transcription timed out. Try a shorter clip. Your audio is safe.' : e.message); }
});
