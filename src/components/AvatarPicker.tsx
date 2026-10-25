import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { chooseAvatar, useClaims } from '../lib/avatars';
import { AVATARS, Avatar } from './avatars';

// Choose a profile picture. Pictures someone else in the class already uses can't be chosen.
export function AvatarPicker({ classIds, onClose }: { classIds: string[]; onClose: () => void }) {
  const { user, profile, setAvatarLocal } = useAuth();
  const claims = useClaims(classIds);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const mine = profile?.avatar;
  const taken = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of Object.values(claims)) for (const cl of c) if (cl.uid !== user?.uid) m[cl.key] = cl.name;
    return m;
  }, [claims, user?.uid]);
  const name = profile?.role === 'learner' ? profile.displayName : user?.displayName || user?.email?.split('@')[0] || 'Teacher';

  async function pick(k: string) {
    if (!user || taken[k] || busy) return;
    setBusy(k);
    setErr('');
    try {
      await chooseAvatar(user.uid, classIds, k, mine, { name, learnerId: profile?.role === 'learner' ? profile.learnerId : undefined });
      setAvatarLocal(k);
    } catch (e) {
      setErr((e as Error).message === 'taken' ? 'Someone has just taken that picture. Please choose another.' : 'That didn’t work. Please try again.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog av-dialog" role="dialog" aria-label="Choose a profile picture" onClick={(e) => e.stopPropagation()}>
        <div className="av-head">
          <Avatar k={mine} name={name} size={56} />
          <div>
            <h2 style={{ margin: 0 }}>Choose your picture</h2>
            <span className="hint">Everyone in your class has a different one.</span>
          </div>
        </div>
        <div className="av-grid" role="radiogroup" aria-label="Pictures">
          {AVATARS.map((a) => {
            const t = taken[a.key];
            return (
              <button key={a.key} type="button" role="radio" aria-checked={mine === a.key} disabled={!!t || !!busy} className={'av-opt' + (mine === a.key ? ' on' : '') + (t ? ' taken' : '')} title={t ? `${a.label} · ${t} has this one` : a.label} onClick={() => pick(a.key)}>
                <Avatar k={a.key} size={52} />
                <span className="av-label">{t ? 'Taken' : a.label}</span>
              </button>
            );
          })}
        </div>
        {err && <span className="error">{err}</span>}
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
