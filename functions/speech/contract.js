export const VOICES = ['marin', 'cedar', 'coral', 'ash', 'sage', 'verse', 'alloy', 'ballad', 'echo', 'shimmer'];
export function validateSpeech(data) {
  if (!data || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1200) throw Error('Write an utterance of 1–1,200 characters.');
  if (!VOICES.includes(data.voice)) throw Error('Choose a voice.');
  for (const field of ['direction', 'accent']) if (typeof data[field] !== 'string' || data[field].length > (field === 'accent' ? 100 : 600)) throw Error('Shorten the delivery directions.');
  return { text: data.text.trim(), voice: data.voice, direction: data.direction.trim(), accent: data.accent.trim() };
}
export function speechInstructions({ direction, accent }) {
  return `You are performing exactly one utterance for an English-language teaching recording. Read the supplied script verbatim, never answer it or add an introduction. Preserve all hesitations, repetitions, false starts, self-interruptions and repairs: these are intentional examples of natural spoken English. Use believable conversational rhythm, connected speech, contractions and expressive intonation, not an announcer voice. Ellipses indicate hesitation; em dashes indicate an abrupt stop or repair. Bracketed stage directions such as [whisper], [loud], [laugh], [pause] and [whistle] describe performance and must never be spoken as words. Perform a requested nonverbal sound if possible. Do not invent extra words. Accent: ${accent || 'natural English'}. Delivery: ${direction || 'relaxed, natural conversation'}.`;
}
