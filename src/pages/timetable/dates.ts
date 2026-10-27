// Dates for the timetable, in the viewer's own clock. Days start at midnight; minutes are set
// with setHours so a day with a clock change still lands on the right wall-clock time.

export const DAY = 864e5;
export const SNAP = 15; // minutes
export type View = 'day' | 'week' | 'month' | 'schedule';
export const VIEWS: { k: View; label: string; key: string }[] = [
  { k: 'day', label: 'Day', key: 'd' },
  { k: 'week', label: 'Week', key: 'w' },
  { k: 'month', label: 'Month', key: 'm' },
  { k: 'schedule', label: 'Schedule', key: 'a' },
];
const SCHEDULE_DAYS = 28;

export const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export const addDays = (t: number, n: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
export const addMonths = (t: number, n: number) => {
  const d = new Date(startOfDay(t));
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
};
export const mondayOf = (t: number) => {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};
export const monthStart = (t: number) => {
  const d = new Date(startOfDay(t));
  d.setDate(1);
  return d.getTime();
};
export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
export const isToday = (t: number) => sameDay(t, Date.now());
export const minutesOf = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
// A wall-clock time on a day: setHours copes with minutes past 60 and with clock changes.
export const atMinutes = (day: number, mins: number) => {
  const d = new Date(startOfDay(day));
  d.setHours(0, mins, 0, 0);
  return d.getTime();
};
export const dayDiff = (a: number, b: number) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
export const snap = (mins: number, to = SNAP) => Math.round(mins / to) * to;
export const snapDown = (mins: number, to = SNAP) => Math.floor(mins / to) * to;

// The days a view shows, and the time it covers.
export function span(view: View, anchor: number) {
  if (view === 'day') {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1), days: [from] };
  }
  if (view === 'week') {
    const from = mondayOf(anchor);
    return { from, to: addDays(from, 7), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
  }
  if (view === 'month') {
    const first = monthStart(anchor);
    const from = mondayOf(first);
    const inMonth = new Date(new Date(first).getFullYear(), new Date(first).getMonth() + 1, 0).getDate();
    const rows = Math.ceil((dayDiff(from, first) + inMonth) / 7);
    return { from, to: addDays(from, rows * 7), days: Array.from({ length: rows * 7 }, (_, i) => addDays(from, i)) };
  }
  const from = startOfDay(anchor);
  return { from, to: addDays(from, SCHEDULE_DAYS), days: Array.from({ length: SCHEDULE_DAYS }, (_, i) => addDays(from, i)) };
}
export function step(view: View, anchor: number, dir: number) {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'week') return addDays(anchor, 7 * dir);
  if (view === 'month') return addMonths(anchor, dir);
  return addDays(anchor, SCHEDULE_DAYS * dir);
}
const f = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString(undefined, o);
// The heading for what is on screen.
export function spanTitle(view: View, anchor: number, short = false) {
  const { from, to } = span(view, anchor);
  const year = new Date(anchor).getFullYear() !== new Date().getFullYear() || !short ? ({ year: 'numeric' } as const) : {};
  if (view === 'day') return f(anchor, short ? { weekday: 'short', day: 'numeric', month: 'short', ...year } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'month') return f(anchor, { month: 'long', year: 'numeric' });
  const last = addDays(to, -1);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...year }).formatRange(new Date(from), new Date(last));
}
export const longDay = (t: number) => f(t, { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDay = (t: number) => f(t, { weekday: 'short', day: 'numeric', month: 'short' });
const tf = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export const clock = (t: number) => tf.format(new Date(t));
export const clockRange = (a: number, b: number) => tf.formatRange(new Date(a), new Date(b));
export const hourLabel = (h: number) => new Date(2020, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
export function lengthText(mins: number) {
  if (mins < 60) return `${mins} min`;
  return mins % 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins / 60} h`;
}
// The next whole hour from now, or 9 in the morning on another day.
export function niceStart(day: number) {
  if (isToday(day)) {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.getTime() + 3600e3;
  }
  return atMinutes(day, 9 * 60);
}
