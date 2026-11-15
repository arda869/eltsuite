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
  const at = messages.at(-1).at;
  const previousIds = Number(chat.digested?.[uid] ?? 0) === at ? chat.digestedIds?.[uid] ?? [] : [];
  return { at, ids: [...new Set([...previousIds, ...messages.filter((message) => message.at === at).map((message) => message.id)])] };
}
