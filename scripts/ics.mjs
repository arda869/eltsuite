// Calendar invitations (RFC 5545), for guests from outside: an email with this attached goes
// straight into their calendar (Outlook, Gmail, Apple Calendar), and later ones change or cancel
// it. Times are on the meeting's own clock, with its time zone written out in full, so the
// calendar shows them right wherever the guest is.

const pad = (n, w = 2) => String(n).padStart(w, '0');
const fmts = new Map();
const fmt = (tz) => {
  if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  return fmts.get(tz);
};
function wall(t, tz) {
  const p = {};
  for (const x of fmt(tz).formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}
const offsetMin = (t, tz) => {
  const w = wall(t, tz);
  return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000) / 60000);
};
const localStamp = (t, tz) => {
  const w = wall(t, tz);
  return `${w.y}${pad(w.mo)}${pad(w.d)}T${pad(w.h)}${pad(w.mi)}00`;
};
const utcStamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const offText = (m) => `${m < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(m) / 60))}${pad(Math.abs(m) % 60)}`;

// The clock changes of a time zone between two years, found by looking day by day, then minute by
// minute.
function changes(tz, y1, y2) {
  const out = [];
  let t = Date.UTC(y1, 0, 1);
  const end = Date.UTC(y2 + 1, 0, 1);
  let o = offsetMin(t, tz);
  for (; t < end; t += 864e5) {
    const o2 = offsetMin(t + 864e5, tz);
    if (o2 === o) continue;
    let lo = t;
    let hi = t + 864e5;
    while (hi - lo > 60000) {
      const mid = lo + Math.floor((hi - lo) / 120000) * 60000;
      if (offsetMin(mid, tz) === o) lo = mid;
      else hi = mid;
    }
    out.push({ at: hi, from: o, to: o2 });
    o = o2;
  }
  return out;
}
function vtimezone(tz, from, to) {
  const y1 = new Date(from).getUTCFullYear();
  const y2 = Math.min(new Date(to).getUTCFullYear(), y1 + 4);
  const list = changes(tz, y1, y2);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tz}`];
  if (!list.length) {
    const o = offText(offsetMin(from, tz));
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${o}`, `TZOFFSETTO:${o}`, 'END:STANDARD');
  } else {
    const low = Math.min(...list.map((c) => Math.min(c.from, c.to)));
    for (const c of list) {
      const k = c.to > low ? 'DAYLIGHT' : 'STANDARD';
      // The moment of the change, on the clock as it was just before.
      const w = new Date(c.at + c.from * 60000);
      const st = `${w.getUTCFullYear()}${pad(w.getUTCMonth() + 1)}${pad(w.getUTCDate())}T${pad(w.getUTCHours())}${pad(w.getUTCMinutes())}00`;
      lines.push(`BEGIN:${k}`, `DTSTART:${st}`, `TZOFFSETFROM:${offText(c.from)}`, `TZOFFSETTO:${offText(c.to)}`, `END:${k}`);
    }
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

const text = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
// Lines longer than 75 octets are folded.
function fold(line) {
  const b = Buffer.from(line, 'utf8');
  if (b.length <= 75) return line;
  const parts = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

// ev: { uid, seq, method: 'REQUEST' | 'CANCEL', title, description, location, url, start, mins, tz,
//       rrule, exdates: [ms], last (ms, for the time zone's years), organizer: { name, email },
//       attendee: { email, name } }
export function ics(ev) {
  const end = ev.start + ev.mins * 60000;
  const cancel = ev.method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//ELT Suite//Timetable//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${ev.method}`,
    ...vtimezone(ev.tz, ev.start, ev.last ?? end),
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `SEQUENCE:${ev.seq}`,
    `DTSTAMP:${utcStamp(Date.now())}`,
    `DTSTART;TZID=${ev.tz}:${localStamp(ev.start, ev.tz)}`,
    `DTEND;TZID=${ev.tz}:${localStamp(end, ev.tz)}`,
    ...(ev.rrule ? [ev.rrule] : []),
    ...(ev.rrule && ev.exdates?.length ? [`EXDATE;TZID=${ev.tz}:${ev.exdates.map((t) => localStamp(t, ev.tz)).join(',')}`] : []),
    `SUMMARY:${text(ev.title)}`,
    ...(ev.description ? [`DESCRIPTION:${text(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${text(ev.location)}`] : []),
    ...(ev.url ? [`URL:${ev.url}`] : []),
    `ORGANIZER;CN=${text(ev.organizer.name)}:mailto:${ev.organizer.email}`,
    `ATTENDEE;CN=${text(ev.attendee.name || ev.attendee.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${ev.attendee.email}`,
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    ...(cancel ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(ev.title)}`, 'TRIGGER:-PT15M', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
