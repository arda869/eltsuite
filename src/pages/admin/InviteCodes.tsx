import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { ask } from '../../lib/ask';
import { Select } from '../../components/Select';
import { limitMessage, orgHasRoom, type Org } from '../../lib/admin';
import { codeLink, codeState, deleteCode, makeCode, resendCode, setCodeOff, useCodes, type InviteCode } from '../../lib/codes';
import { Empty, PageHead, Panel, ago, dateStr, useNote } from './ui';

// Invitation codes: ELT Suite is open by invitation for now. A new teacher types a code in on the
// sign-in page ("I have an invitation") to make their account. Super admins make codes for anyone
// or for an organisation; an organisation's admins, for their organisation only (and not past its
// limit of teachers). A code can be for one email (it is emailed there), used a set number of
// times, and last a set time.

const LASTS: { v: string; label: string }[] = [
  { v: '7', label: '7 days' },
  { v: '30', label: '30 days' },
  { v: '90', label: '90 days' },
  { v: '0', label: 'No end' },
];
const STATE: Record<ReturnType<typeof codeState>, string> = { open: 'Open', used: 'Used up', expired: 'Run out', off: 'Turned off' };

export function InviteCodes({ org, orgs }: { org?: Org | null; orgs?: Org[] }) {
  const { user, profile } = useAuth();
  const superView = !org; // Super Admin: every code, for any organisation
  const list = useCodes(true, org?.id ?? null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [forOrg, setForOrg] = useState('');
  const [uses, setUses] = useState('1');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState('');
  const [toast, say] = useNote();
  const me = { uid: user?.uid ?? '', name: (profile?.role === 'teacher' ? profile.displayName : '') || user?.displayName || user?.email || 'An admin' };
  const target = org ?? orgs?.find((o) => o.id === forOrg) ?? null;
  const clean = email.trim().toLowerCase();
  const emailOk = !clean || /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(clean);
  const n = Math.round(Number(uses));
  const usesOk = Number.isFinite(n) && n >= 1 && n <= 500;
  const full = !!target && !orgHasRoom(target, 'teachers');
  const make = async () => {
    if (!emailOk || !usesOk || busy || (full && !superView)) return;
    setBusy(true);
    try {
      const code = await makeCode({ org: target ? { id: target.id, name: target.name } : null, email: clean, name, maxUses: clean ? 1 : n, days: Number(days), me });
      setMade(code);
      setEmail('');
      setName('');
      say(clean ? `Code ${code} made. We’ll email it to ${clean} within 15 minutes.` : `Code ${code} made.`);
    } catch {
      say(full ? limitMessage(target!, 'teachers') : 'That didn’t work. Try again.');
    }
    setBusy(false);
  };
  const copy = (text: string, what: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => say(`${what} copied.`),
      () => say('We couldn’t copy it.'),
    );
  const remove = async (c: InviteCode) => {
    if (!(await ask(`Delete the code ${c.code}? Nobody can use it any more. Accounts already made with it stay.`, { ok: 'Delete', danger: true }))) return;
    await deleteCode(c.code).then(() => say(`${c.code} is deleted.`), () => say('That didn’t work. Try again.'));
  };
  const toggle = (c: InviteCode) => void setCodeOff(c.code, !c.off).then(() => say(c.off ? `${c.code} is on again.` : `${c.code} is turned off.`), () => say('That didn’t work. Try again.'));
  const open = list?.filter((c) => codeState(c) === 'open') ?? [];
  const closed = list?.filter((c) => codeState(c) !== 'open') ?? [];
  const row = (c: InviteCode) => {
    const st = codeState(c);
    const people = Object.values(c.usedBy ?? {});
    return (
      <li key={c.code} className={'ic-row' + (st !== 'open' ? ' closed' : '')}>
        <span className="ic-main">
          <code className="ic-code">{c.code}</code>
          <span className={'hq-tag' + (st === 'open' ? '' : ' quiet')}>{STATE[st]}</span>
        </span>
        <span className="ic-about">
          <span>
            {[c.email ? `for ${c.name ? `${c.name}, ` : ''}${c.email}` : c.name ? `for ${c.name}` : 'anyone with the code', superView ? (c.orgName ? `joins ${c.orgName}` : 'no organisation') : ''].filter(Boolean).join(' · ')}
          </span>
          <span>
            {`used ${c.uses ?? 0} of ${c.maxUses}`}
            {c.expires ? ` · ${c.expires < Date.now() ? 'ran out' : 'until'} ${dateStr(c.expires)}` : ' · no end'}
            {c.email ? (c.mailed ? ` · emailed ${ago(c.mailed)}` : ' · email going out soon') : ''}
            {` · made by ${c.byName}, ${ago(c.at)}`}
          </span>
          {people.length > 0 && <span className="ic-used">Accounts made: {people.map((p) => p.name || p.email).join(', ')}</span>}
        </span>
        <span className="hq-reg-acts">
          {st === 'open' && (
            <>
              <button type="button" className="btn link small" onClick={() => copy(c.code, 'The code is')}>
                Copy code
              </button>
              <button type="button" className="btn link small" onClick={() => copy(codeLink(c.code), 'The link is')}>
                Copy link
              </button>
              {c.email && c.mailed ? (
                <button type="button" className="btn link small" onClick={() => void resendCode(c.code).then(() => say(`The email to ${c.email} goes out again within 15 minutes.`))}>
                  Send again
                </button>
              ) : null}
            </>
          )}
          {(st === 'open' || st === 'off') && (
            <button type="button" className="btn small" onClick={() => toggle(c)}>
              {c.off ? 'Turn on' : 'Turn off'}
            </button>
          )}
          <button type="button" className="btn small" onClick={() => void remove(c)}>
            Delete
          </button>
        </span>
      </li>
    );
  };
  return (
    <div className="hq-page">
      <PageHead
        title="Invitation codes"
        lede={
          superView
            ? 'ELT Suite is open by invitation for now. A new teacher types a code in on the sign-in page (“I have an invitation”) to make their account. A code for an organisation also makes them one of its teachers.'
            : `New teachers type one of these codes in on the sign-in page (“I have an invitation”) to make their account and join ${org!.name}.`
        }
      />
      <Panel title="Make a code">
        <div className="ic-form">
          {superView && (
            <label className="ic-f">
              <span>Organisation</span>
              <Select value={forOrg} options={[{ v: '', label: 'None: a teacher on their own' }, ...(orgs ?? []).map((o) => ({ v: o.id, label: o.name }))]} onChange={setForOrg} label="Organisation" />
            </label>
          )}
          <label className="ic-f">
            <span>Only for this email (optional)</span>
            <input className="hq-in" type="email" autoComplete="off" placeholder="We email the code there" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="ic-f">
            <span>Their name (optional)</span>
            <input className="hq-in" autoComplete="off" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="ic-f small">
            <span>How many teachers</span>
            <input className="hq-in" type="number" min={1} max={500} value={clean ? '1' : uses} disabled={!!clean} onChange={(e) => setUses(e.target.value)} />
          </label>
          <label className="ic-f small">
            <span>Lasts</span>
            <Select value={days} options={LASTS} onChange={setDays} label="How long the code lasts" />
          </label>
        </div>
        {!emailOk && <span className="hint">Check the email.</span>}
        {!usesOk && <span className="hint">Choose from 1 to 500 teachers.</span>}
        {full && <span className="hint ic-full">{superView ? `${target!.name} is at its limit of teachers: nobody can join it with a code until you raise the limit.` : limitMessage(target!, 'teachers')}</span>}
        <div className="ic-go">
          <button type="button" className="btn primary" disabled={!emailOk || !usesOk || busy || (full && !superView)} onClick={() => void make()}>
            {busy ? 'One moment…' : 'Make code'}
          </button>
          {made && (
            <span className="ic-made" role="status">
              <code className="ic-code big">{made}</code>
              <button type="button" className="btn link small" onClick={() => copy(made, 'The code is')}>
                Copy code
              </button>
              <button type="button" className="btn link small" onClick={() => copy(codeLink(made), 'The link is')}>
                Copy link
              </button>
            </span>
          )}
        </div>
      </Panel>
      <Panel title={`Open codes${open.length ? ` (${open.length})` : ''}`}>
        {list === null ? null : !open.length ? <Empty title="No open codes" text="Codes you make appear here until they’re used up, run out or turned off." /> : <ul className="hq-supers ic-list">{open.map(row)}</ul>}
      </Panel>
      {closed.length > 0 && (
        <Panel title={`Used, run out or turned off (${closed.length})`}>
          <ul className="hq-supers ic-list">{closed.map(row)}</ul>
        </Panel>
      )}
      {toast}
    </div>
  );
}
