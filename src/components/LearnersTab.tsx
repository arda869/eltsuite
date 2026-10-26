import { tr } from '../lib/terms';
import { ask, tell } from '../lib/ask';
import { openAsLearner } from '../lib/proxy';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addLearners, removeLearner, resetPin, type Learner } from '../lib/learners';
import { LANGUAGES, saveLearnerLangs } from '../lib/langs';
import type { ClassDoc } from '../lib/classes';
import { initials } from './TopBar';
import type { Item } from '../lib/classes';
import { isOnline, usePresence } from '../lib/presence';
import { ago } from '../lib/activity';
import { LearnerDetail } from './LearnerDetail';

export function LearnersTab({ c, learners, pins, own = {}, items = [], openId = '', onOpen }: { c: ClassDoc; learners: Learner[]; pins: Record<string, string>; own?: Record<string, string>; items?: Item[]; openId?: string; onOpen?: (id: string) => void }) {
  const presence = usePresence(c.id);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const sorted = [...learners]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .filter((l) => l.displayName.toLowerCase().includes(search.trim().toLowerCase()));

  const opened = learners.find((l) => l.id === openId);
  if (opened) return <LearnerDetail key={opened.id} c={c} learner={opened} items={items} pin={pins[opened.id]} onBack={() => onOpen?.('')} />;

  async function add(e: FormEvent) {
    e.preventDefault();
    const list = names.split('\n').map((n) => n.trim()).filter(Boolean);
    const existing = new Set(learners.map((l) => l.displayName.toLowerCase()));
    const dupes = list.filter((n) => existing.has(n.toLowerCase()));
    if (dupes.length) return setError(`Already in the class: ${dupes.join(', ')}. Use a surname initial to tell them apart.`);
    if (list.length > 40) return setError(tr('Please add up to 40 learners at a time.'));
    setBusy('add');
    setError('');
    try {
      await addLearners(c, list);
      setNames('');
      setAdding(false);
    } catch (err) {
      console.error(err);
      setError(tr('Some learners could not be added. Please check the list and try again.'));
    } finally {
      setBusy('');
    }
  }

  async function reset(l: Learner) {
    if (!(await ask(`Give ${l.displayName} a new PIN? The old one will stop working.`))) return;
    setBusy(l.id);
    setError('');
    try {
      await resetPin(c, l, pins[l.id] ?? '');
      setShown((s) => ({ ...s, [l.id]: true }));
    } catch (err) {
      console.error(err);
      setError(`The PIN for ${l.displayName} could not be reset.`);
    } finally {
      setBusy('');
    }
  }

  async function remove(l: Learner) {
    if (!(await ask(`Remove ${l.displayName} from ${c.name}? Their sign-in will stop working.`))) return;
    setBusy(l.id);
    try {
      await removeLearner(c, l, pins[l.id] ?? '');
    } catch (err) {
      console.error(err);
      setError(`${l.displayName} could not be removed.`);
    } finally {
      setBusy('');
    }
  }

  function printCards() {
    const rows = sorted
      .map(
        (l) =>
          `<div class="pc"><div class="n">${l.displayName.replace(/</g, '&lt;')}</div><div class="k">Class code</div><div class="v">${c.classCode}</div><div class="k">PIN</div><div class="v">${pins[l.id] ?? '—'}</div><div class="u">${window.location.origin}/join</div></div>`,
      )
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><title>PIN cards · ${c.name}</title><style>
      body{font-family:Karla,system-ui,sans-serif;margin:24px;color:#33302c}
      h1{font:500 18px Georgia,serif;margin:0 0 16px}
      .g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .pc{border:1px dashed #bbb;border-radius:10px;padding:14px;break-inside:avoid}
      .n{font:600 16px Georgia,serif;margin-bottom:8px}.k{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#868686}
      .v{font-size:18px;font-weight:600;letter-spacing:.12em;margin-bottom:6px}.u{font-size:11px;color:#737373}
    </style><h1>${c.name.replace(/</g, '&lt;')} · Lesson Lit sign-in</h1><div class="g">${rows}</div><script>window.onload=()=>window.print()</script>`);
    w.document.close();
  }

  return (
    <div className="learners">
      <div className="row-between">
        <input className="search" type="search" placeholder={tr('Search learners')} aria-label={tr('Search learners')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          {learners.length > 0 && (
            <button className="btn" onClick={printCards}>
              Print PIN cards
            </button>
          )}
          <button className="btn primary" onClick={() => setAdding(true)}>
            + Add learners
          </button>
        </div>
      </div>

      {error && <span className="error" role="alert">{error}</span>}

      <div className="learners-body">
        <div className="table-wrap">
          {learners.length === 0 ? (
            <p className="sub" style={{ margin: '8px 0' }}>
              No learners yet. Add their names and each one gets a PIN. They sign in with the class code <strong>{c.classCode}</strong>, their name and the PIN.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{tr('Learner')}</th>
                  <th>Languages</th>
                  <th>PIN</th>
                  <th>
                    <span className="sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {(() => {
                        const p = presence.find((x) => x.id === l.authUid);
                        const on = p ? isOnline(p) : false;
                        const at = p?.at?.toMillis?.() ?? 0;
                        return (
                          <button type="button" className="who-cell who-open" onClick={() => onOpen?.(l.id)} title={`See ${l.displayName.split(' ')[0]}’s activity`}>
                            <span className="avatar small" aria-hidden="true">
                              {initials(l.displayName)}
                              {on && <i className="who-on" />}
                            </span>
                            <span className="who-name">
                              {l.displayName}
                              <span className="hint">{on ? 'Online now' : at ? `Active ${ago(at)}` : 'Offline'}</span>
                            </span>
                          </button>
                        );
                      })()}
                    </td>
                    <td>
                      <LangChips classId={c.id} learner={l} all={learners} />
                    </td>
                    <td>
                      {own[l.id] ? (
                        <span className="hint" title={tr('The learner chose their own, so you cannot see or reset it. If they forget it, resetting needs the Phase 5 server; removing and re-adding them starts a new account without their work.')}>
                          Own {own[l.id]}, private
                        </span>
                      ) : (
                        <span className="pin-cell">
                          <span className={shown[l.id] ? 'pin' : 'pin masked'}>{shown[l.id] ? pins[l.id] ?? '—' : '••••'}</span>
                          <button type="button" className="btn link small" onClick={() => setShown((s) => ({ ...s, [l.id]: !s[l.id] }))}>
                            {shown[l.id] ? 'Hide' : 'Show'}
                          </button>
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn small-btn" disabled={!pins[l.id]} title={tr('Open a new tab signed in as this learner')} onClick={() => openAsLearner({ classId: c.id, classCode: c.classCode, learnerId: l.id, name: l.displayName, pin: pins[l.id] ?? '' }) || void tell('Your browser blocked the new tab. Allow pop-ups for this site.')}>
                        View as {l.displayName.split(' ')[0]}
                      </button>{' '}
                      <button className="btn small-btn" disabled={busy === l.id || !!own[l.id]} title={own[l.id] ? tr('The learner set their own, so it can only be changed by them') : undefined} onClick={() => reset(l)}>
                        {busy === l.id ? 'Working…' : 'Reset PIN'}
                      </button>{' '}
                      <button className="btn link small" disabled={busy === l.id} onClick={() => remove(l)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {(adding || learners.length === 0) && (
          <form className="side-form" onSubmit={add}>
            <div className="row-between">
              <h2>{tr('Add learners')}</h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setAdding(false)}>
                ×
              </button>
            </div>
            <label className="field">
              One name per line
              <textarea rows={6} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Sofia Rossi\nTariq Aziz'} />
            </label>
            <span className="hint">{tr('Each learner gets a 4-digit PIN. They sign in with the class code, their name and the PIN. No email needed.')}</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy === 'add' || !names.trim()}>
                {busy === 'add' ? 'Adding…' : tr(`Add ${names.split('\n').filter((n) => n.trim()).length || ''} learners`).replace('  ', ' ')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// The languages a learner speaks, as chips. Used for translations in dictionary entries.
function LangChips({ classId, learner, all }: { classId: string; learner: Learner; all: Learner[] }) {
  const langs = learner.langs ?? [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const used = [...new Set(all.flatMap((l) => l.langs ?? []))];
  const save = (next: string[]) => void saveLearnerLangs(classId, learner.id, next, all).catch(() => tell('The languages could not be saved.'));
  const add = (v: string) => {
    const t = v.trim().replace(/^./, (c) => c.toUpperCase());
    if (t && !langs.includes(t)) save([...langs, t]);
    setQ('');
  };
  const options = [...used.filter((u) => !LANGUAGES.includes(u)), ...LANGUAGES].filter((x) => !langs.includes(x) && x.toLowerCase().startsWith(q.trim().toLowerCase()));
  const top = [...used.filter((u) => !langs.includes(u)), ...options.filter((o) => !used.includes(o))].filter((x) => x.toLowerCase().startsWith(q.trim().toLowerCase())).slice(0, 8);
  return (
    <span className="lang-chips" ref={ref}>
      {langs.map((x) => (
        <span key={x} className="lang-chip">
          {x}
          <button type="button" aria-label={`Remove ${x}`} onClick={() => save(langs.filter((y) => y !== x))}>
            ×
          </button>
        </span>
      ))}
      <button type="button" className="lang-add" onClick={() => setOpen((o) => !o)} aria-label={`Add a language for ${learner.displayName}`} title="Add a language they speak">
        +
      </button>
      {open && (
        <span className="lang-pop">
          <input autoFocus value={q} placeholder="Language" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' && (e.preventDefault(), add(top[0] ?? q)), e.key === 'Escape' && setOpen(false))} aria-label="Language" />
          <span className="lang-opts">
            {top.map((o) => (
              <button key={o} type="button" className={used.includes(o) ? 'in-class' : ''} onClick={() => add(o)}>
                {o}
              </button>
            ))}
          </span>
          <span className="hint">{tr('Dictionary entries in this class can then have a translation in each language. Learners see their own.')}</span>
        </span>
      )}
    </span>
  );
}
