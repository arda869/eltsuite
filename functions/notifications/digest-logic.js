// The message ID breaks ties when two messages share Date.now(). Old summaries
// only stored a timestamp, so their previous boundary stays exclusive.
export function digestCursor(chat, uid) {
  const seen = Number(chat.seen?.[uid] ?? 0);
  const sent = Number(chat.digested?.[uid] ?? 0);
  return seen >= sent ? { at: seen, id: null } : { at: sent, id: chat.digestedId?.[uid] ?? null };
}

export function mayHaveEligibleMessage(chat, uid, cutoff) {
  const cursor = digestCursor(chat, uid);
  const lastAt = Number(chat.lastAt ?? 0);
  return Boolean(chat.last && lastAt > 0 && cursor.at <= cutoff
    && (chat.digestedPending?.[uid] === true || (chat.last.by !== uid
      && (lastAt > cursor.at || (lastAt === cursor.at && cursor.id && chat.last.id > cursor.id)))));
}

export function eligibleMessages(messages, cursor, cutoff) {
  return messages.filter((message) => message.at <= cutoff
    && (message.at > cursor.at || (message.at === cursor.at && cursor.id && message.id > cursor.id)))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export const DIGEST_PAGE_SIZE = 100;
export const DIGEST_MAX_PAGES = 5;

// Bound reads and memory to 500 documents per chat per run. The persisted
// timestamp + ID resumes after the last processed document on the next run.
export async function collectSummaryBatch(source, cursor, cutoff, uid, pageSize = DIGEST_PAGE_SIZE, maxPages = DIGEST_MAX_PAGES) {
  let lastDocument = null;
  let marker = cursor;
  let processed = false;
  let count = 0;
  let more = false;
  const preview = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = lastDocument ? source.startAfter(lastDocument) : source;
    const snapshot = await query.limit(pageSize).get();
    if (!snapshot.docs.length) { more = false; break; }
    const eligible = eligibleMessages(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })), cursor, cutoff);
    if (eligible.length) {
      processed = true;
      const last = eligible.at(-1);
      marker = { at: last.at, id: last.id };
      for (const message of eligible) {
        if (message.by === uid || message.deleted) continue;
        count += 1;
        preview.push(message);
        if (preview.length > 5) preview.shift();
      }
    }
    lastDocument = snapshot.docs.at(-1);
    more = snapshot.docs.length === pageSize;
    if (!more) break;
  }
  return { processed, marker, count, preview, more };
}
