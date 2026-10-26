import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { chooseAvatar, useClaims } from '../lib/avatars';
import { AVATARS, Avatar, photoKey, savePhoto } from './avatars';

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
  // Teachers can always use a photo; learners when their class allows it.
  const [photosOk, setPhotosOk] = useState(profile?.role !== 'learner');
  useEffect(() => {
    if (profile?.role !== 'learner') return;
    getDoc(doc(db, 'classes', profile.classId))
      .then((s) => setPhotosOk(s.data()?.profile?.photos === true))
      .catch(() => {});
  }, [profile]);
  const fileIn = useRef<HTMLInputElement>(null);
  const upload = async (f: File) => {
    if (!user) return;
    setBusy('photo');
    setErr('');
    try {
      await savePhoto(user.uid, f);
      await pick(photoKey(user.uid), true);
    } catch {
      setErr('That photo could not be used. Try another one.');
    } finally {
      setBusy('');
    }
  };

  async function pick(k: string, force = false) {
    if (!user || taken[k] || (busy && !force)) return;
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
        {photosOk && (
          <div className="av-photo-row">
            <button type="button" className={'av-opt av-upload' + (mine?.startsWith('photo:') ? ' on' : '')} onClick={() => fileIn.current?.click()} disabled={!!busy}>
              {mine?.startsWith('photo:') ? <Avatar k={mine} size={52} /> : <span className="av-plus">+</span>}
              <span className="av-label">{busy === 'photo' ? 'Adding…' : mine?.startsWith('photo:') ? 'Change photo' : 'Your photo'}</span>
            </button>
            <span className="hint">Use a photo of yourself. It is cropped to a circle and seen by everyone in your class.</span>
            <input ref={fileIn} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
          </div>
        )}
        {err && <span className="error">{err}</span>}
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
