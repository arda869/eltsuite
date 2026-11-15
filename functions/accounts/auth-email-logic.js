import { createHash } from 'node:crypto';
import { button, esc, frame, h1, p, pad, small } from '../notifications/email-layout.js';

const HOUR = 3600000;
const SITE = 'https://eltsuite.com';
const ACCEPTED = Object.freeze({ accepted: true });
const hash = value => createHash('sha256').update(value).digest('hex');

export function parseAuthEmailRequest(data) {
  const kind = data?.kind;
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!['reset', 'link'].includes(kind) || email.length > 254 || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return { kind, email };
}

// Reserve a send without looking up the account. Existing and unknown addresses get the
// same response and take the same server path; only the background worker sees Auth users.
export async function queueAuthEmail(db, data, ip, now = Date.now()) {
  const { kind, email } = parseAuthEmailRequest(data);
  const hour = Math.floor(now / HOUR);
  const address = String(ip || 'unknown').slice(0, 100);
  const ipRef = db.doc(`authEmailRateLimits/ip_${hash(`${address}|${hour}`)}`);
  const emailRef = db.doc(`authEmailRateLimits/email_${hash(`${email}|${hour}`)}`);
  const globalRef = db.doc(`authEmailRateLimits/global_${hour}`);
  const jobRef = db.collection('authEmailJobs').doc();
  await db.runTransaction(async tx => {
    const [ipLimit, emailLimit, globalLimit] = await Promise.all([
      tx.get(ipRef), tx.get(emailRef), tx.get(globalRef),
    ]);
    const ipCount = ipLimit.get('count') || 0;
    const emailCount = emailLimit.get('count') || 0;
    const globalCount = globalLimit.get('count') || 0;
    if (ipCount >= 60 || emailCount >= 3 || globalCount >= 200) return;
    const expiresAt = new Date((hour + 48) * HOUR);
    tx.set(ipRef, { count: ipCount + 1, expiresAt });
    tx.set(emailRef, { count: emailCount + 1, expiresAt });
    tx.set(globalRef, { count: globalCount + 1, expiresAt });
    tx.create(jobRef, { kind, email, status: 'pending', createdAt: new Date(now), expiresAt: new Date(now + 86400000) });
  });
  return ACCEPTED;
}

export function authEmailMessage(kind, link, now = new Date()) {
  if (typeof link !== 'string' || !/^https:\/\//.test(link)) throw new Error('A secure action link is required.');
  const reset = kind === 'reset';
  if (!reset && kind !== 'link') throw new Error('Unknown account email type.');
  const title = reset ? 'Reset your ELT Suite password' : 'Sign in to ELT Suite';
  // Firebase's own sign-in mail includes a timestamp so repeated links do not get
  // hidden together in one email thread.
  const stamp = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const subject = reset ? title : `${title} · ${stamp}`;
  const intro = reset
    ? 'We received a request to reset your ELT Suite password. Choose a new password using the link below.'
    : 'We received a request to sign in to ELT Suite. Use the link below to finish signing in.';
  const label = reset ? 'Reset password' : 'Sign in';
  const requestedAt = reset ? '' : small(`Requested at ${stamp}.`);
  const fallback = `<p style="margin:18px 0 0;font:14px/1.6 Arial,sans-serif;color:#696969;overflow-wrap:anywhere">If the button doesn’t work, open this link:<br><a href="${esc(link)}" style="color:#975f40;word-break:break-all">${esc(link)}</a></p>`;
  const html = frame({
    title,
    preview: intro,
    body: pad(h1(title) + p(esc(intro)) + requestedAt + button(link, label) + small('If you didn’t request this, you can ignore this email.') + fallback),
    footer: 'This link is for your ELT Suite account.',
  });
  const text = [title, intro, ...(reset ? [] : [`Requested at ${stamp}.`]), `${label}: ${link}`, `If the button doesn’t work, open this link: ${link}`, 'If you didn’t request this, you can ignore this email.'].join('\n\n');
  return { subject, html, text };
}

// Firestore events may be delivered more than once. Claim before generating a link or
// sending mail, then remove the short-lived job; no action link is written to Firestore.
export async function deliverAuthEmailJob({ db, auth, jobRef, send, now = new Date() }) {
  let job = null;
  await db.runTransaction(async tx => {
    const saved = await tx.get(jobRef);
    if (!saved.exists || saved.get('status') !== 'pending') return;
    job = { kind: saved.get('kind'), email: saved.get('email') };
    tx.update(jobRef, { status: 'claimed', claimedAt: now });
  });
  if (!job) return 'already-claimed';
  try {
    let user;
    try {
      user = await auth.getUserByEmail(job.email);
    } catch (error) {
      if (error?.code === 'auth/user-not-found') return 'unknown-address';
      throw error;
    }
    if (user.disabled) return 'disabled-account';
    const link = job.kind === 'reset'
      ? await auth.generatePasswordResetLink(job.email)
      : await auth.generateSignInWithEmailLink(job.email, { url: `${SITE}/auth/link`, handleCodeInApp: true });
    await send({ to: job.email, ...authEmailMessage(job.kind, link, now) });
    return 'sent';
  } finally {
    await jobRef.delete();
  }
}
