import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { ask } from '../../lib/ask';
import { addSuperAdmin, removeSuperAdmin, useSuperAdmins } from '../../lib/admin';
import { OWNER_EMAIL } from '../../lib/phonAudio';
import { Empty, PageHead, Panel, Who, ago, useNote } from './ui';

// Who runs ELT Suite: the owner, always, and the accounts a super admin has made super admins.
// A super admin can do everything the owner can here, including making and removing others.
export function SuperAdmins() {
  const { user, profile } = useAuth();
  const list = useSuperAdmins(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, say] = useNote();
  const me = { uid: user?.uid ?? '', name: (profile?.role === 'teacher' ? profile.displayName : '') || user?.displayName || user?.email || 'A super admin' };
  const clean = email.trim().toLowerCase();
  const valid = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(clean);
  const already = clean === OWNER_EMAIL || !!list?.some((s) => s.email === clean);
  const add = async () => {
    if (!valid || already || busy) return;
    if (!(await ask(`Make ${clean} a super admin? They will see and change everything in ELT Suite: every teacher, organisation, ticket and switch, and they can make other super admins.`, { ok: 'Make them a super admin' }))) return;
    setBusy(true);
    try {
      await addSuperAdmin(clean, name, me);
      setEmail('');
      setName('');
      say(`${clean} is a super admin. They see Super Admin the next time they open ELT Suite.`);
    } catch {
      say('That did not work. Try again.');
    }
    setBusy(false);
  };
  const remove = async (e: string) => {
    if (!(await ask(e === user?.email?.toLowerCase() ? 'Stop being a super admin yourself? You will lose Super Admin at once.' : `Stop ${e} being a super admin?`, { ok: 'Remove', danger: true }))) return;
    await removeSuperAdmin(e).then(() => say(`${e} is no longer a super admin.`), () => say('That did not work. Try again.'));
  };
  return (
    <div className="hq-page">
      <PageHead title="Super admins" lede="The people who run ELT Suite. Each one sees and changes everything here, and can make others super admins. They sign in with this email, and it must be a verified one (Google, or a confirmed email)." />
      <Panel title="Make someone a super admin">
        <div className="hq-addrow">
          <input className="hq-in" name="email" type="email" autoComplete="off" placeholder="Their email" aria-label="Their email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <input className="hq-in" name="name" autoComplete="off" placeholder="Their name (optional)" aria-label="Their name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <button type="button" className="btn primary" disabled={!valid || already || busy} onClick={() => void add()}>
            Add
          </button>
        </div>
        {clean && already && <span className="hint">They are a super admin already.</span>}
      </Panel>
      <Panel title="Super admins">
        <ul className="hq-supers">
          <li>
            <Who name="The owner of ELT Suite" sub={OWNER_EMAIL} />
            <span className="hq-tag quiet">Always</span>
          </li>
          {list === null ? null : !list.length ? (
            <li>
              <Empty title="Nobody else yet" text="Add someone above to share running ELT Suite." />
            </li>
          ) : (
            list.map((s) => (
              <li key={s.email}>
                <Who name={s.name || s.email} sub={[s.name ? s.email : '', s.byName ? `added by ${s.byName}${s.at ? ', ' + ago(s.at) : ''}` : ''].filter(Boolean).join(' · ')} />
                <button type="button" className="btn small" onClick={() => void remove(s.email)}>
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </Panel>
      {toast}
    </div>
  );
}
