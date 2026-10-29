import { fromWall, wallOf } from './tz';

// How a session repeats, as in a calendar: every day (or every weekday), every few weeks on some
// days, every month or year on a date or on, say, the third Tuesday; until a number of times, a
// date, or for good. Each time is at the same wall-clock time in the session's own time zone.

export type Freq = 'day' | 'week' | 'month' | 'year';
export type Repeat = {
  freq: Freq;
  every: number; // every 1, 2, 3… days, weeks, months or years
  days?: number[]; // weekly: 0 Sunday … 6 Saturday
  weekdays?: boolean; // daily: Monday to Friday only
  by?: 'date' | 'nth' | 'last'; // monthly and yearly: on the 15th, on the third Tuesday, on the last Friday
  end: 'count' | 'until' | 'never';
  count?: number; // end 'count': this many times in all
  until?: string; // end 'until': the last day, YYYY-MM-DD, on the session's clock
};
type Sess = { start: number; repeat?: Repeat | null; weeks?: number };

export const MAX_TIMES = 730; // a series is never longer than this, also "for good"
const DAY = 864e5;
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NTH = ['first', 'second', 'third', 'fourth', 'fifth'];

// Sessions from before: "every week, for so many weeks".
export function repeatOf(s: { repeat?: Repeat | null; weeks?: number }): Repeat | null {
  if (s.repeat) return s.repeat;
  const n = Math.max(1, s.weeks ?? 1);
  return n > 1 ? { freq: 'week', every: 1, end: 'count', count: n } : null;
}
export const isSeries = (s: { repeat?: Repeat | null; weeks?: number }) => !!repeatOf(s);

