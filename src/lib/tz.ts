// Time zones, with nothing but the browser's own Intl. A weekly class keeps its wall-clock time
// in its own time zone, so when the clocks change it stays at 7 there, wherever you are.

export const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
export const validZone = (tz?: string | null) => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

type Wall = { y: number; mo: number; d: number; h: number; mi: number };
const fmts = new Map<string, Intl.DateTimeFormat>();
const fmt = (tz: string) => {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    fmts.set(tz, f);
  }
  return f;
};
// The date and time on the clocks of a time zone at a moment.
export function wallOf(t: number, tz: string): Wall {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute };
}
const offsetAt = (t: number, tz: string) => {
  const w = wallOf(t, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(t / 60000) * 60000;
};
// The moment a wall-clock time happens in a time zone. A time the clocks skip (02:30 on the
// night they go forward) becomes the time just after the change.
export function fromWall(w: Wall, tz: string) {
  const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
  const o1 = offsetAt(guess - offsetAt(guess, tz), tz);
  const t = guess - o1;
  const o2 = offsetAt(t, tz);
  return o2 === o1 ? t : guess - Math.min(o1, o2);
}
// The same wall-clock time, n days later, in a time zone.
export function addDaysInZone(t: number, n: number, tz: string) {
  const w = wallOf(t, tz);
  const d = new Date(Date.UTC(w.y, w.mo - 1, w.d + n));
  return fromWall({ y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: w.h, mi: w.mi }, tz);
}
// Moving one time of a weekly session from a to b moves the whole series the same way on its
// own clock: the same number of days, the same change of time of day.
export function shiftInZone(base: number, a: number, b: number, tz: string) {
  const wa = wallOf(a, tz);
  const wb = wallOf(b, tz);
  const days = Math.round((Date.UTC(wb.y, wb.mo - 1, wb.d) - Date.UTC(wa.y, wa.mo - 1, wa.d)) / 864e5);
  const mins = wb.h * 60 + wb.mi - (wa.h * 60 + wa.mi);
  const w = wallOf(base, tz);
  const d = new Date(Date.UTC(w.y, w.mo - 1, w.d + days, w.h, w.mi + mins));
  return fromWall({ y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }, tz);
}

const pad = (n: number) => String(n).padStart(2, '0');
// For a date field and a time field, in a time zone.
export function toFields(t: number, tz: string) {
  const w = wallOf(t, tz);
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.mi)}` };
}
export function fromFields(date: string, time: string, tz: string) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return fromWall({ y, mo, d, h, mi }, tz);
}

// "London", "New York", "Hong Kong".
export const cityOf = (tz: string) => (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
// "GMT+8", "GMT-4:30", "GMT".
export function offsetText(tz: string, at = Date.now()) {
  const m = Math.round(offsetAt(at, tz) / 60000);
  if (!m) return 'GMT';
  const a = Math.abs(m);
  return `GMT${m < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
}
export const zoneLabel = (tz: string, at = Date.now()) => `${cityOf(tz)} (${offsetText(tz, at)})`;
export const sameClock = (a: string, b: string, at = Date.now()) => a === b || offsetAt(at, a) === offsetAt(at, b);
// A time on another zone's clock: "12:00 PM", with the day when it is not the same as here.
export function clockIn(t: number, tz: string) {
  const time = new Date(t).toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const there = new Date(t).toLocaleDateString('en-CA', { timeZone: tz });
  const here = new Date(t).toLocaleDateString('en-CA');
  if (there === here) return time;
  return `${new Date(t).toLocaleDateString(undefined, { timeZone: tz, weekday: 'short' })} ${time}`;
}

// Every time zone, by offset, for a drop-down.
let zones: string[] | null = null;
export function allZones() {
  if (!zones) {
    let list: string[] = [];
    try {
      list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      list = [];
    }
    if (!list.length) list = ['UTC', 'Europe/London', 'Europe/Istanbul', 'Asia/Hong_Kong', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
    const now = Date.now();
    zones = [...new Set([...list, localZone()])].filter(validZone).sort((a, b) => offsetAt(now, a) - offsetAt(now, b) || cityOf(a).localeCompare(cityOf(b)));
  }
  return zones;
}
