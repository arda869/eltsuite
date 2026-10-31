import { collection, doc, getDoc, getDocs, query, runTransaction, where, type DocumentData, type DocumentReference } from 'firebase/firestore';
import { auth, db } from './firebase';

export type FileScope = { owner: string; folder?: string; path?: string };
export const normalFileName = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
export const uniqueFileName = (name: string, used: Set<string>) => {
  if (!used.has(normalFileName(name))) return name;
  const ext = /\.[a-z0-9]{1,8}$/i.exec(name)?.[0] ?? '';
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let n = 2; ; n++) { const v = `${stem} (${n})${ext}`; if (!used.has(normalFileName(v))) return v; }
};
const scopeKey = (s: FileScope) => JSON.stringify([s.owner, s.folder || '', s.folder ? '' : s.path || '']);
const lockRef = async (s: FileScope) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scopeKey(s)));
  return doc(db, 'fileNamespaces', Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, '0')).join(''));
};
class RetryNames extends Error {}
// The namespace version is read BEFORE listing legacy files. A simultaneous create/rename/move
// changes it in the same transaction as the file, forcing a fresh list instead of a duplicate.
export async function writeNamedFile(ref: DocumentReference, scope: FileScope, requested: string, patch: DocumentData, create = false, suffix = false) {
  const lock = await lockRef(scope);
  const title = requested.trim().slice(0, 120) || 'Untitled';
  for (let attempt = 0; attempt < 12; attempt++) {
    const version = Number((await getDoc(lock)).data()?.version ?? 0);
    const sharedBy = scope.owner === auth.currentUser?.uid ? where('owner', '==', scope.owner) : where('memberIds', 'array-contains', auth.currentUser?.uid || '');
    const docs = await getDocs(query(collection(db, 'sharedDocs'), sharedBy));
    const used = new Set(docs.docs.filter((d) => d.ref.path !== ref.path && !d.data().deletedAt && d.data().owner === scope.owner && (d.data().folder || '') === (scope.folder || '') && (scope.folder || (d.data().path || '') === (scope.path || ''))).map((d) => normalFileName(String(d.data().title || 'Untitled'))));
    if (!scope.folder) {
      const media = await getDocs(collection(db, 'users', scope.owner, 'archive'));
      media.docs.filter((d) => d.ref.path !== ref.path && !d.data().deletedAt && (d.data().folder || '') === (scope.path || '')).forEach((d) => used.add(normalFileName(String(d.data().name || 'Untitled'))));
    }
    const name = suffix ? uniqueFileName(title, used) : title;
    if (used.has(normalFileName(name))) throw new Error(`“${title}” is already in this folder. Choose another name.`);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(lock);
        if (Number(snap.data()?.version ?? 0) !== version) throw new RetryNames();
        if (!create) {
          const current = await tx.get(ref);
          if (!current.exists() || current.data().purgeRequestedAt || current.data().purgingAt) throw new Error('This file is being deleted and cannot be changed.');
        }
        tx.set(lock, { owner: scope.owner, folder: scope.folder || '', path: scope.folder ? '' : scope.path || '', version: version + 1 });
        const data = { ...patch, [ref.path.startsWith('users/') ? 'name' : 'title']: name };
        if (create) tx.set(ref, data); else tx.update(ref, data);
      });
      return name;
    } catch (e) {
      if (e instanceof RetryNames) continue;
      // A competing commit can advance the namespace before rules validate this
      // write. Retry only when that revision actually changed; real denials stay errors.
      if ((e as {code?:string})?.code === 'permission-denied'
        && Number((await getDoc(lock)).data()?.version ?? 0) !== version) continue;
      throw e;
    }
  }
  throw new Error('This folder is changing in another window. Try again.');
}
