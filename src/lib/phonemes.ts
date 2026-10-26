// The sounds of English, for the phonemic chart and the sound cards. Laid out the way the
// classic teaching chart arranges them: vowels by where the tongue is (front to back, close to
// open), then diphthongs, then consonants in voiceless and voiced pairs.

export type Accent = 'RP' | 'GA';
export type Kind = 'mono' | 'diph' | 'cons';
export type Phoneme = {
  id: string; // a safe key for recordings
  sym: string;
  kind: Kind;
  ex: string; // example word, with the sound in capitals
  // Consonants
  place?: string;
  manner?: string;
  voiced?: boolean;
  // Vowels: height 0 (close) to 3 (open), back 0 (front) to 2 (back)
  height?: number;
  back?: number;
  round?: boolean;
  long?: boolean;
  to?: [number, number]; // diphthongs: where the glide ends (height, back)
  toRound?: boolean;
};

const C = (id: string, sym: string, ex: string, place: string, manner: string, voiced: boolean): Phoneme => ({ id, sym, kind: 'cons', ex, place, manner, voiced });
const V = (id: string, sym: string, ex: string, height: number, back: number, round = false, long = false): Phoneme => ({ id, sym, kind: 'mono', ex, height, back, round, long });
const D = (id: string, sym: string, ex: string, from: [number, number], to: [number, number], round = false, toRound = false): Phoneme => ({ id, sym, kind: 'diph', ex, height: from[0], back: from[1], to, round, toRound });

const CONSONANTS: Phoneme[] = [
  C('p', 'p', 'Pea', 'bilabial', 'plosive', false),
  C('b', 'b', 'Boat', 'bilabial', 'plosive', true),
  C('t', 't', 'Tea', 'alveolar', 'plosive', false),
  C('d', 'd', 'Dog', 'alveolar', 'plosive', true),
  C('ch', 'tʃ', 'CHeese', 'postalveolar', 'affricate', false),
  C('j_', 'dʒ', 'June', 'postalveolar', 'affricate', true),
  C('k', 'k', 'Car', 'velar', 'plosive', false),
  C('g', 'g', 'Go', 'velar', 'plosive', true),
  C('f', 'f', 'Fly', 'labiodental', 'fricative', false),
  C('v', 'v', 'Video', 'labiodental', 'fricative', true),
  C('th', 'θ', 'THink', 'dental', 'fricative', false),
  C('dh', 'ð', 'THis', 'dental', 'fricative', true),
  C('s', 's', 'See', 'alveolar', 'fricative', false),
  C('z', 'z', 'Zoo', 'alveolar', 'fricative', true),
  C('sh', 'ʃ', 'SHall', 'postalveolar', 'fricative', false),
  C('zh', 'ʒ', 'televiSion', 'postalveolar', 'fricative', true),
  C('m', 'm', 'Man', 'bilabial', 'nasal', true),
  C('n', 'n', 'Now', 'alveolar', 'nasal', true),
  C('ng', 'ŋ', 'siNG', 'velar', 'nasal', true),
  C('h', 'h', 'Hat', 'glottal', 'fricative', false),
  C('l', 'l', 'Love', 'alveolar', 'lateral approximant', true),
  C('r', 'r', 'Red', 'postalveolar', 'approximant', true),
  C('w', 'w', 'Wet', 'labial-velar', 'approximant', true),
  C('y', 'j', 'Yes', 'palatal', 'approximant', true),
];

