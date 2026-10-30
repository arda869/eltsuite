import { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { BUBBLES, FACES, PEOPLE, POSES, PersonArt, Sketch, THINGS, faceBox } from '../storyboard/art';

// The storyboard library: every person, pose, face, thing and speech bubble there is so far, in the
// accent colour. Storyboards are made from these.

const ACCENTS = ['#d98f63', '#3667a6', '#2f7a5a', '#7a4fa3', '#a8473a', '#3b7f7a'];
type Tab = 'people' | 'things' | 'bubbles';

export function StoryboardLibrary() {
  const [tab, setTab] = useState<Tab>('people');
  const [who, setWho] = useState('maya');
  const [face, setFace] = useState('happy');
  const [accent, setAccent] = useState('');
  const groups = [...new Set(Object.values(THINGS).map((t) => t.group))];
  return (
    <div className="shell">
      <TopBar />
      <main className="sbl" style={accent ? { ['--sb-accent' as string]: accent } : undefined}>
        <header className="sbl-head">
          <div>
            <h1>Storyboard library</h1>
            <p className="hint">The people, things and speech bubbles for storyboards. Everything is drawn in grey and one colour: your class colour. Change the colour and every picture changes with it.</p>
          </div>
          <span className="sbl-accents" role="radiogroup" aria-label="Colour">
            <button type="button" role="radio" aria-checked={!accent} className={'sbl-acc' + (!accent ? ' on' : '')} style={{ background: 'var(--accent)' }} onClick={() => setAccent('')} aria-label="Your colour" data-tip="Your colour" />
            {ACCENTS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={accent === a} className={'sbl-acc' + (accent === a ? ' on' : '')} style={{ background: a }} onClick={() => setAccent(a)} aria-label={`Colour ${a}`} />
            ))}
          </span>
        </header>
        <span className="sh-switch sbl-tabs" role="tablist" aria-label="What to show">
          {(['people', 'things', 'bubbles'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'people' ? 'People' : t === 'things' ? 'Things' : 'Speech bubbles and labels'}
            </button>
          ))}
        </span>

        {tab === 'people' && (
          <>
            <section className="sbl-sec" aria-label="People">
              <h2>People</h2>
              <div className="sbl-grid">
                {Object.entries(PEOPLE).map(([k, p]) => (
                  <button key={k} type="button" className={'sbl-card' + (who === k ? ' on' : '')} onClick={() => setWho(k)} aria-pressed={who === k}>
                    <svg viewBox="0 0 200 300" width="110" height="165" aria-hidden="true">
                      <Sketch id={'sbl-p-' + k}>
                        <PersonArt who={k} p="stand" face="happy" />
                      </Sketch>
                    </svg>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="sbl-sec" aria-label={`${PEOPLE[who].name}: faces`}>
              <h2>{PEOPLE[who].name}: faces</h2>
              <div className="sbl-grid">
                {Object.entries(FACES).map(([k, f]) => (
                  <button key={k} type="button" className={'sbl-card face' + (face === k ? ' on' : '')} onClick={() => setFace(k)} aria-pressed={face === k}>
                    <svg viewBox={faceBox(who)} width="84" height="84" aria-hidden="true">
                      <Sketch id={'sbl-f-' + k}>
                        <PersonArt who={who} p="stand" face={k} />
                      </Sketch>
                    </svg>
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="sbl-sec" aria-label={`${PEOPLE[who].name}: poses`}>
              <h2>{PEOPLE[who].name}: poses</h2>
              <div className="sbl-grid">
                {Object.entries(POSES).map(([k, ps]) => (
                  <div key={k} className="sbl-card">
                    <svg viewBox="0 0 200 300" width="110" height="165" aria-hidden="true">
                      <Sketch id={'sbl-o-' + k}>
                        <PersonArt who={who} p={k} face={face} />
                      </Sketch>
                    </svg>
                    <span>{ps.name}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'things' &&
          groups.map((g) => (
            <section key={g} className="sbl-sec" aria-label={g}>
              <h2>{g}</h2>
              <div className="sbl-grid">
                {Object.entries(THINGS)
                  .filter(([, t]) => t.group === g)
                  .map(([k, t]) => (
                    <div key={k} className="sbl-card">
                      <svg viewBox="0 0 200 200" width="96" height="96" aria-hidden="true">
                        <Sketch id={'sbl-t-' + k}>{t.draw()}</Sketch>
                      </svg>
                      <span>{t.name}</span>
                    </div>
                  ))}
              </div>
            </section>
          ))}

        {tab === 'bubbles' && (
          <section className="sbl-sec" aria-label="Speech bubbles and labels">
            <h2>Speech bubbles and labels</h2>
            <div className="sbl-grid">
              {Object.entries(BUBBLES).map(([k, b]) => (
                <div key={k} className="sbl-card wide">
                  <svg viewBox="-6 -6 172 140" width="160" height="130" aria-hidden="true">
                    <Sketch id={'sbl-b-' + k}>{b.draw(160, 90)}</Sketch>
                  </svg>
                  <span>{b.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <p className="hint sbl-foot">Next: storyboards to make with these, in Resources, inside lessons, Collab and messages, and to work on together.</p>
      </main>
    </div>
  );
}
