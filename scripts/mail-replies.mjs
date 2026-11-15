import crypto from 'node:crypto';

const address = value => String(value ?? '').trim().toLowerCase();
const dmId = (a, b) => 'dm_' + [a, b].sort().join('_');

// A reply must belong to one thread. Some mail servers retain the plus address,
// while others deliver to the base mailbox and leave only the subject token.
export function replyToken(message) {
  const recipients = [message.to?.text ?? '', message.headers?.get('delivered-to') ?? ''].join(' ');
  const alias = /\+([0-9a-f]{12})@/i.exec(recipients)?.[1]?.toLowerCase();
  const subject = /\[#([0-9a-f]{12})\]/i.exec(message.subject ?? '')?.[1]?.toLowerCase();
  return alias && subject && alias !== subject ? null : alias || subject || null;
}

export function replySenderMatches(message, learner) {
  const from = message.from?.value ?? [];
  const sender = message.sender?.value ?? [];
  const expected = address(learner?.contactEmail);
  return Boolean(expected && learner?.role === 'learner' && from.length === 1 &&
    address(from[0]?.address) === expected &&
    (!sender.length || sender.length === 1 && address(sender[0]?.address) === expected));
}

export function freshReply(textBody) {
  const lines = String(textBody ?? '').replace(/\r/g, '').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^>/.test(line) || /^On .+wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From:\s/i.test(line) || /^Sent from my /i.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim().slice(0, 4000);
}

export function replyMessageId(token, message, uid, uidValidity) {
  const identity = String(message.messageId ?? '').trim() || `${String(uidValidity ?? '')}:${String(uid ?? '')}`;
  return 'email_' + crypto.createHash('sha256').update(token + '\0' + identity).digest('hex').slice(0, 32);
}

// Permanently invalid mail is handled once in the dedicated reply mailbox.
// A database or post failure leaves it unread so the next run can retry it.
export async function handleIncomingReply({ message, uid, uidValidity, getThread, getLearner, post, markSeen }) {
  const token = replyToken(message);
  const thread = token ? await getThread(token) : null;
  if (!thread?.learnerUid) {
    await markSeen();
    return 'ignored';
  }
  const learner = await getLearner(thread.learnerUid);
  if (learner?.learnerId !== thread.learnerId || learner?.classId !== thread.classId || !replySenderMatches(message, learner)) {
    await markSeen();
    return 'ignored';
  }
  const text = freshReply(message.text);
  const posted = text ? await post(thread, text, replyMessageId(token, message, uid, uidValidity)) : false;
  await markSeen();
  return text ? posted ? 'posted' : 'duplicate' : 'empty';
}

// A stable message ID and one transaction prevent a duplicate chat message if
// posting succeeds but marking the IMAP message as seen fails or the job restarts.
export async function postEmailReply(db, thread, text, messageId, at = Date.now()) {
  const id = dmId(thread.teacher, thread.learnerId);
  const ref = db.collection('chats').doc(id), messageRef = ref.collection('msgs').doc(messageId);
  return db.runTransaction(async tx => {
    const [chat, existing] = await Promise.all([tx.get(ref), tx.get(messageRef)]);
    if (existing.exists) return false;
    if (chat.exists && (chat.get('classId') !== thread.classId ||
      !chat.get('members')?.includes(thread.teacher) || !chat.get('members')?.includes(thread.learnerId))) {
      throw Error('The email thread no longer matches this chat.');
    }
    const last = { id: messageRef.id, text: text.slice(0, 140), name: thread.learnerName, by: thread.learnerId, mentions: [] };
    tx.set(ref, {
      ...(chat.exists ? {} : { members: [thread.teacher, thread.learnerId], names: { [thread.teacher]: thread.teacherName, [thread.learnerId]: thread.learnerName }, roles: { [thread.teacher]: 'teacher', [thread.learnerId]: 'learner' }, classId: thread.classId, kind: 'dm', createdBy: thread.learnerId, createdAt: at }),
      at, lastAt: at, last, emailThread: true,
      seen: { [thread.learnerId]: at }, mailed: { [thread.learnerId]: at },
    }, { merge: true });
    tx.set(messageRef, { by: thread.learnerId, name: thread.learnerName, role: 'learner', at, text,
      content: { type: 'doc', content: text.split(/\n{2,}/).map(p => ({ type: 'paragraph', content: p.trim() ? [{ type: 'text', text: p.trim() }] : [] })) },
      viaEmail: true, mentions: [] });
    return true;
  });
}
