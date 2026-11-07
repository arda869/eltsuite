// Two addresses for one app: eltsuite.com for teachers, learn.eltsuite.com for learners (their
// home, live lessons, homework, recaps, the pages their worksheets' QR codes open). Both serve
// the same site; which one you are on decides the home page and where learners and teachers are
// sent. On a test server, ?site=learn shows the learners' site (and ?site=main goes back).

export const MAIN = 'https://eltsuite.com';
export const LEARN = 'https://learn.eltsuite.com';

const host = () => (typeof location === 'undefined' ? '' : location.hostname);
export const live = () => /(^|\.)eltsuite\.com$/.test(host());

function testSite(): string {
  try {
    const q = new URLSearchParams(location.search).get('site');
    if (q === 'learn' || q === 'main') sessionStorage.setItem('ll.site', q);
    return sessionStorage.getItem('ll.site') ?? '';
  } catch {
    return '';
  }
}
export const onLearnSite = () => host().startsWith('learn.') || (!live() && testSite() === 'learn');

// learn.eltsuite.com is used once it answers (its address set up in Firebase Hosting); until then
// learners stay on eltsuite.com and links point there. Recheck after a short expiry.
const LEARN_CHECK_TTL = 5 * 60 * 1000;
let learnCheckedAt = (() => {
  try {
    return Number(localStorage.getItem('ll.learnCheckedAt') || 0);
  } catch {
    return 0;
  }
})();
export const learnReady = () => onLearnSite() || (learnCheckedAt > 0 && Date.now() - learnCheckedAt < LEARN_CHECK_TTL);
export function probeLearn(then?: () => void) {
  if (!live() || onLearnSite()) return;
  fetch(LEARN + '/version.json', { mode: 'cors', cache: 'no-store' }).then(async response => {
    if (!response.ok) throw Error('Learner site unavailable');
    const data = await response.json() as { build?: unknown };
    if (typeof data.build !== 'string' || !data.build.trim()) throw Error('Learner site returned an invalid version');
    learnCheckedAt = Date.now();
      try {
        localStorage.setItem('ll.learnCheckedAt', String(learnCheckedAt));
      } catch {
        /* private window */
      }
      then?.();
    }).catch(() => {
      learnCheckedAt = 0;
      try {
        localStorage.removeItem('ll.learnCheckedAt');
      } catch {
        /* private window */
      }
    });
}
export const learnOrigin = () => (live() ? (learnReady() ? LEARN : MAIN) : location.origin);
export const mainOrigin = () => (live() ? MAIN : location.origin);
export const classJoinLink = (code: string) => `${learnOrigin()}/join?code=${encodeURIComponent(code)}`;

// Paths only learners use: on the teachers' address they move to the learners' one.
export const LEARNER_PATHS = [/^\/join\b/, /^\/learn\//, /^\/recap\//, /^\/discuss\b/];
// Pages anyone opens from a link, on either address.
export const SHARED_PATHS = [/^\/(quiz|game)(\/|$)/,/^\/call\//, /^\/r\//, /^\/play\//, /^\/s\//, /^\/doc\//, /^\/privacy/, /^\/terms/, /^\/auth\/link/, /^\/messages/, /^\/settings/];
export const isLearnerPath = (p: string) => LEARNER_PATHS.some((r) => r.test(p));
export const isSharedPath = (p: string) => SHARED_PATHS.some((r) => r.test(p));

// Go to the same page on the other address (a full page load: each address keeps its own sign-in).
export function goTo(origin: string, path = location.pathname + location.search + location.hash) {
  if (origin === location.origin) return;
  location.replace(origin + path);
}
