// Marking scales for long answers.
export type Criterion = { name: string; max: number };
export const CAMBRIDGE: Criterion[] = [
  { name: 'Content', max: 5 },
  { name: 'Communicative achievement', max: 5 },
  { name: 'Organisation', max: 5 },
  { name: 'Language', max: 5 },
];
export const GENRES = ['essay', 'article', 'email', 'letter', 'report', 'review', 'story', 'proposal'];
export const genreLabel = (g?: string) => (g ? g[0].toUpperCase() + g.slice(1) : '');

// The criteria a long answer is marked on, or null for a single mark.
export function criteriaOf(a: { rubric?: string; criteria?: Criterion[] } | undefined): Criterion[] | null {
  if (!a?.rubric || a.rubric === 'none') return null;
  if (a.rubric === 'cambridge') return CAMBRIDGE;
  const c = (a.criteria ?? []).filter((x) => x.name?.trim());
  return c.length ? c : null;
}
export const maxOf = (c: Criterion[]) => c.reduce((s, x) => s + (x.max || 0), 0);
