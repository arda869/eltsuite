import WebSocket from 'ws';
import { speechInstructions } from './contract.js';

// One session per utterance keeps speakers' voices independent. PCM is returned without
// lossy encoding; the editor resamples to its project rate and encodes only when saving.
export function generateSpeech(key, request, { Socket = WebSocket, timeout = 85000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Socket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini', { headers: { Authorization: `Bearer ${key}` } });
    let finished = false, requested = false, bytes = 0, transcript = '';
    const chunks = [];
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(Error('Speech generation timed out. Try a shorter line.')), timeout);
    socket.on('error', () => finish(Error('The voice service could not connect. Please try again.')));
    socket.on('close', () => { if (!finished) finish(Error('The voice connection ended before the take was ready.')); });
    socket.on('message', raw => {
      try {
        const event = JSON.parse(raw.toString());
        if (event.type === 'session.created') socket.send(JSON.stringify({ type: 'session.update', session: {
          type: 'realtime', output_modalities: ['audio'], instructions: speechInstructions(request),
          audio: { input: { turn_detection: null }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: request.voice } },
        } }));
        if (event.type === 'session.updated' && !requested) {
          requested = true;
          socket.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Perform only this script:\n${request.text}` }] } }));
          socket.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['audio'], max_output_tokens: 2048 } }));
        }
        if (event.type === 'response.output_audio.delta') {
          const chunk = Buffer.from(event.delta, 'base64');
          bytes += chunk.length;
          if (bytes > 2_880_000) return finish(Error('That take is too long. Split it into shorter utterances.'));
          chunks.push(chunk);
        }
        if (event.type === 'response.output_audio_transcript.done') transcript = event.transcript ?? '';
        if (event.type === 'error') return finish(Error('The voice service rejected this take. Please try again later.'));
        if (event.type === 'response.done') {
          if (event.response?.status !== 'completed' || bytes < 4800 || bytes % 2) return finish(Error('The voice service did not finish this take. Try a shorter line.'));
          finish(null, { pcm: Buffer.concat(chunks).toString('base64'), rate: 24000, transcript });
        }
      } catch { finish(Error('The voice service returned an unreadable take. Please try again.')); }
    });
  });
}