export const CHARTS: Record<Accent, { name: string; vowels: Phoneme[][]; diphs: Phoneme[][]; cons: Phoneme[][] }> = {
  RP: {
    name: 'British (RP)',
    vowels: [
      [V('iy', 'iː', 'shEEp', 0, 0, false, true), V('i', 'ɪ', 'shIp', 0.6, 0.3), V('u', 'ʊ', 'bOOk', 0.6, 1.7, true), V('uw', 'uː', 'shOOt', 0, 2, true, true)],
      [V('e', 'e', 'lEft', 1.6, 0.1), V('schwa', 'ə', 'teachER', 1.6, 1), V('er', 'ɜː', 'bIRd', 1.6, 1, false, true), V('aw', 'ɔː', 'dOOR', 1.7, 2, true, true)],
      [V('ae', 'æ', 'hAt', 2.6, 0.2), V('uh', 'ʌ', 'Up', 2.3, 1.3), V('ar', 'ɑː', 'fAR', 3, 2, false, true), V('o', 'ɒ', 'On', 3, 2, true)],
    ],
    diphs: [
      [D('ia', 'ɪə', 'hERE', [0.6, 0.3], [1.6, 1]), D('ei', 'eɪ', 'wAIt', [1.6, 0.1], [0.6, 0.3])],
      [D('ua', 'ʊə', 'tOURist', [0.6, 1.7], [1.6, 1], true), D('oi', 'ɔɪ', 'bOY', [1.7, 2], [0.6, 0.3], true), D('ou', 'əʊ', 'shOW', [1.6, 1], [0.6, 1.7], false, true)],
      [D('ea', 'eə', 'wEAR', [1.6, 0.1], [1.6, 1]), D('ai', 'aɪ', 'mY', [3, 0.6], [0.6, 0.3]), D('au', 'aʊ', 'cOW', [3, 0.6], [0.6, 1.7], false, true)],
    ],
    cons: [CONSONANTS.slice(0, 8), CONSONANTS.slice(8, 16), CONSONANTS.slice(16, 24)],
  },
  GA: {
    name: 'American (GA)',
    vowels: [
      [V('iy', 'i', 'shEEp', 0, 0, false, true), V('i', 'ɪ', 'shIp', 0.6, 0.3), V('u', 'ʊ', 'bOOk', 0.6, 1.7, true), V('uw', 'u', 'shOOt', 0, 2, true, true)],
      [V('e', 'ɛ', 'lEft', 1.8, 0.1), V('schwa', 'ə', 'Ago', 1.6, 1), V('er', 'ɝ', 'bIRd', 1.6, 1, false, true), V('aw', 'ɔ', 'thOUGHt', 1.8, 2, true, true)],
      [V('ae', 'æ', 'hAt', 2.6, 0.2), V('uh', 'ʌ', 'Up', 2.3, 1.3), V('ar', 'ɑ', 'fAther', 3, 2, false, true)],
    ],
    diphs: [
      [D('ei', 'eɪ', 'wAIt', [1.4, 0.1], [0.6, 0.3])],
      [D('oi', 'ɔɪ', 'bOY', [1.8, 2], [0.6, 0.3], true), D('ou', 'oʊ', 'shOW', [1.4, 2], [0.6, 1.7], true, true)],
      [D('ai', 'aɪ', 'mY', [3, 0.6], [0.6, 0.3]), D('au', 'aʊ', 'cOW', [3, 0.6], [0.6, 1.7], false, true)],
    ],
    cons: [CONSONANTS.slice(0, 8), CONSONANTS.slice(8, 16), CONSONANTS.slice(16, 24)],
  },
};

export const allSounds = (a: Accent) => [...CHARTS[a].vowels.flat(), ...CHARTS[a].diphs.flat(), ...CHARTS[a].cons.flat()];
export const findSound = (a: Accent, id: string) => allSounds(a).find((p) => p.id === id) ?? allSounds('RP').find((p) => p.id === id);

export const KIND_NAME: Record<Kind, string> = { mono: 'Single vowel', diph: 'Diphthong', cons: 'Consonant' };

// How the sound is made, in words learners understand.
export function howMade(p: Phoneme): string[] {
  if (p.kind === 'cons') {
    const where: Record<string, string> = {
      bilabial: 'Both lips come together.',
      labiodental: 'The top teeth touch the bottom lip.',
      dental: 'The tongue tip touches the top teeth.',
      alveolar: 'The tongue tip touches the ridge behind the top teeth.',
      postalveolar: 'The tongue is just behind the ridge behind the top teeth.',
      palatal: 'The middle of the tongue rises to the hard roof of the mouth.',
      velar: 'The back of the tongue touches the soft back of the roof of the mouth.',
      'labial-velar': 'The lips round and the back of the tongue rises.',
      glottal: 'The air passes through the open throat.',
    };
    const how: Record<string, string> = {
      plosive: 'The air stops, then bursts out.',
      affricate: 'The air stops, then comes out with friction.',
      fricative: 'The air squeezes through a narrow gap.',
      nasal: 'The air comes out through the nose.',
      approximant: 'The air flows freely between the tongue and the roof of the mouth.',
      'lateral approximant': 'The air flows round the sides of the tongue.',
    };
    return [where[p.place!] ?? '', how[p.manner!] ?? '', p.voiced ? 'Voiced: the voice is on. Touch your throat and feel it buzz.' : 'Voiceless: only air, no voice.'].filter(Boolean);
  }
  const h = (n: number) => (n < 0.8 ? 'high' : n < 2 ? 'in the middle' : 'low');
  const b = (n: number) => (n < 0.6 ? 'at the front' : n < 1.5 ? 'in the centre' : 'at the back');
  const lips = (r?: boolean) => (r ? 'rounded' : 'relaxed or spread');
  if (p.kind === 'mono') return [`The tongue is ${h(p.height!)} and ${b(p.back!)} of the mouth.`, `The lips are ${lips(p.round)}.`, p.long ? 'A long sound.' : 'A short sound.'];
  return [`Two sounds in one: start ${h(p.height!)} and ${b(p.back!)}, then glide ${h(p.to![0])} and ${b(p.to![1])}.`, `The lips start ${lips(p.round)} and end ${lips(p.toRound)}.`];
}
