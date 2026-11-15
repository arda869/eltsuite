// Keep the IDs at the cursor timestamp: two messages can share Date.now().
export function digestCursor(chat, uid) {
  const seen = Number(chat.seen?.[uid] ?? 0);
  const sent = Number(chat.digested?.[uid] ?? 0);
  if (seen >= sent) return { at: seen, ids: [], includeSame: false };
  const ids = chat.digestedIds?.[uid];
  // Preserve the old job's timestamp-only boundary for existing summaries.
  return { at: sent, ids: Array.isArray(ids) ? ids : [], includeSame: Array.isArray(ids) };
}

export function mayHaveEligibleMessage(chat, uid, cutoff) {
  const cursor = digestCursor(chat, uid);
  const lastAt = Number(chat.lastAt ?? 0);
  return Boolean(chat.last && chat.last.by !== uid && lastAt > 0 && cursor.at <= cutoff
    && (lastAt > cursor.at || (lastAt === cursor.at && cursor.includeSame
      && chat.last.id && !cursor.ids.includes(chat.last.id))));
}

export function eligibleMessages(messages, cursor, cutoff) {
  return messages.filter((message) => message.at <= cutoff
    && (message.at > cursor.at || (message.at === cursor.at && cursor.includeSame && !cursor.ids.includes(message.id))))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function nextDigestMarker(chat, uid, messages) {
  return advanceDigestMarker({ at: Number(chat.digested?.[uid] ?? 0), ids: chat.digestedIds?.[uid] ?? [] }, messages);
}

function advanceDigestMarker(marker, messages) {
  const at = messages.at(-1).at;
  const ids = messages.filter((message) => message.at === at).map((message) => message.id);
  return { at, ids: at === marker.at ? [...new Set([...marker.ids, ...ids])] : ids };
}

export const DIGEST_PAGE_SIZE = 100;
export const DIGEST_MAX_PAGES = 5;

// Process at most 500 documents per chat per scheduled run. The marker stops at
// the last processed message, so a longer unread history continues next run.
export async function collectSummaryBatch(source, cursor, cutoff, initialMarker, uid, pageSize = DIGEST_PAGE_SIZE, maxPages = DIGEST_MAX_PAGES) {
  let lastDocument = null;
  let marker = initialMarker;
  let processed = false;
  let count = 0;
  const preview = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = lastDocument ? source.startAfter(lastDocument) : source;
    const snapshot = await query.limit(pageSize).get();
    if (!snapshot.docs.length) break;
    const eligible = eligibleMessages(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })), cursor, cutoff);
    if (eligible.length) {
      processed = true;
      marker = advanceDigestMarker(marker, eligible);
      for (const message of eligible) {
        if (message.by === uid || message.deleted) continue;
        count += 1;
        preview.push(message);
        if (preview.length > 5) preview.shift();
      }
    }
    lastDocument = snapshot.docs.at(-1);
    if (snapshot.docs.length < pageSize) break;
  }
  return { processed, marker, count, preview };
}
