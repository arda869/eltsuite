// Only shipped workflows with a successful completion hook belong here. No AI or upselling.
export const FEATURES = [
  { id: 'lessons', app: 'classes', name: 'Lessons', icon: 'task', goal: 'lesson', path: '/classes', topic: 'lessons', benefit: 'Bring activities, answers and teaching notes into one lesson.', steps: ['Open a class and add a lesson.', 'Add a task and write your activity.', 'Save your activity, then preview it before teaching.'], related: ['assessment', 'notes', 'timetable'] },
  { id: 'notes', app: 'classes', name: 'Teacher notes', icon: 'task', goal: 'lesson', path: '/classes', topic: 'lessons', benefit: 'Keep your teaching prompts beside the activity, separate from learner materials.', steps: ['Open a lesson in your class.', 'Open the teacher notes for a task.', 'Write and save a reminder for your next lesson.'], related: ['lessons'] },
  { id: 'assessment', app: 'classes', name: 'Marking and feedback', icon: 'poll', goal: 'lesson', path: '/classes', topic: 'progress', benefit: 'Give learners a score or a comment on their submitted work.', steps: ['Open a class and a lesson with learner answers.', 'Choose a learner’s submitted answer.', 'Add and save a mark or feedback comment.'], related: ['lessons', 'live'] },
  { id: 'live', app: 'classes', name: 'Teach live', icon: 'present', goal: 'live', path: '/classes', topic: 'live', benefit: 'Let learners follow your lesson while you see who needs help.', steps: ['Open a prepared lesson in a class.', 'Invite learners using the class code.', 'Choose Teach live when you are ready to start.'], related: ['lessons', 'assessment'] },
  { id: 'timetable', app: 'timetable', name: 'Timetable', icon: 'calendar', goal: 'lesson', path: '/timetable', topic: 'week', benefit: 'Put your next class or meeting in your week so it is easy to find.', steps: ['Open Timetable.', 'Add a class or meeting and choose its time.', 'Save the session to see it in your week.'], related: ['lessons', 'live'] },
  { id: 'collab', app: 'collab', name: 'Collab', icon: 'task', goal: 'materials', path: '/collab', topic: 'notation', benefit: 'Create reusable materials with language-teaching tools built into your document.', steps: ['Open Collab and make a document.', 'Write your activity; type / to explore the teaching tools.', 'Preview your material and choose how to share it.'], related: ['lessons', 'reading'] },
  { id: 'reading', app: 'reading', name: 'Reading Journal', icon: 'folder', goal: 'study', path: '/reading', topic: 'files', benefit: 'Keep your sources, reading notes and references together for your next project.', steps: ['Open Reading Journal and make a journal.', 'Add a source and its details.', 'Write a note beneath the source so you can find it again.'], related: ['collab'] },
] as const;
export type FeatureId = typeof FEATURES[number]['id'];
export type Feature = typeof FEATURES[number];
export const DAY = 86_400_000;
export type Usage = { count: number; lastUsed: number; events: string[]; guided: boolean };
export type Feedback = { dismissed?: boolean; snoozedUntil?: number; offeredAt?: number; guideStarted?: boolean; openedAt?: number };
export type Settings = { tracking: boolean; enabled: boolean; gapDays: number; quietStart: number; quietEnd: number; pausedUntil: number };
export type DiscoveryState = { settings: Settings; usage: Partial<Record<FeatureId, Usage>>; feedback: Partial<Record<FeatureId, Feedback>>; delivery: { feature: FeatureId | ''; at: number; read: boolean } };
export const defaults = (): DiscoveryState => ({ settings: { tracking: false, enabled: false, gapDays: 7, quietStart: 20, quietEnd: 8, pausedUntil: 0 }, usage: {}, feedback: {}, delivery: { feature: '', at: 0, read: true } });
export const isFeature = (id: string): id is FeatureId => FEATURES.some(f => f.id === id);
export const usageLabel = (u?: Usage) => !u?.count ? 'Not explored yet' : u.count === 1 ? 'Tried once' : u.count < 3 ? 'Tried a few times' : 'Used regularly';
export function quiet(s: Settings, hour: number) {
  return s.quietStart === s.quietEnd ? false : s.quietStart < s.quietEnd ? hour >= s.quietStart && hour < s.quietEnd : hour >= s.quietStart || hour < s.quietEnd;
}
export function recommendations(state: DiscoveryState, allowed: readonly FeatureId[], path: string, goal = '', now = Date.now()) {
  return FEATURES.filter(f => allowed.includes(f.id) && !state.usage[f.id]?.count && !state.feedback[f.id]?.dismissed && (state.feedback[f.id]?.snoozedUntil ?? 0) <= now)
    .map(f => ({ feature: f, score: (f.goal === goal ? 5 : 0) + (path.startsWith('/class/') && f.app === 'classes' ? 4 : path.startsWith(f.path) ? 3 : 0) + f.related.reduce((n, id) => n + (state.usage[id as FeatureId]?.count ? 2 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
}
export function canDeliver(state: DiscoveryState, now: number, hour: number) {
  return state.settings.tracking && state.settings.enabled && state.settings.pausedUntil <= now && !quiet(state.settings, hour)
    && (state.delivery.read || !state.delivery.feature) && now - state.delivery.at >= state.settings.gapDays * DAY;
}
export function completed(state: DiscoveryState, id: FeatureId, token: string, now: number): DiscoveryState {
  if (!state.settings.tracking) return state;
  const old = state.usage[id];
  if (old?.events.includes(token)) return state;
  return { ...state, usage: { ...state.usage, [id]: { count: Math.min(10000, (old?.count ?? 0) + 1), lastUsed: Math.floor(now / DAY) * DAY, events: [...(old?.events ?? []), token].slice(-80), guided: !!old?.guided || !!state.feedback[id]?.guideStarted } }, delivery: state.delivery.feature === id ? { ...state.delivery, read: true } : state.delivery };
}
