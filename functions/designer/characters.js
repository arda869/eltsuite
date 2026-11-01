import { HttpsError } from 'firebase-functions/v2/https';
// Identity references come from the user's persistent media library, never URLs
// supplied by a prompt. Authorise each reference independently of the design.
export async function characterReferences(db, uid, ids = []) {
  if (!Array.isArray(ids) || ids.length > 4 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)))
    throw new HttpsError('invalid-argument', 'Choose up to four characters from your library.');
  const results = [];
  let total = 0;
  for (const id of ids) {
    const snap = await db.doc(`videoAssets/${id}`).get(), a = snap.data();
    let allowed = a?.owner === uid || (Array.isArray(a?.readers) && a.readers.includes(uid));
    if (!allowed && typeof a?.org === 'string' && /^[\w-]{1,100}$/.test(a.org)) {
      const org = (await db.doc(`orgs/${a.org}`).get()).data();
      allowed = !!org?.teachers?.[uid];
    }
    if (!a?.ready || a.kind !== 'character' || !allowed) throw new HttpsError('permission-denied', 'A character is no longer available to you. Choose another character.');
    if (!/^image\/(png|jpeg|webp)$/.test(a.type) || !Number.isSafeInteger(a.parts) || a.parts < 1 || a.parts > 28 || !Number.isSafeInteger(a.size) || a.size < 1 || a.size > 12*1024*1024)
      throw new HttpsError('invalid-argument', 'Use character images up to 12 MB.');
    const chunks = []; let size = 0;
    for (let i=0; i<a.parts; i++) {
      const part = (await snap.ref.collection('parts').doc(String(i)).get()).data();
      if (typeof part?.data !== 'string' || part.data.length > 614400 || !/^[A-Za-z0-9+/]+={0,2}$/.test(part.data)) throw new HttpsError('invalid-argument', 'A character reference is incomplete.');
      const bytes = Buffer.from(part.data, 'base64'); size += bytes.length; total += bytes.length;
      if (size > 12*1024*1024 || total > 24*1024*1024) throw new HttpsError('invalid-argument', 'Choose smaller character reference images.');
      chunks.push(bytes);
    }
    if (size !== a.size) throw new HttpsError('invalid-argument', 'A character reference is incomplete.');
    results.push({name:typeof a.name==='string'?a.name.slice(0,100):'Character',description:typeof a.description==='string'?a.description.slice(0,1000):'',image:`data:${a.type};base64,${Buffer.concat(chunks).toString('base64')}`});
  }
  return results;
}
