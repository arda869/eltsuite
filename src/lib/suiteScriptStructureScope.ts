/** A structural SuiteScript draft names one destination version for each A/B set. */
export type SuiteScriptScopeRow = { id: string; title: string; group?: string; version?: string };
export type SuiteScriptScopeGroup = { id: string; title: string; options: SuiteScriptScopeRow[] };

export function suiteScriptScopeGroups(rows: SuiteScriptScopeRow[]): SuiteScriptScopeGroup[] {
  const found = new Map<string, SuiteScriptScopeRow[]>();
  for (const row of rows) if (row.group) found.set(row.group, [...(found.get(row.group) ?? []), row]);
  return [...found].filter(([, options]) => options.length > 1).map(([id, options]) => ({ id, title: options[0].title || 'Activity', options }));
}

/** Retain page order. A missing or duplicate choice fails before an export or save. */
export function suiteScriptScopeIds(rows: SuiteScriptScopeRow[], choices: Record<string, string>): string[] {
  const groups = suiteScriptScopeGroups(rows);
  for (const group of groups) {
    if (!group.options.some(option => option.id === choices[group.id])) throw new Error(`Choose one version of ${group.title}.`);
  }
  const selected = rows.filter(row => !row.group || !groups.some(group => group.id === row.group) || choices[row.group] === row.id).map(row => row.id);
  if (!selected.length || new Set(selected).size !== selected.length) throw new Error('Choose the destination tasks before opening SuiteScript.');
  return selected;
}
