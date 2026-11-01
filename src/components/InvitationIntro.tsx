import type { ReactNode } from 'react';
import { Wordmark } from './Wordmark';
import copy from '../../scripts/invitation-copy.json';

type Invitation = { name?: string; email?: string; byName?: string; orgName?: string; existing?: boolean; admin?: boolean; color?: string; logo?: string };

// The landing page continues the invitation email, using the same approved introduction.
export function InvitationIntro({ invitation: inv, organisation = false, children }: { invitation?: Invitation; organisation?: boolean; children?: ReactNode }) {
  const org = inv?.orgName || 'your organisation';
  const existing = organisation && inv?.existing;
  const sentence = organisation
    ? `${inv?.byName || 'An admin'} ${existing ? 'would like you to join' : 'has made you a place at'} ${org} in ELT Suite${inv?.admin ? ', as one of its admins' : ''}.`
    : inv ? `${inv.byName || 'The ELT Suite team'} has invited you to ELT Suite${inv.orgName ? ` at ${inv.orgName}` : ''}.` : 'Use your invitation to make your teacher account.';
  const benefits = existing ? [
    `The teachers at ${org} become your colleagues, so sharing lessons and folders with them takes one step.`,
    `You get ${org}’s shared folders and its look on your worksheets.`,
    'Your account, classes, lessons and files stay yours.',
  ] : copy.benefits;
  return (
    <div className="intro inv-intro" style={{ ['--org' as string]: inv?.color || 'var(--accent)' }}>
      {inv?.logo ? <img className="inv-logo" src={inv.logo} alt={org} /> : <Wordmark big />}
      <span className="soon-badge">You’re invited</span>
      <h1>{existing ? `Join your colleagues at ${org}` : copy.title}</h1>
      {inv?.name && <p>Hello {inv.name.trim().split(/\s+/)[0]},</p>}
      <p>{sentence}</p>
      {!existing && <p>{copy.intro}</p>}
      <ul className="inv-benefits">{benefits.map(text => <li key={text}>{text}</li>)}</ul>
      <a className="btn primary" href="#teacher-sign-in">{existing ? 'Sign in to see the invitation' : 'Create my account'}</a>
      {inv?.email && <p className="hint">{existing ? `Sign in with ${inv.email}. You can say yes or no there.` : `Choose a password, or use Google with ${inv.email}.`}</p>}
      {children}
    </div>
  );
}
