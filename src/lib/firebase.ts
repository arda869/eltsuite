import { initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, browserSessionPersistence, getAuth, GoogleAuthProvider, initializeAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';

export const app = initializeApp(firebaseConfig);
// A "view as a learner" tab keeps its sign-in to itself, so the teacher's other tabs stay signed in.
const proxyTab = (() => {
  try {
    return !!sessionStorage.getItem('ll.proxy');
  } catch {
    return false;
  }
})();
export const auth = proxyTab ? initializeAuth(app, { persistence: browserSessionPersistence, popupRedirectResolver: browserPopupRedirectResolver }) : getAuth(app);

// Answers and edits are kept on the device first and sent when the connection returns.
// The device cache is shared by all open tabs, and only one tab talks to the server for all of them,
// using its own sign-in. A view-as-learner tab is signed in as someone else, so it keeps a cache of
// its own; sharing would send the teacher's requests with the learner's sign-in, and they would fail.
function makeDb() {
  if (proxyTab) return initializeFirestore(app, { localCache: memoryLocalCache() });
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}
export const db = makeDb();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const rtdb = getDatabase(app);
