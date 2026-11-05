import type { Responses } from './questions';

export type ResponseBase = { learnerUid: string; learnerId: string; itemId: string; taskId: string };
export type ResponseSaveState = 'saved' | 'unsaved' | 'saving' | 'waiting' | 'error';
type Entry = {
  base: ResponseBase;
  responses: Responses;
  revision: number;
  savedRevision: number;
  state: ResponseSaveState;
  timer?: number;
  running?: Promise<boolean>;
};

/** One serial save lane per activity. A later activity cannot cancel or overtake this one. */
export class ResponseSaveQueue {
  private entries = new Map<string, Entry>();
  private disposed = false;
  constructor(
    private readonly scope: string,
    private readonly save: (base: ResponseBase, responses: Responses) => Promise<void>,
    private readonly changed: () => void,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
  ) {}

  private key(taskId: string) { return `ll.answerDraft:${this.scope}:${taskId}`; }
  private notify(entry: Entry, state: ResponseSaveState) {
    entry.state = state;
    if (!this.disposed) this.changed();
  }
  status(taskId: string): ResponseSaveState { return this.entries.get(taskId)?.state ?? 'saved'; }
  latest(taskId: string): Responses | null { return this.entries.get(taskId)?.responses ?? null; }
  hasUnsaved(taskId: string): boolean {
    const e = this.entries.get(taskId);
    return !!e && (e.revision > e.savedRevision || e.state === 'error');
  }
  draft(taskId: string, base: ResponseBase): Responses | null {
    const existing = this.entries.get(taskId);
    if (existing && this.hasUnsaved(taskId)) return existing.responses;
    try {
      const saved = this.storage.getItem(this.key(taskId));
      if (!saved) return null;
      const parsed = JSON.parse(saved) as { responses?: Responses };
      if (!parsed.responses || typeof parsed.responses !== 'object') return null;
      this.entries.set(taskId, { base, responses: parsed.responses, revision: 1, savedRevision: 0, state: 'unsaved' });
      this.changed();
      this.schedule(taskId);
      return parsed.responses;
    } catch { return null; }
  }
  update(base: ResponseBase, responses: Responses) {
    const entry = this.entries.get(base.taskId) ?? { base, responses, revision: 0, savedRevision: 0, state: 'saved' as ResponseSaveState };
    entry.base = base;
    entry.responses = responses;
    entry.revision += 1;
    this.entries.set(base.taskId, entry);
    try { this.storage.setItem(this.key(base.taskId), JSON.stringify({ responses, updatedAt: Date.now() })); } catch { /* Firestore still receives the save. */ }
    this.notify(entry, navigator.onLine ? 'unsaved' : 'waiting');
    this.schedule(base.taskId);
  }
  private schedule(taskId: string) {
    const entry = this.entries.get(taskId);
    if (!entry || this.disposed) return;
    window.clearTimeout(entry.timer);
    entry.timer = window.setTimeout(() => { void this.flush(taskId); }, 600);
  }
  async flush(taskId: string): Promise<boolean> {
    const entry = this.entries.get(taskId);
    if (!entry) return true;
    window.clearTimeout(entry.timer);
    if (entry.running) return entry.running.then(ok => !ok ? false : this.hasUnsaved(taskId) ? this.flush(taskId) : true);
    if (entry.revision <= entry.savedRevision) return true;
    if (!navigator.onLine) { this.notify(entry, 'waiting'); return false; }
    entry.running = (async () => {
      while (entry.savedRevision < entry.revision) {
        const revision = entry.revision;
        const responses = entry.responses;
        this.notify(entry, 'saving');
        try {
          await this.save(entry.base, responses);
          entry.savedRevision = revision;
          if (revision === entry.revision) {
            try { this.storage.removeItem(this.key(taskId)); } catch { /* No local fallback available. */ }
            this.notify(entry, 'saved');
          }
        } catch {
          this.notify(entry, navigator.onLine ? 'error' : 'waiting');
          return false;
        }
      }
      return true;
    })().finally(() => { entry.running = undefined; });
    return entry.running;
  }
  async flushAll(): Promise<boolean> {
    const results = await Promise.all([...this.entries.keys()].map(id => this.flush(id)));
    return results.every(Boolean);
  }
  retry(taskId: string) { return this.flush(taskId); }
  reconnect() { for (const [id, entry] of this.entries) if (entry.revision > entry.savedRevision && !entry.running) void this.flush(id); }
  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) window.clearTimeout(entry.timer);
  }
}
