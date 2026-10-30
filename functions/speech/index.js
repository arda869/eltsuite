import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { validateSpeech } from './contract.js';
import { generateSpeech } from './provider.js';
import { authorizeTeacher, reserveSpeech } from './access.js';
export { recordingTranscript } from './transcribe.js';
const key = defineSecret('OPENAI_API_KEY');
export const recordingSpeech = onCall({ region: 'us-central1', secrets: [key], maxInstances: 3, concurrency: 4, timeoutSeconds: 100, memory: '256MiB' }, async req => {
  const uid = await authorizeTeacher(req);
  let request;
  try { request = validateSpeech(req.data); } catch (e) { throw new HttpsError('invalid-argument', e.message); }
  await reserveSpeech(uid);
  try { return await generateSpeech(key.value(), request); }
  catch (e) { throw new HttpsError('unavailable', e.message); }
});
