import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ADMIN_CAN, ADMIN_SEE, acceptInvite, declineInvite, useInvite, type OrgInvite } from '../lib/admin';
import { AFTER_SIGN_IN } from './SharedPage';
import { SignIn } from './SignIn';
import { Loader } from '../components/Loader';
import { Wordmark } from '../components/Wordmark';
import { isLearnerEmail } from '../lib/learners';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

// An organisation's invitation, from the link in its email. A new teacher makes their account
// here; a teacher with one already sees what joining means and says yes or no.

export function InvitePage() {
  const { id } = useParams();
  const inv = useInvite(id);
  const { user, profile, ready } = useAuth();
  useEffect(() => {
    if (!ready || !id) return;
    try {
      if (!user) sessionStorage.setItem(AFTER_SIGN_IN, `/invite/${id}`);
      else if (sessionStorage.getItem(AFTER_SIGN_IN) === `/invite/${id}`) sessionStorage.removeItem(AFTER_SIGN_IN);
    } catch {
      /* fine */
    }
  }, [ready, user, id]);
  if (!ready || inv === undefined) return <Loader full label="Opening the invitation" />;
  if (!inv)
    return (
      <Frame>
        <h1>This invitation is not there any more</h1>
        <p className="hint">The admin may have taken it back. Ask them to send a new one.</p>
        <Link className="btn" to="/">
          Go to ELT Suite
        </Link>
      </Frame>
    );
  if (!user) return <SignIn intro={<About inv={inv} />} start={{ mode: inv.existing ? 'signin' : 'create', name: inv.name, email: inv.email }} />;
  return <Answer inv={inv} me={{ uid: user.uid, email: user.email ?? '', name: profile?.displayName || user.displayName || inv.name, learner: isLearnerEmail(user.email) }} />;
}

function Frame({ children, inv }: { children: React.ReactNode; inv?: OrgInvite }) {
  return (
    <div className="inv" style={{ ['--org' as string]: inv?.color || 'var(--accent)' }}>
      <div className="inv-card">
        <span className="inv-brand">{inv?.logo ? <img src={inv.logo} alt="" /> : <Wordmark />}</span>
        {children}
      </div>
    </div>
  );
}

function What({ inv }: { inv: OrgInvite }) {
  return (
    <div className="inv-what">
      <span className="inv-h">In {inv.orgName}, its admins can set</span>
      <ul>
        {ADMIN_CAN.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <span className="inv-h">What they see</span>
      <p>{ADMIN_SEE}</p>
      <p>The teachers in {inv.orgName} become your colleagues, and you theirs.</p>
    </div>
  );
}

// Beside the sign-in form, for a teacher who is not signed in yet.
function About({ inv }: { inv: OrgInvite }) {
  return (
    <div className="intro inv-intro" style={{ ['--org' as string]: inv.color || 'var(--accent)' }}>
      {inv.logo ? <img className="inv-logo" src={inv.logo} alt="" /> : <Wordmark big />}
      <span className="eyebrow">An invitation from {inv.orgName}</span>
      <p>
        {inv.byName || 'An admin'} {inv.existing ? `would like you to join ${inv.orgName}. Sign in as ${inv.email} to answer.` : `has made a place for you at ${inv.orgName}. Make your account with ${inv.email}, or use Google with it.`}
      </p>
      <What inv={inv} />
    </div>
  );
}

function Answer({ inv, me }: { inv: OrgInvite; me: { uid: string; email: string; name: string; learner: boolean } }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const mine = me.email.toLowerCase() === inv.email;
  if (inv.status !== 'pending')
    return (
      <Frame inv={inv}>
        <h1>{inv.status === 'accepted' ? `You are in ${inv.orgName}` : 'You said no to this invitation'}</h1>
        <p className="hint">{inv.status === 'accepted' ? 'Its branding and rules are on your account now.' : `Ask ${inv.byName || 'the admin'} for a new one if you change your mind.`}</p>
        <Link className="btn primary" to="/">
          Go to ELT Suite
        </Link>
      </Frame>
    );
  if (!mine || me.learner)
    return (
      <Frame inv={inv}>
        <h1>This invitation is for {inv.email}</h1>
        <p className="hint">You are signed in as {me.email || 'a learner'}. Sign out, then sign in with {inv.email}.</p>
        <button type="button" className="btn primary" onClick={() => void signOut(auth)}>
          Sign out
        </button>
      </Frame>
    );
  const yes = async () => {
    setBusy('yes');
    setError('');
    try {
      await acceptInvite(inv, me);
      nav('/', { replace: true });
    } catch (e) {
      console.error(e);
      setError('That did not work. Try again, or ask the admin to send a new invitation.');
      setBusy('');
    }
  };
  const no = async () => {
    setBusy('no');
    await declineInvite(inv, me.uid).catch(() => setError('That did not work. Try again.'));
    setBusy('');
  };
  return (
    <Frame inv={inv}>
      <span className="eyebrow">An invitation</span>
      <h1>Join {inv.orgName}?</h1>
      <p>
        {inv.byName || 'An admin'} would like you to join {inv.orgName}
        {inv.title ? `, as ${inv.title}` : ''}. Your classes, lessons and files stay yours.
      </p>
      <What inv={inv} />
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      <span className="inv-acts">
        <button type="button" className="btn" disabled={!!busy} onClick={() => void no()}>
          {busy === 'no' ? 'One moment…' : 'No, thank you'}
        </button>
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => void yes()}>
          {busy === 'yes' ? 'Joining…' : `Join ${inv.orgName}`}
        </button>
      </span>
    </Frame>
  );
}
