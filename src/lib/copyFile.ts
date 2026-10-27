import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { copyState } from '../collab/provider';
import { newDocInFolder, newSharedDoc, type SharedDoc, type SharedFolder } from './sharedDocs';

// A copy of a file, with everything in it: the text written together, the cards, the reading,
// the lesson's tasks or the PDF's pages. Into My files, or into a folder of the organisation library.

const PARTS = ['cards', 'sources', 'tasks', 'pdf'];
export async function copyFile(d: SharedDoc, me: { uid: string; name: string }, to: SharedFolder | null, title = d.title): Promise<string> {
  const id = to ? await newDocInFolder(to, me, d.kind, { ltype: d.ltype, title }) : await newSharedDoc(me, d.kind, title);
  const made = (await getDoc(doc(db, 'sharedDocs', id))).data() as SharedDoc;
  const src = d as SharedDoc & { flash?: unknown; pd?: unknown; citeStyle?: string; size?: number };
  const extra = Object.fromEntries(Object.entries({ flash: src.flash, pd: src.pd, citeStyle: src.citeStyle, ltype: d.ltype, size: src.size }).filter(([, v]) => v !== undefined));
  if (Object.keys(extra).length) await updateDoc(doc(db, "sharedDocs", id), extra as Record<string, string>);
  await copyState(d.docKey, made.docKey).catch(() => false);
  for (const p of PARTS) {
    const rows = await getDocs(collection(db, 'sharedDocs', d.id, p)).catch(() => null);
    await Promise.all((rows?.docs ?? []).map((r) => setDoc(doc(db, 'sharedDocs', id, p, r.id), r.data())));
  }
  return id;
}
