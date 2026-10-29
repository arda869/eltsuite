import { tr } from '../lib/terms';
import { LimitError } from '../lib/limitError';
import { openMenu } from './ContextMenu';
import { ask, tell } from '../lib/ask';
import { openAsLearner, openAsUser } from '../lib/proxy';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addLearners, removeLearner, resetPin, type Learner } from '../lib/learners';
import { LANGUAGES, saveLearnerLangs } from '../lib/langs';
import type { ClassDoc } from '../lib/classes';
import { initials } from './TopBar';
import type { Item } from '../lib/classes';
import { isOnline, usePresence } from '../lib/presence';
import { ago } from '../lib/activity';
import { LearnerDetail } from './LearnerDetail';
import { useAuth } from '../lib/auth';
import { useMyOrg, useSuper } from '../lib/admin';
import { openChat, sendMsg, type Chat } from '../lib/chat';

// manage: an organisation admin's view: add and remove learners and their PINs, nothing of their work.
export function LearnersTab({ c, learners, pins, own = {}, items = [], openId = '', onOpen, manage = false }: { c: ClassDoc; learners: Learner[]; pins: Record<string, string>; own?: Record<string, string>; items?: Item[]; openId?: string; onOpen?: (id: string) => void; manage?: boolean }) {
  const isSuper = !!useSuper();
  const presence = usePresence(manage ? '' : c.id);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { user, profile } = useAuth();
  const myOrg = useMyOrg();
  // A teacher training class in an organisation: its trainees are the organisation's teachers,
  // and others by name only when the organisation allows it.
  const org = c.kind === 'training' && c.org && myOrg?.id === c.org ? myOrg : null;
  const outsideOk = !org || !!org.policy?.externalTrainees;
  const inClass = new Set(learners.map((l) => l.teacherUid).filter(Boolean));
  const pickable = org ? Object.entries(org.teachers).filter(([uid]) => uid !== user?.uid && !inClass.has(uid)) : [];
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const nPicked = Object.values(picked).filter(Boolean).length;
  const nTyped = outsideOk ? names.split('\n').filter((n) => n.trim()).length : 0;

  const sorted = [...learners]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .filter((l) => l.displayName.toLowerCase().includes(search.trim().toLowerCase()));

  const opened = learners.find((l) => l.id === openId);
  if (opened) return <LearnerDetail key={opened.id} c={c} learner={opened} items={items} pin={pins[opened.id]} onBack={() => onOpen?.('')} />;

  async function add(e: FormEvent) {
    e.preventDefault();
    const chosen = pickable.filter(([uid]) => picked[uid]);
    const from = Object.fromEntries(chosen.map(([uid, t]) => [t.name || t.email, uid]));
    const list = [...(outsideOk ? names.split('\n').map((n) => n.trim()).filter(Boolean) : []), ...Object.keys(from)];
    const existing = new Set(learners.map((l) => l.displayName.toLowerCase()));
    const dupes = list.filter((n) => existing.has(n.toLowerCase()));
    if (dupes.length) return setError(`Already in the class: ${dupes.join(', ')}. Use a surname initial to tell them apart.`);
    if (list.length > 40) return setError(tr('Add up to 40 learners at a time.'));
    setBusy('add');
    setError('');
    try {
      const added = await addLearners(c, list, from);
      // Each teacher added from the organisation gets their sign-in in Messages.
      if (user && chosen.length) {
        const me = { key: user.uid, name: profile?.displayName || user.displayName || 'Your trainer', role: 'teacher' as const };
        for (const a of added) {
          const uid = from[a.name];
          if (!uid) continue;
          try {
            const id = await openChat(me, [{ key: uid, name: a.name, role: 'teacher' }]);
            await sendMsg({ id } as Chat, me, { text: `I have added you to ${c.name}, my teacher training class. Sign in at ${window.location.origin}/join with the class code ${c.classCode}, your name (${a.name}) and the PIN ${a.pin}.` });
          } catch {
            /* the PIN is still in the table */
          }
        }
      }
      setNames('');
      setPicked({});
      setAdding(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof LimitError ? err.message + ' Learners added before the limit are in the list.' : tr('We couldn’t add some learners. Check the list and try again.'));
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
      setError(`We couldn’t reset ${l.displayName}’s PIN. Try again.`);
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
      setError(`We couldn’t remove ${l.displayName}. Try again.`);
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
    </style><h1>${c.name.replace(/</g, '&lt;')} · ELT Suite sign-in</h1><div class="g">${rows}</div><script>window.onload=()=>window.print()</script>`);
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
                  {!manage && <th>Languages</th>}
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
                          <button type="button" className="who-cell who-open" disabled={manage} onClick={() => onOpen?.(l.id)} title={`See ${l.displayName.split(' ')[0]}’s activity`}>
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
                    {!manage && <td>
                      <LangChips classId={c.id} learner={l} all={learners} />
                    </td>}
                    <td>
                      {own[l.id] ? (
                        <span className="hint" title={tr('The learner chose their own, so you can’t see or reset it. If they forget it, you can remove them and add them again, but that starts a new account without their work.')}>
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
                      {!manage && isSuper && (
                        <button className="btn small-btn" title="Super admin: a new tab signed in as this learner, even if they chose their own password" onClick={() => void openAsUser({ uid: l.authUid, name: l.displayName, path: '/' }).then((m) => m && void tell(m))}>
                          Sign in as {l.displayName.split(' ')[0]}
                        </button>
                      )}
                      {!manage && !isSuper && <button className="btn small-btn" disabled={!pins[l.id]} title={tr('Open a new tab signed in as this learner')} onClick={() => openAsLearner({ classId: c.id, classCode: c.classCode, learnerId: l.id, name: l.displayName, pin: pins[l.id] ?? '' }) || void tell('Your browser blocked the new tab. Allow pop-ups for this site.')}>
                        View as {l.displayName.split(' ')[0]}
                      </button>}
                      <button
                        type="button"
                        className="icon-btn lt-more"
                        aria-label={`More for ${l.displayName}`}
                        disabled={busy === l.id}
                        onClick={(e) =>
                          openMenu(e, [
                            { label: busy === l.id ? 'Working…' : 'Reset PIN', icon: 'lock', disabled: !!own[l.id], hint: own[l.id] ? 'They set their own' : undefined, onClick: () => void reset(l) },
                            'sep',
                            { label: tr('Remove from the class'), icon: 'trash', danger: true, onClick: () => void remove(l) },
                          ])
                        }
                      >
                        ⋯                      </button>
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
            {org && (
              <div className="field lt-org">
                Teachers in {org.name}
                {pickable.length ? (
                  <span className="lt-pick">
                    {pickable.map(([uid, t]) => (
                      <label key={uid} className="lt-pick-o">
                        <input type="checkbox" checked={!!picked[uid]} onChange={(e) => setPicked((p) => ({ ...p, [uid]: e.target.checked }))} />
                        <span>
                          {t.name || t.email}
                          {t.title && <span className="hint"> · {t.title}</span>}
                        </span>
                      </label>
                    ))}
                  </span>
                ) : (
                  <span className="hint">Every teacher in {org.name} is in this class.</span>
                )}
                <span className="hint">Each one gets the class code and their PIN in Messages.</span>
              </div>
            )}
            {outsideOk && (
              <label className="field">
                {org ? `Teachers from outside ${org.name}, one name per line` : 'One name per line'}
                <textarea rows={org ? 3 : 6} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Sofia Rossi\nTariq Aziz'} />
              </label>
            )}
            <span className="hint">{tr('Each learner gets a 4-digit PIN. They sign in with the class code, their name and the PIN. No email needed.')}</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy === 'add' || nTyped + nPicked === 0}>
                {busy === 'add' ? 'Adding…' : tr(`Add ${nTyped + nPicked || ''} learners`).replace('  ', ' ')}
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
  const save = (next: string[]) => void saveLearnerLangs(classId, learner.id, next, all).catch(() => tell('We couldn’t save the languages. Try again.'));
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
