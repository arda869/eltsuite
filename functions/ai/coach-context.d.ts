export type ContextPermissions = { profile: boolean; beliefs: boolean; reflections: boolean; inquiries: boolean };
export const contextDefaults: ContextPermissions;
export function contextPermissions(value?: Partial<ContextPermissions> | null): ContextPermissions;
export function profileComplete(profile: unknown): boolean;
export function relevantWriting(rows: Record<string, unknown>[], prompt: string, limit: number, preferredId?: string): Record<string, unknown>[];
export function writingExcerpt(row: Record<string, unknown>, kind: string): Record<string, string>;

export function beliefsComplete(profile: unknown): boolean;
