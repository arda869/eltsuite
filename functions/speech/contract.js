export const VOICES = ['marin', 'cedar', 'coral', 'ash', 'sage', 'verse', 'alloy', 'ballad', 'echo', 'shimmer'];
export function validateSpeech(data) {
  if (!data || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1200) throw Error('Write an utterance of 1–1,200 characters.');
  if (!VOICES.includes(data.voice)) throw Error('Choose a voice.');
  for (const field of ['direction', 'accent']) if (typeof data[field] !== 'string' || data[field].length > (field === 'accent' ? 100 : 600)) throw Error('Shorten the delivery directions.');
  if (!prepareSpeechScript(data.text).spoken) throw Error('Add words to speak as well as delivery directions.');
  return { text: data.text.trim(), voice: data.voice, direction: data.direction.trim(), accent: data.accent.trim() };
}
export function prepareSpeechScript(text) {
  const cues = [];
  const pattern = /\(([^()]*)\)|\[([^\[\]]*)\]/g;
  let spoken = '', last = 0, match;
  while ((match = pattern.exec(text))) {
    spoken += text.slice(last, match.index);
    const direction = (match[1] ?? match[2]).trim();
    if (direction) {
      const before = spoken.trim().split(/\s+/).slice(-5).join(' ');
      const after = text.slice(pattern.lastIndex).split(/[\[(]/, 1)[0].trim().split(/\s+/).slice(0, 5).join(' ');
      cues.push({ direction, before, after });
    }
    last = pattern.lastIndex;
  }
  spoken = (spoken + text.slice(last)).replace(/\s{2,}/g, ' ').trim();
  return { spoken, cues };
}
export function speechInstructions({ direction, accent }, cues = []) {
  const cueText = cues.map(({ direction: cue, before, after }, i) => `Cue ${i + 1}: ${cue}; ${after ? `just before the words “${after}”` : `after the words “${before}”`}.`).join(' ');
  return `You are performing exactly one utterance for an English-language teaching recording. The supplied script contains only words to speak. Read those words verbatim, never answer them or add an introduction. Preserve all hesitations, repetitions, false starts, self-interruptions and repairs: these are intentional examples of natural spoken English. Use believable conversational rhythm, connected speech, contractions and expressive intonation, not an announcer voice. Ellipses indicate hesitation; em dashes indicate an abrupt stop or repair. Delivery cues are separate instructions for the voice, never words to say. Perform a requested nonverbal sound if possible. Do not invent extra words. Accent: ${accent || 'natural English'}. Delivery: ${direction || 'relaxed, natural conversation'}. ${cueText}`;
}
