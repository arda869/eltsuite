import { Intonation, SentenceStress, SpeechLink, SpeechSound } from './Prosody';
import { GrammarLabel } from './Symbols';
import { Subst } from './Subst';
import { PhonCardNode, PhonChartNode } from './Phonemes';

// The language teaching marks, for every editor: pronunciation, grammar labels and substitution slots.
export const LANG_MARKS = [SentenceStress, Intonation, SpeechSound, SpeechLink, GrammarLabel, Subst, PhonChartNode, PhonCardNode];
