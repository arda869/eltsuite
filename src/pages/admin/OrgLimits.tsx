import { useState } from 'react';
import { LIMITS, orgLimit, orgUsed, saveOrgLimits, type LimitKey, type Org, type OrgLimits } from '../../lib/admin';
import { Meter, Panel, fmtBytes, fmtGb, useNote } from './ui';

// An organisation's limits, set by a super admin: teachers, classes, learners, call minutes a
// month and space. Its admins see them here with what is used; the app and the database rules stop
// anyone going past them (see firestore.rules, orgHasRoom and countedIn).
export function OrgLimitsPanel({ org, owner, usedBytes, note }: { org: Org; owner: boolean; usedBytes: number; note: (what: string, detail?: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<LimitKey, string>>(() => Object.fromEntries(LIMITS.map(({ k }) => [k, orgLimit(org, k)?.toString() ?? ''])) as Record<LimitKey, string>);
  const [busy, setBusy] = useState(false);
  const [toast, say] = useNote();
  const bad = LIMITS.some(({ k }) => draft[k].trim() !== '' && !(Number(draft[k]) >= 0 && Number.isFinite(Number(draft[k]))));
  const save = async () => {
    if (bad || busy) return;
    setBusy(true);
    const next: OrgLimits = {};
    for (const { k } of LIMITS) if (draft[k].trim() !== '') next[k] = Number(draft[k]);
    try {
      await saveOrgLimits(org, next);
      note('Changed the organisation’s limits', LIMITS.map(({ k, label }) => `${label}: ${next[k] ?? 'no limit'}`).join(', '));
      setEdit(false);
      say('The limits are saved.');
    } catch {
      say('That did not work. Try again.');
    }
    setBusy(false);
  };
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  return (
    <Panel
      title="Limits"
      action={
        owner && !edit ? (
          <button type="button" className="btn small" onClick={() => setEdit(true)}>
            Change limits
          </button>
        ) : undefined
      }
    >
      <p className="hint lim-lede">{owner ? `What ${org.name} can have. Leave one empty for no limit. Its admins see these, and nobody in ${org.name} can go past them.` : `What ${org.name} can have in ELT Suite. To raise a limit, write to ELT Suite from Support.`}</p>
      <ul className="lim-list">
        {LIMITS.map(({ k, label, unit, about }) => {
          const used = orgUsed(org, k);
          const limit = orgLimit(org, k);
          return (
            <li key={k} className="lim-row">
              <span className="lim-t">
                <b>{label}</b>
                <span>{k === 'callMinutes' ? `${about} In ${month}.` : about}</span>
              </span>
              {edit ? (
                <input className="hq-in lim-in" type="number" min={0} inputMode="numeric" placeholder="No limit" aria-label={`${label}: limit`} value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
              ) : (
                <span className="lim-v">
                  {limit === null ? (
                    <span className="lim-n">
                      {used} {unit} <span className="lim-of">· no limit</span>
                    </span>
                  ) : (
                    <>
                      <Meter used={used} of={Math.max(limit, 0.0001)} small />
                      <span className={'lim-n' + (used >= limit ? ' full' : '')}>
                        {used} of {limit}
                        {used >= limit ? ' · full' : ''}
                      </span>
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
        <li className="lim-row">
          <span className="lim-t">
            <b>Space</b>
            <span>Files, lessons and media across its teachers and library{owner ? ', set with the plan below' : ''}.</span>
          </span>
          <span className="lim-v">
            <Meter used={usedBytes} of={org.limitGb * 1024 ** 3} small />
            <span className="lim-n">
              {fmtBytes(usedBytes)} of {fmtGb(org.limitGb)}
            </span>
          </span>
        </li>
      </ul>
      {edit && (
        <div className="lim-acts">
          {bad && <span className="hint">Use whole numbers, or leave one empty.</span>}
          <button type="button" className="btn" onClick={() => setEdit(false)}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={bad || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save limits'}
          </button>
        </div>
      )}
      {toast}
    </Panel>
  );
}
