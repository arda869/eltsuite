import { songPrompt } from './contract.js';
export class SongCreationError extends Error {}
export async function generateSong(apiKey, brief, fetchImpl = fetch) {
  if (!apiKey) throw new SongCreationError('Song creation is not configured yet.');
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: {'x-goog-api-key': apiKey, 'Content-Type': 'application/json'}, signal: AbortSignal.timeout(420000),
    body: JSON.stringify({model: brief.duration === 30 ? 'lyria-3-clip-preview' : 'lyria-3.5', input: songPrompt(brief), store: false}),
  });
  if (!response.ok) {
    // Never forward provider bodies: they can contain prompt content or credentials.
    throw new SongCreationError(response.status === 429 ? 'Song creation is busy or its allowance has been reached. Try later.' : [401,403,404].includes(response.status) ? 'Song creation needs an administrator to check the service connection and billing.' : 'The music service could not create this song. Your lyrics are kept.');
  }
  const data = await response.json();
  const blocks = (data.steps ?? []).filter(s => s.type === 'model_output').flatMap(s => s.content ?? []);
  const audio = blocks.filter(b => b.type === 'audio');
  // Lyria returns the complete generated track as one audio block. Do not silently drop chunks.
  if (audio.length !== 1 || typeof audio[0].data !== 'string' || audio[0].data.length > 16_000_000) throw Error('The music service returned an incomplete song. Your lyrics are kept.');
  const bytes = Buffer.from(audio[0].data, 'base64');
  if (bytes.length < 100 || bytes.length > 12_000_000) throw Error('The music service returned an invalid audio file.');
  const mime = audio[0].mime_type ?? audio[0].mimeType ?? 'audio/mpeg';
  if (!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'].includes(mime)) throw Error('The music service returned an unsupported audio format.');
  return {bytes, mime, providerLyrics: blocks.filter(b=>b.type==='text').map(b=>b.text??'').join('\n').slice(0,12000)};
}
