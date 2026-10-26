import { openAsLearner } from '../lib/proxy';
import { useState, type FormEvent } from 'react';
import { addLearners, removeLearner, resetPin, type Learner } from '../lib/learners';
import type { ClassDoc } from '../lib/classes';
import { initials } from './TopBar';

export function LearnersTab({ c, learners, pins }: { c: ClassDoc; learners: Learner[]; pins: Record<string, string> }) {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(learners.length === 0);
  const [names, setNames] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const sorted = [...learners]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .filter((l) => l.displayName.toLowerCase().includes(search.trim().toLowerCase()));

  async function add(e: FormEvent) {
    e.preventDefault();
    const list = names.split('\n').map((n) => n.trim()).filter(Boolean);
    const existing = new Set(learners.map((l) => l.displayName.toLowerCase()));
    const dupes = list.filter((n) => existing.has(n.toLowerCase()));
    if (dupes.length) return setError(`Already in the class: ${dupes.join(', ')}. Use a surname initial to tell them apart.`);
    if (list.length > 40) return setError('Please add up to 40 learners at a time.');
    setBusy('add');
    setError('');
    try {
      await addLearners(c, list);
      setNames('');
      setAdding(false);
    } catch (err) {
      console.error(err);
      setError('Some learners could not be added. Please check the list and try again.');
    } finally {
      setBusy('');
    }
  }

  async function reset(l: Learner) {
    if (!window.confirm(`Give ${l.displayName} a new PIN? The old one will stop working.`)) return;
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
    if (!window.confirm(`Remove ${l.displayName} from ${c.name}? Their sign-in will stop working.`)) return;
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
        <input className="search" type="search" placeholder="Search learners" aria-label="Search learners" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <th>Learner</th>
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
                      <span className="who-cell">
                        <span className="avatar small" aria-hidden="true">
                          {initials(l.displayName)}
                        </span>
                        {l.displayName}
                      </span>
                    </td>
                    <td>
                      <span className="pin-cell">
                        <span className={shown[l.id] ? 'pin' : 'pin masked'}>{shown[l.id] ? pins[l.id] ?? '—' : '••••'}</span>
                        <button type="button" className="btn link small" onClick={() => setShown((s) => ({ ...s, [l.id]: !s[l.id] }))}>
                          {shown[l.id] ? 'Hide' : 'Show'}
                        </button>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn small-btn" disabled={!pins[l.id]} title="Open a new tab signed in as this learner" onClick={() => openAsLearner({ classId: c.id, classCode: c.classCode, learnerId: l.id, name: l.displayName, pin: pins[l.id] ?? '' }) || window.alert('Your browser blocked the new tab. Allow pop-ups for this site.')}>
                        View as {l.displayName.split(' ')[0]}
                      </button>{' '}
                      <button className="btn small-btn" disabled={busy === l.id} onClick={() => reset(l)}>
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

        {adding && (
          <form className="side-form" onSubmit={add}>
            <div className="row-between">
              <h2>Add learners</h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setAdding(false)}>
                ×
              </button>
            </div>
            <label className="field">
              One name per line
              <textarea rows={6} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Sofia Rossi\nTariq Aziz'} />
            </label>
            <span className="hint">Each learner gets a 4-digit PIN. They sign in with the class code, their name and the PIN. No email needed.</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy === 'add' || !names.trim()}>
                {busy === 'add' ? 'Adding…' : `Add ${names.split('\n').filter((n) => n.trim()).length || ''} learners`.replace('  ', ' ')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
