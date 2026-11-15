// A timestamp may belong to several messages. Keep their IDs at the boundary
// so a later message with the same timestamp cannot be skipped by ID order.
export function digestCursor(chat, uid) {
  const seen = Number(chat.seen?.[uid] ?? 0);
  const sent = Number(chat.digested?.[uid] ?? 0);
  if (seen >= sent) return { at: seen, ids: null };
  const ids = chat.digestedIds?.[uid];
  // Legacy summaries have only a timestamp and keep their old exclusive bound.
  return { at: sent, ids: Array.isArray(ids) ? ids : null };
}

export function mayHaveEligibleMessage(chat, uid, cutoff) {
  const cursor = digestCursor(chat, uid);
  const lastAt = Number(chat.lastAt ?? 0);
  return Boolean(chat.last && lastAt > 0 && cursor.at <= cutoff
    && (chat.digestedPending?.[uid] === true || (chat.last.by !== uid
      && (lastAt > cursor.at || (lastAt === cursor.at && cursor.ids
        && chat.last.id && !cursor.ids.includes(chat.last.id))))));
}

export function eligibleMessages(messages, cursor, cutoff) {
  return messages.filter((message) => message.at <= cutoff
    && (message.at > cursor.at || (message.at === cursor.at && cursor.ids && !cursor.ids.includes(message.id))));
}

export const DIGEST_PAGE_SIZE = 100;
export const DIGEST_MAX_PAGES = 5;

// Read at most 500 documents per chat per run. A page position is saved when
// more may remain, while the marker advances only through processed messages.
export async function collectSummaryBatch(source, cursor, cutoff, uid, pageSize = DIGEST_PAGE_SIZE, maxPages = DIGEST_MAX_PAGES) {
  let lastDocument = null;
  let marker = { at: cursor.at, ids: cursor.ids ?? [] };
  let processed = false;
  let count = 0;
  let more = false;
  let scanAfter = null;
  const preview = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = lastDocument ? source.startAfter(lastDocument) : source;
    const snapshot = await query.limit(pageSize).get();
    if (!snapshot.docs.length) { more = false; break; }
    const eligible = eligibleMessages(snapshot.docs.map((document) => ({ ...document.data(), id: document.id })), cursor, cutoff);
    if (eligible.length) {
      processed = true;
      const at = eligible.at(-1).at;
      const ids = eligible.filter((message) => message.at === at).map((message) => message.id);
      marker = { at, ids: at === marker.at ? [...new Set([...marker.ids, ...ids])] : ids };
      for (const message of eligible) {
        if (message.by === uid || message.deleted) continue;
        count += 1;
        preview.push(message);
        if (preview.length > 5) preview.shift();
      }
    }
    lastDocument = snapshot.docs.at(-1);
    scanAfter = { at: Number(lastDocument.data().at), id: lastDocument.id };
    more = snapshot.docs.length === pageSize;
    if (!more) break;
  }
  return { processed, marker, count, preview, more, scanAfter: more ? scanAfter : null };
}
