import { load, persist } from './store';
type U = { uid: string; email: string; displayName: string; password?: string };
const users = () => load<Record<string, U>>('mockauth', {});
export type User = { uid: string; email: string | null; displayName: string | null; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>; delete: () => Promise<void> };
const asUser = (u: U): User => ({ uid: u.uid, email: u.email, displayName: u.displayName, getIdTokenResult: async () => ({ claims: {} }), delete: async () => {} });
const autos: Record<string, { currentUser: User | null; app: { name: string } }> = {};
export function getAuth(app: { name: string } = { name: '[DEFAULT]' }) {
  if (!autos[app.name]) {
    const cur = app.name === '[DEFAULT]' ? sessionStorage.getItem('mockuid') ?? localStorage.getItem('mockuid') : null;
    const u = cur ? users()[cur] : null;
    autos[app.name] = { currentUser: u ? asUser(u) : null, app };
  }
  return autos[app.name];
}
const cbs: ((u: User | null) => void)[] = [];
export function onAuthStateChanged(auth: ReturnType<typeof getAuth>, cb: (u: User | null) => void) {
  cbs.push(cb);
  setTimeout(() => cb(auth.currentUser), 0);
  return () => {};
}
function setCur(auth: ReturnType<typeof getAuth>, u: User | null) {
  auth.currentUser = u;
  if (auth.app.name === '[DEFAULT]') {
    if (u) sessionStorage.setItem('mockuid', u.uid);
    else sessionStorage.removeItem('mockuid');
    cbs.forEach((c) => c(u));
  }
}
export async function createUserWithEmailAndPassword(auth: ReturnType<typeof getAuth>, email: string, password: string) {
  const all = users();
  const uid = 'u' + Math.random().toString(36).slice(2, 10);
  all[uid] = { uid, email, displayName: '', password };
  persist('mockauth', all);
  const user = asUser(all[uid]);
  setCur(auth, user);
  return { user };
}
export async function signInWithEmailAndPassword(auth: ReturnType<typeof getAuth>, email: string, password: string) {
  const u = Object.values(users()).find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
  if (!u) throw Object.assign(new Error('auth/invalid-credential'), { code: 'auth/invalid-credential' });
  setCur(auth, asUser(u));
  return { user: asUser(u) };
}
export async function signOut(auth: ReturnType<typeof getAuth>) {
  setCur(auth, null);
}
export async function updatePassword() {}
export async function deleteUser() {}
export const isSignInWithEmailLink = () => false;
export async function signInWithEmailLink() {
  throw new Error('not in mock');
}
export async function sendSignInLinkToEmail() {}
export async function signInWithPopup() {
  throw new Error('not in mock');
}
export class GoogleAuthProvider {
  setCustomParameters() {}
}
// Harness helper: make a teacher account and sign in as it.
export function mockSignInTeacher(name = 'Arda') {
  const all = users();
  let t = Object.values(all).find((u) => u.email === 'teacher@example.com');
  if (!t) {
    t = { uid: 'teacher1', email: 'teacher@example.com', displayName: name };
    all[t.uid] = t;
    persist('mockauth', all);
  }
  sessionStorage.setItem('mockuid', t.uid);
}
export async function sendPasswordResetEmail() {}
export async function updateProfile(u: User, p: { displayName?: string }) {
  if (p.displayName) u.displayName = p.displayName;
}
export async function sendEmailVerification() {}
export async function reauthenticateWithPopup() {}
export async function reauthenticateWithCredential() {}
export const EmailAuthProvider = { credential: () => ({}) };
export async function fetchSignInMethodsForEmail() { return []; }
export async function setPersistence() {}
export const browserLocalPersistence = {};
export async function linkWithCredential() {}
export async function signInWithRedirect() {}
export async function getRedirectResult() { return null; }
export const initializeAuth = (app: { name: string }) => getAuth(app);
export const browserSessionPersistence = {};
export const browserPopupRedirectResolver = {};
// A one-time pass from the server function (a super admin signing in as someone): not used in tests.
export async function signInWithCustomToken(_auth: unknown, _token: string): Promise<never> {
  throw Object.assign(new Error('Not in tests'), { code: 'auth/invalid-custom-token' });
}