type D = { y: number; mo: number; d: number };
const dayNo = (x: D) => Math.floor(Date.UTC(x.y, x.mo - 1, x.d) / DAY);
const fromNo = (n: number): D => {
  const t = new Date(n * DAY);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const weekday = (x: D) => new Date(Date.UTC(x.y, x.mo - 1, x.d)).getUTCDay();
const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const keyOf = (x: D) => x.y * 10000 + x.mo * 100 + x.d;
const untilKey = (s: string) => Number(s.replace(/-/g, '')) || 0;

// The day of a month for "the nth weekday" (n 1–5) or "the last weekday" (n -1); 0 if none.
function nthDay(y: number, mo: number, wd: number, n: number) {
  const dim = daysIn(y, mo);
  if (n < 0) {
    const last = weekday({ y, mo, d: dim });
    return dim - ((last - wd + 7) % 7);
  }
  const first = weekday({ y, mo, d: 1 });
  const d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
  return d <= dim ? d : 0;
}
// Which "nth" a date is in its month (1–5), and whether it is the last such weekday.
export const nthOf = (x: D) => ({ n: Math.ceil(x.d / 7), last: x.d + 7 > daysIn(x.y, x.mo) });

// Every time of a series, in order, as (number, moment). The number counts from 0 and is what
// "take out this one" keeps (Session.skip). Stops when f returns false.
// from: times on days well before this moment are only counted, not worked out, which keeps a
// long series quick to show.
export function eachTime(s: Sess, tz: string, f: (i: number, t: number) => boolean | void, from = -Infinity) {
  const r = repeatOf(s);
  if (!r) return void f(0, s.start);
  const w = wallOf(s.start, tz);
  const d0: D = { y: w.y, mo: w.mo, d: w.d };
  const n0 = dayNo(d0);
  const wd0 = weekday(d0);
  const every = Math.max(1, Math.floor(r.every) || 1);
  const limit = r.end === 'count' ? Math.max(1, Math.min(MAX_TIMES, r.count ?? 1)) : MAX_TIMES;
  const until = r.end === 'until' && r.until ? untilKey(r.until) : Infinity;
  let i = 0;
  const early = Math.floor(from / DAY) - 2;
  const emit = (x: D) => {
    if (keyOf(x) > until) return false;
    if (dayNo(x) < early) return ++i < limit;
    const t = i === 0 && dayNo(x) === n0 ? s.start : fromWall({ ...x, h: w.h, mi: w.mi }, tz);
    if (f(i, t) === false) return false;
    return ++i < limit;
  };
  // Safety: never look further than this many steps for the next time.
  const STEPS = MAX_TIMES * 8;
  if (r.freq === 'day') {
    for (let k = 0, n = n0; k < STEPS; k++, n += r.weekdays ? 1 : every) {
      const x = fromNo(n);
      if (r.weekdays && (weekday(x) === 0 || weekday(x) === 6)) continue;
      if (!emit(x)) return;
    }
  } else if (r.freq === 'week') {
    const days = (r.days?.length ? [...new Set(r.days)] : [wd0]).filter((x) => x >= 0 && x <= 6).sort((a, b) => a - b);
    const sunday = n0 - wd0;
    for (let k = 0; k < STEPS; k++)
      for (const wd of days) {
        const n = sunday + k * 7 * every + wd;
        if (n < n0) continue;
        if (!emit(fromNo(n))) return;
      }
  } else {
    const step = r.freq === 'year' ? 12 * every : every;
    const { n: nth } = nthOf(d0);
    for (let k = 0; k < STEPS; k++) {
      const m = d0.mo - 1 + k * step;
      const y = d0.y + Math.floor(m / 12);
      const mo = (m % 12) + 1;
      const d = r.by === 'nth' ? nthDay(y, mo, wd0, nth) : r.by === 'last' ? nthDay(y, mo, wd0, -1) : d0.d <= daysIn(y, mo) ? d0.d : 0;
      if (!d) continue; // this month has no 31st, or no fifth Tuesday
      const x = { y, mo, d };
      if (dayNo(x) < n0) continue;
      if (!emit(x)) return;
    }
  }
}

// The start of time number i, if there is one.
export function timeAt(s: Sess, tz: string, i: number) {
  let out: number | null = null;
  eachTime(s, tz, (k, t) => (k === i ? ((out = t), false) : k < i));
  return out as number | null;
}
// The last start, or null when it repeats for good.
export function lastStart(s: Sess, tz: string) {
  const r = repeatOf(s);
  if (r?.end === 'never') return null;
  let last = s.start;
  eachTime(s, tz, (_i, t) => void (last = t));
  return last;
}
export function timesIn(s: Sess, tz: string) {
  let n = 0;
  eachTime(s, tz, () => void n++);
  return n;
}

// In words, for the card and the form: "Every 2 weeks on Monday and Thursday, 10 times".
export function repeatText(s: Sess, tz: string, withEnd = true) {
  const r = repeatOf(s);
  if (!r) return 'Once';
  const w = wallOf(s.start, tz);
  const d0 = { y: w.y, mo: w.mo, d: w.d };
  const wd0 = weekday(d0);
  const n = Math.max(1, r.every || 1);
  const unit = { day: 'day', week: 'week', month: 'month', year: 'year' }[r.freq];
  const head = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  let what = head;
  if (r.freq === 'day' && r.weekdays) what = 'Every weekday';
  else if (r.freq === 'week') {
    const days = r.days?.length ? [...r.days].sort((a, b) => a - b) : [wd0];
    what = `${head} on ${days.length === 5 && days.join() === '1,2,3,4,5' ? 'weekdays' : and(days.map((x) => NAMES[x]))}`;
  } else if (r.freq === 'month' || r.freq === 'year') {
    const inMonth = r.freq === 'year' ? ` of ${MONTHS[d0.mo - 1]}` : '';
    if (r.by === 'nth') what = `${head} on the ${NTH[nthOf(d0).n - 1]} ${NAMES[wd0]}${inMonth}`;
    else if (r.by === 'last') what = `${head} on the last ${NAMES[wd0]}${inMonth}`;
    else what = r.freq === 'year' ? `${head} on ${d0.d} ${MONTHS[d0.mo - 1]}` : `${head} on day ${d0.d}`;
  }
  if (!withEnd) return what;
  if (r.end === 'count') return `${what}, ${r.count ?? 1} times`;
  if (r.end === 'until' && r.until) {
    const [y, m, d] = r.until.split('-').map(Number);
    return `${what}, until ${d} ${MONTHS[(m || 1) - 1]}${y !== w.y ? ' ' + y : ''}`;
  }
  return what;
}

// The same rule for calendars (RFC 5545), for Google Calendar and email invitations.
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function rrule(s: Sess, tz: string) {
  const r = repeatOf(s);
  if (!r) return '';
  const w = wallOf(s.start, tz);
  const d0 = { y: w.y, mo: w.mo, d: w.d };
  const wd0 = weekday(d0);
  const parts: string[] = [];
  if (r.freq === 'day' && r.weekdays) parts.push('FREQ=WEEKLY', 'BYDAY=MO,TU,WE,TH,FR');
  else {
    parts.push('FREQ=' + { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[r.freq]);
    if ((r.every || 1) > 1) parts.push('INTERVAL=' + r.every);
    if (r.freq === 'week') parts.push('BYDAY=' + (r.days?.length ? [...r.days].sort((a, b) => a - b) : [wd0]).map((x) => BYDAY[x]).join(','), 'WKST=SU');
    if (r.freq === 'month' || r.freq === 'year') {
      if (r.freq === 'year') parts.push('BYMONTH=' + d0.mo);
      if (r.by === 'nth') parts.push(`BYDAY=${nthOf(d0).n}${BYDAY[wd0]}`);
      else if (r.by === 'last') parts.push(`BYDAY=-1${BYDAY[wd0]}`);
      else parts.push('BYMONTHDAY=' + d0.d);
    }
  }
  if (r.end === 'count') parts.push('COUNT=' + Math.max(1, r.count ?? 1));
  else if (r.end === 'until' && r.until) {
    const [y, m, d] = r.until.split('-').map(Number);
    const t = fromWall({ y, mo: m, d, h: 23, mi: 59 }, tz);
    parts.push('UNTIL=' + new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''));
  }
  return 'RRULE:' + parts.join(';');
}
