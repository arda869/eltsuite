import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../src/lib/firebase';
import { archiveAdd, archiveGet, archiveRemove, archiveRestore, archiveUpdate } from '../src/lib/archive';
import { newSharedDoc, newDocInFolder, renameDoc, removeSharedDoc, restoreSharedDoc, setDocPath, type SharedDoc, type SharedFolder } from '../src/lib/sharedDocs';
import { normalFileName, uniqueFileName } from '../src/lib/fileNames';
const lines: string[] = [];
const check = (v: unknown, text: string) => { if (!v) throw new Error(text); lines.push('PASS ' + text); };
const read = async (id: string) => ({ id, ...(await getDoc(doc(db, 'sharedDocs', id))).data() } as SharedDoc);
try {
  // Sign-in/fixtures are initialized by the smoke journey before this route opens.
  const owner = { uid: auth.currentUser!.uid, name: 'File tools test' };
  const prefix = 'File test ' + Date.now();
  check(uniqueFileName('Map.png', new Set(['map.png'])) === 'Map (2).png', 'extensions survive suffixing');
  check(normalFileName('  MAP  name ') === 'map name', 'case and whitespace normalisation');
  const one = await newSharedDoc(owner, 'doc', prefix);
  const two = await newSharedDoc(owner, 'doc', prefix);
  check((await read(two)).title === prefix + ' (2)', 'duplicate creation keeps both files');
  let duplicate = false;
  try { await renameDoc(two, prefix.toUpperCase()); } catch { duplicate = true; }
  check(duplicate && (await read(two)).title === prefix + ' (2)', 'duplicate rename rejects without modifying file');
  const image = await archiveAdd(owner.uid, { kind: 'image', name: prefix, folder: '', size: 2048, tags: [] });
  check((await archiveGet(owner.uid, image))?.name === prefix + ' (3)', 'names are unique across documents and media');
  await setDocPath(two, 'Destination');
  await setDocPath(one, 'Destination');
  check((await read(one)).title === prefix, 'different folders allow same base name');
  await removeSharedDoc(one);
  check(!!(await read(one)).deletedAt, 'delete retains document and metadata');
  const replacement = await newSharedDoc(owner, 'doc', prefix, 'Destination');
  await restoreSharedDoc(await read(one));
  check((await read(one)).title === prefix + ' (3)' && !!(await read(replacement)), 'restore conflict never overwrites a newer file');
  await archiveRemove(owner.uid, image);
  check(!!(await archiveGet(owner.uid, image))?.deletedAt, 'deleted media stays recoverable');
  await archiveRestore(owner.uid, (await archiveGet(owner.uid, image))!);
  check(!(await archiveGet(owner.uid, image))?.deletedAt, 'media restore clears deletion state');
  await archiveUpdate(owner.uid, (await archiveGet(owner.uid, image))!, { folder: 'Destination' });
  check((await archiveGet(owner.uid, image))?.folder === 'Destination', 'media moves preserve scope');
  const f = { id: 'drive-demo', owner: owner.uid, ownerName: owner.name, name: 'Library', members: {}, memberIds: [] } as SharedFolder;
  const a = await newDocInFolder(f, owner, 'doc', { title: prefix });
  const b = await newDocInFolder(f, owner, 'doc', { title: prefix });
  check((await read(a)).title === prefix && (await read(b)).title === prefix + ' (2)', 'organisation folder names are unique');
  const restoreMe = await newSharedDoc(owner, 'doc', 'Restore me ' + prefix);
  const removeMe = await newSharedDoc(owner, 'doc', 'Remove me ' + prefix);
  await removeSharedDoc(restoreMe); await removeSharedDoc(removeMe);
  document.querySelector('#result')!.textContent = lines.join('\n') + '\nALL PASSED';
} catch (e) { document.querySelector('#result')!.textContent = lines.join('\n') + '\nFAIL ' + (e as Error).stack; }
