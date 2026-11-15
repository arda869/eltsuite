import { randomUUID } from 'node:crypto';
import { organisationInvitation, codeInvitation } from './invitation-emails.js';

const CLAIM_MS = 10 * 60 * 1000;

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
    if (!current || !eligible(current) || Number(current.mailClaimedAt ?? 0) > now - CLAIM_MS) return null;
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
    await mail.sendMail({ from, to: claimed.data.email, ...message });
  } catch (error) {
    await clearClaim(db, ref, claimed.id).catch(() => {});
    throw error;
  }
  // Keep the claim if Firestore fails after SMTP accepted the email. This avoids
  // an immediate duplicate on the next five-minute run while the write recovers.
  await ref.update({ mailed: Date.now(), ...extra, mailClaimedAt: 0, mailClaimId: '' });
  return true;
}

// The Cloud Scheduler worker is the sole sender for org and code invitations.
// Per-document claims prevent overlapping scheduled runs from sending the same invitation.
export async function deliverPendingInvitations({ db, auth, mail, from, now = Date.now() }) {
  const tally = { organisations: 0, codes: 0, errors: 0 };
  const invitations = await db.collection('orgInvites').where('status', '==', 'pending').get();
  for (const invitation of invitations.docs) {
    if (!pendingOrganisationInvitation(invitation.data())) continue;
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
      console.error('Could not email one organisation invitation.', error?.code ?? 'unknown');
    }
  }
  const codes = await db.collection('inviteCodes').get();
  for (const code of codes.docs) {
    if (!pendingCodeInvitation(code.data(), now)) continue;
    try {
      if (await deliverOne({
        db, ref: code.ref, eligible: (data) => pendingCodeInvitation(data, now), mail, from, now,
        makeMessage: async (data) => ({ message: codeInvitation(data, code.id) }),
      })) tally.codes++;
    } catch (error) {
      tally.errors++;
      console.error('Could not email one invitation code.', error?.code ?? 'unknown');
    }
  }
  return tally;
}
