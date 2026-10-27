import { useState } from 'react';
import { ProfileIcon } from '../../components/ProfileIcons';
import { UiIcon } from '../../components/UiIcon';
import { useTeacherProfile, type Org } from '../../lib/admin';
import { ask } from '../../lib/ask';
import type { Chat, Person as ChatPerson } from '../../lib/chat';
import { removeColleague } from '../../lib/sharing';
import { statusOf, type Status } from '../../lib/status';
import { answersOf, since, type Mate, type Thing } from './book';
import { Face, Reach, ThingRow } from './parts';

type Tab = 'theirs' | 'mine' | 'classes';

// One colleague: who they are, how to reach them, and what passes between you.
export function Person({ m, st, chat, me, org, uid, between, onBack, onGone }: { m: Mate; st?: Status; chat?: Chat; me: ChatPerson; org: Org | null; uid: string; between: { theirs: Thing[]; mineTo: Thing[]; classes: Thing[]; loading: boolean }; onBack: () => void; onGone: () => void }) {
  const s = statusOf(st);
  const asks = !!org?.policy?.profiles && m.inOrg;
  const p = useTeacherProfile(asks ? m.id : undefined);
  const answers = answersOf(org, p);
  const lists: Record<Tab, Thing[]> = { theirs: between.theirs, mine: between.mineTo, classes: between.classes };
  const [tab, setTab] = useState<Tab>(() => (['theirs', 'mine', 'classes'] as Tab[]).find((k) => lists[k].length) ?? 'theirs');
  const TABS: { k: Tab; label: string; short: string; empty: string }[] = [
    { k: 'theirs', label: 'Shared with you', short: 'With you', empty: `Nothing from ${m.first} yet. What they share with you shows here.` },
    { k: 'mine', label: 'You shared', short: 'By you', empty: 'Nothing yet. Share a lesson from its menu on the class page, or a file from Files.' },
    { k: 'classes', label: 'Classes together', short: 'Classes', empty: `No classes together yet. Add a co-teacher in a class’s settings.` },
  ];
  const remove = async () => {
    if (!(await ask(`Remove ${m.name} from your colleagues? What you have shared stays shared until you stop sharing it.`, { ok: 'Remove' }))) return;
    await removeColleague(uid, m.id);
    onGone();
  };
  const long = answers.filter((a) => a.f.kind === 'long');
  const short = answers.filter((a) => a.f.kind === 'short');
  const lists2 = answers.filter((a) => a.f.kind === 'list');
  const years = (v: string) => (/^(19|20)\d\d$/.test(v.trim()) ? new Date().getFullYear() - Number(v.trim()) : 0);
  return (
    <article className="clg-person" aria-labelledby="clg-pname">
      <button type="button" className="clg-back" onClick={onBack}>
        <UiIcon name="prev" size={16} />
        Colleagues
      </button>
      <header className="clg-hero">
        <span className="clg-hero-art" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <Face m={m} size={96} st={st} />
        <span className="clg-hero-t">
          <span className="clg-kicker">{m.inOrg ? m.orgName : 'Colleague'}</span>
          <h2 id="clg-pname">{m.name}</h2>
          <span className="clg-hero-sub">{m.title || 'Teacher'}</span>
          <span className={'clg-status is-' + s.dot}>
            <span className={'pz-i pz-' + s.dot} aria-hidden="true" />
            {s.label}
          </span>
        </span>
        <Reach m={m} me={me} chat={chat} look="tiles" />
      </header>

      {asks && (
        <section className="clg-sec" aria-labelledby="clg-about">
          <h3 id="clg-about">About {m.first}</h3>
          {p === undefined ? (
            <span className="clg-skel clg-skel-text" aria-hidden="true" />
          ) : !answers.length ? (
            <p className="hint">{m.first} has not written a profile yet. Teachers in {m.orgName} fill it in from Settings.</p>
          ) : (
            <div className="clg-bio">
              {long.map(({ f, v }) => (
                <figure key={f.id} className="clg-quote">
                  <figcaption>{f.label}</figcaption>
                  <blockquote>{v}</blockquote>
                </figure>
              ))}
              {!!short.length && (
                <dl className="clg-facts">
                  {short.map(({ f, v }) => (
                    <div key={f.id} className="clg-fact">
                      <dt>
                        <span className="clg-fact-ic" aria-hidden="true">
                          <ProfileIcon name={f.icon} size={17} />
                        </span>
                        {f.label}
                      </dt>
                      <dd>
                        {v}
                        {years(v) > 0 && <span className="clg-fact-more"> · {years(v)} years</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {lists2.map(({ f, v }) => (
                <div key={f.id} className="clg-taglist">
                  <span className="clg-taglist-h">
                    <ProfileIcon name={f.icon} size={15} />
                    {f.label}
                  </span>
                  <ul className="clg-tags">
                    {v.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {!m.inOrg && (
        <section className="clg-sec" aria-labelledby="clg-how">
          <h3 id="clg-how">How you know each other</h3>
          <p className="clg-how">
            <UiIcon name="link" size={16} />
            <span>
              {m.since ? `Colleagues since ${since(m.since)}, through an invitation link.` : 'Colleagues through an invitation link.'}
              {m.email && <span className="clg-how-mail">{m.email}</span>}
            </span>
          </p>
        </section>
      )}

      <section className="clg-sec" aria-labelledby="clg-between">
        <h3 id="clg-between">Between you</h3>
        <div className="clg-tabs" role="tablist" aria-label="Between you">
          {TABS.map((t) => (
            <button key={t.k} type="button" role="tab" id={'clg-tab-' + t.k} aria-selected={tab === t.k} aria-controls="clg-tabpanel" aria-label={between.loading ? t.label : `${t.label}: ${lists[t.k].length}`} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>
              <span className="clg-tab-l">{t.label}</span>
              <span className="clg-tab-s" aria-hidden="true">
                {t.short}
              </span>
              <span className="clg-tab-n">{between.loading ? '·' : lists[t.k].length}</span>
            </button>
          ))}
        </div>
        <div id="clg-tabpanel" role="tabpanel" aria-labelledby={'clg-tab-' + tab} className="clg-tabpanel">
          {between.loading ? (
            <span className="clg-skel clg-skel-row" aria-hidden="true" />
          ) : lists[tab].length ? (
            <ul className="clg-things">
              {lists[tab].map((t) => (
                <ThingRow key={t.key} t={t} />
              ))}
            </ul>
          ) : (
            <p className="hint clg-none">{TABS.find((t) => t.k === tab)!.empty}</p>
          )}
        </div>
      </section>

      <footer className="clg-person-foot">
        {m.inOrg ? (
          <span className="hint">Everyone in {m.orgName} is a colleague of everyone else.</span>
        ) : (
          <button type="button" className="btn link small" onClick={() => void remove()}>
            Remove from colleagues
          </button>
        )}
      </footer>
    </article>
  );
}
