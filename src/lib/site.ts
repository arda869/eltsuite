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

export const learnOrigin = () => (live() ? LEARN : location.origin);
export const mainOrigin = () => (live() ? MAIN : location.origin);

// Paths only learners use: on the teachers' address they move to the learners' one.
export const LEARNER_PATHS = [/^\/join\b/, /^\/learn\//, /^\/recap\//, /^\/discuss\b/];
// Pages anyone opens from a link, on either address.
export const SHARED_PATHS = [/^\/call\//, /^\/r\//, /^\/play\//, /^\/s\//, /^\/doc\//, /^\/privacy/, /^\/terms/, /^\/auth\/link/, /^\/messages/, /^\/settings/];
export const isLearnerPath = (p: string) => LEARNER_PATHS.some((r) => r.test(p));
export const isSharedPath = (p: string) => SHARED_PATHS.some((r) => r.test(p));

// Go to the same page on the other address (a full page load: each address keeps its own sign-in).
export function goTo(origin: string, path = location.pathname + location.search + location.hash) {
  if (origin === location.origin) return;
  location.replace(origin + path);
}
