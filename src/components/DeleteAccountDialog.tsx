import { useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { deleteTeacherAccount } from '../lib/deletion';
import type { ClassDoc } from '../lib/classes';

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [typed, setTyped] = useState('');
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  async function go() {
    if (!user) return;
    setErr('');
    try {
      const s = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.uid)));
      await deleteTeacherAccount(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) })), setStep);
      window.location.href = '/';
    } catch (e) {
      const code = (e as { code?: string }).code;
      setStep('');
      setErr(code === 'auth/requires-recent-login' ? 'Your classes are deleted. To delete the account itself, sign out, sign in again and repeat this step.' : 'Something went wrong. Please try again.');
    }
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Delete my account" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Delete your account?</h2>
        <p style={{ margin: 0 }}>This deletes every class you teach straight away, including the learner accounts and all their work, and then your account. It can’t be undone.</p>
        <label className="field">
          Type DELETE to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </label>
        {step && <span className="hint">{step}…</span>}
        {err && <span className="error">{err}</span>}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" disabled={typed !== 'DELETE' || !!step} onClick={go}>
            Delete everything
          </button>
        </span>
      </div>
    </div>
  );
}
