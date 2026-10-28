// An organisation's limit reached (see LIMITS in lib/admin.ts): the message says which, in plain words.
export class LimitError extends Error {
  name = 'LimitError';
}

type OrgLike = { name?: string; limits?: Record<string, number | undefined>; usage?: Record<string, unknown> };
const UNIT: Record<string, string> = { classes: 'classes', learners: 'learners', teachers: 'teachers' };

// Within a transaction or before a batch: room for one more class or learner in this organisation?
// Returns the new count to write, or null when the organisation has no such limit.
export function countOne(o: OrgLike | undefined, k: 'classes' | 'learners'): number | null {
  const limit = o?.limits?.[k];
  if (typeof limit !== 'number') return null;
  const used = Number(o?.usage?.[k] ?? 0);
  if (used >= limit) throw new LimitError(`${o?.name || 'Your organisation'} has reached its limit of ${limit} ${UNIT[k]}. Ask an admin of ${o?.name || 'your organisation'} to raise it with ELT Suite.`);
  return used + 1;
}
