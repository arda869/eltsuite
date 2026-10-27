import { ask } from '../lib/ask';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import type { ClassDoc } from '../lib/classes';
import { cancelInvite, changeRole, inviteTeacher, keyEmail, removeCoTeacher, roleIn, type CoRole } from '../lib/coteach';

// Co-teachers and viewers for a class (shown in Class settings to the owner).
export function TeachersPanel({ c }: { c: ClassDoc }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CoRole>('co');
  const [msg, setMsg] = useState('');
  const owner = roleIn(c, user?.uid) === 'owner';
  const cos = Object.entries(c.coTeachers ?? {});
  const invites = Object.entries(c.invites ?? {});
  if (!owner) {
    return (
      <div className="field">
        <span>Teachers</span>
        <span className="hint">
          {cos.length ? cos.map(([, t]) => `${t.name} (${t.role === 'co' ? 'co-teacher' : 'viewer'})`).join(' · ') : 'Only the class owner can invite other teachers.'}
        </span>
      </div>
    );
  }
  const invite = async () => {
    setMsg('');
    try {
      await inviteTeacher(c, email, role, (user?.displayName || 'The class owner').split(' ')[0]);
      setEmail('');
      setMsg('Invitation sent. It appears on their Classes page when they sign in with that email.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="field">
      <span>Teachers</span>
      <span className="hint">A co-teacher can do everything you can, including teaching live. A viewer can only look, for example an observer or a substitute preparing.</span>
      {cos.length > 0 && (
        <ul className="tp-list">
          {cos.map(([uid, t]) => (
            <li key={uid}>
              <span>
                <strong>{t.name}</strong>
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={t.role} onChange={(e) => changeRole(c, uid, e.target.value as CoRole)} aria-label={`Access for ${t.name}`}>
                  <option value="co">Co-teacher</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="button" className="btn link small" onClick={() => void ask(`Remove ${t.name} from this class?`).then((ok) => { if (ok) removeCoTeacher(c, uid); })}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {invites.length > 0 && (
        <ul className="tp-list">
          {invites.map(([k, inv]) => (
            <li key={k}>
              <span>
                {keyEmail(k)} <span className="hint">· invited as {inv.role === 'co' ? 'co-teacher' : 'viewer'}, waiting</span>
              </span>
              <button type="button" className="btn link small" onClick={() => cancelInvite(c, keyEmail(k))}>
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="tp-invite">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@example.com" aria-label="Email to invite" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), invite())} />
        <select value={role} onChange={(e) => setRole(e.target.value as CoRole)} aria-label="Access">
          <option value="co">Co-teacher</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="button" className="btn small-btn" disabled={!email.trim()} onClick={invite}>
          Invite
        </button>
      </span>
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}
