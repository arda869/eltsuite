import { randomUUID } from 'node:crypto';
import { organisationInvitation, codeInvitation } from './invitation-emails.js';

const REVIEW_AFTER_MS = 10 * 60 * 1000;

export const pendingOrganisationInvitation = (data) =>
  data.status === 'pending' && !data.mailed && !!String(data.email ?? '').trim();

export const pendingCodeInvitation = (data, now) =>
  !!String(data.email ?? '').trim()
  && !data.mailed
  && !data.off
  && Number(data.uses ?? 0) < Number(data.maxUses ?? 1)
  && (!data.expires || Number(data.expires) >= now);

async function claim(db, ref, eligible, now) {
  const id = randomUUID();
  const data = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data();
    // SMTP and Firestore cannot commit atomically. A claim stays held until we
    // know no send was attempted or the mailed update succeeds. Age alone must
    // never turn an uncertain delivery into an automatic second email.
    if (!current || !eligible(current) || current.mailClaimId || Number(current.mailClaimedAt ?? 0) > 0) return null;
    tx.update(ref, { mailClaimedAt: now, mailClaimId: id });
    return current;
  });
  return data ? { id, data } : null;
}

async function clearClaim(db, ref, id) {
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.data()?.mailClaimId === id) tx.update(ref, { mailClaimedAt: 0, mailClaimId: '' });
  });
}

async function deliverOne({ db, ref, eligible, makeMessage, mail, from, now }) {
  const claimed = await claim(db, ref, eligible, now);
  if (!claimed) return false;
  let message;
  let extra = {};
  try {
    ({ message, extra = {} } = await makeMessage(claimed.data));
  } catch (error) {
    // No SMTP attempt happened, so this claim is safe to release and retry.
    await clearClaim(db, ref, claimed.id).catch(() => {});
    throw error;
  }
  try {
    await mail.sendMail({ from, to: claimed.data.email, ...message });
    await ref.update({ mailed: Date.now(), ...extra, mailClaimedAt: 0, mailClaimId: '' });
  } catch {
    // A transport error may occur after SMTP accepted DATA; a Firestore error
    // may occur after SMTP accepted the message. Keep the claim in both cases.
    // An operator must reconcile the provider record before clearing it.
    throw Object.assign(new Error('Invitation delivery is uncertain and needs manual review.'), { code: 'mail-state-ambiguous' });
  }
  return true;
}

function claimNeedsReview(data, now) {
  const claimedAt = Number(data.mailClaimedAt ?? 0);
  return (!!data.mailClaimId || claimedAt > 0) && (!Number.isFinite(claimedAt) || claimedAt <= now - REVIEW_AFTER_MS);
}

// Cloud Scheduler is the primary sender; the GitHub email job uses this as a fallback.
// Per-document claims prevent overlapping runs from sending the same invitation.
export async function deliverPendingInvitations({ db, auth, mail, from, now = Date.now() }) {
  const tally = { organisations: 0, codes: 0, errors: 0, needsReview: 0 };
  const invitations = await db.collection('orgInvites').where('status', '==', 'pending').get();
  for (const invitation of invitations.docs) {
    if (!pendingOrganisationInvitation(invitation.data())) continue;
    if (claimNeedsReview(invitation.data(), now)) { tally.needsReview++; continue; }
    try {
      if (await deliverOne({
        db, ref: invitation.ref, eligible: pendingOrganisationInvitation, mail, from, now,
        makeMessage: async (data) => {
          let existing = false;
          try { await auth.getUserByEmail(data.email); existing = true; }
          catch (error) {
            if (error?.code !== 'auth/user-not-found') throw error;
          }
          return { message: organisationInvitation(data, invitation.id, existing), extra: { existing } };
        },
      })) tally.organisations++;
    } catch (error) {
      tally.errors++;
      if (error?.code === 'mail-state-ambiguous') tally.needsReview++;
      console.error(error?.code === 'mail-state-ambiguous' ? 'Organisation invitation delivery is uncertain; claim held for review.' : 'Could not email one organisation invitation.', error?.code ?? 'unknown');
    }
  }
  const codes = await db.collection('inviteCodes').get();
  for (const code of codes.docs) {
    if (!pendingCodeInvitation(code.data(), now)) continue;
    if (claimNeedsReview(code.data(), now)) { tally.needsReview++; continue; }
    try {
      if (await deliverOne({
        db, ref: code.ref, eligible: (data) => pendingCodeInvitation(data, now), mail, from, now,
        makeMessage: async (data) => ({ message: codeInvitation(data, code.id) }),
      })) tally.codes++;
    } catch (error) {
      tally.errors++;
      if (error?.code === 'mail-state-ambiguous') tally.needsReview++;
      console.error(error?.code === 'mail-state-ambiguous' ? 'Invitation code delivery is uncertain; claim held for review.' : 'Could not email one invitation code.', error?.code ?? 'unknown');
    }
  }
  return tally;
}
