// Each summary should contain only messages that arrived after the recipient
// last read the chat or after the most recent summary for that chat.
export const newUnreadSince = (chat, uid) => Math.max(chat.seen?.[uid] ?? 0, chat.digested?.[uid] ?? 0);

export const shouldSummarize = (chat, uid, now, after) => Boolean(
  chat.last && chat.last.by !== uid && chat.lastAt
  && newUnreadSince(chat, uid) < chat.lastAt
  && now - chat.lastAt >= after
);
