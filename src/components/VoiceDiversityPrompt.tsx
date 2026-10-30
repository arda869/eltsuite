import { useState } from 'react';
import './voice-diversity.css';

/** A teacher-only planning prompt; never part of the learner's lesson content. */
export function VoiceDiversityPrompt() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <aside className="voice-diversity" aria-label="Listening design tip">
    <span className="voice-diversity-mark" aria-hidden="true">Aa</span>
    <div>
      <span className="voice-diversity-kicker">ENGLISH IN THE WORLD</span>
      <p className="voice-diversity-title">Have you considered adding non-native voices to your listening recordings?</p>
      <p>The British Council notes that most English conversations worldwide are between non-native speakers. Include a mix of accents to help learners prepare for real conversations. <a href="https://www.britishcouncil.org.eg/en/blog/learn-speak-english" target="_blank" rel="noreferrer" aria-label="Read why — British Council (opens in a new tab)">Read why ↗</a></p>
    </div>
    <button type="button" className="voice-diversity-dismiss" aria-label="Dismiss listening design tip" onClick={() => setDismissed(true)}>×</button>
  </aside>;
}
