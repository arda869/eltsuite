import { LinkMark, prosodyAttrs } from '../editor/Prosody';
import { glabelAttrs } from '../editor/Symbols';
import '../lib/extras.css';

// The homepage sentence, marked with the same pronunciation and grammar marks teachers add in a
// lesson (Prosody.tsx, Symbols.tsx).
const sd = (k: string, s: string, text: string) => <span {...prosodyAttrs('speechSound', { k, s })}>{text}</span>;

export function LanguageMoment() {
  return (
    <p className="pub-lang-sentence" lang="en-GB" aria-label="Good teaching is worth sharing.">
      <span aria-hidden="true">
        <span className="pub-lang-keep"><span {...glabelAttrs({ text: 'Adj.', at: 'above', tone: 'accent', shape: 'plain' })}>Goo{sd('drop', 'cross', 'd')}</span><LinkMark k="link" s="under" />teaching</span>{' '}
        <span className="pub-lang-keep">{sd('schwa', 'top', 'i')}s <span className="pub-lang-link">worth<LinkMark k="link" s="under" />sharing.</span></span>
      </span>
    </p>
  );
}
