import { useEffect, useMemo, useState } from 'react';
import { addSession, saveSession, useZones, zoneOf, type Session } from '../../lib/sessions';
import { allZones, cityOf, clockIn, fromFields, localZone, sameClock, toFields, zoneLabel } from '../../lib/tz';
import { Select, MultiSelect } from '../../components/Select';
import { useDirectory } from '../../lib/directory';
import { tell } from '../../lib/ask';
import type { ClassDoc } from '../../lib/classes';
import { clock, lengthText, niceStart, shortDay } from './dates';
import { cleanUrl, defaultVideo, looksZoom, makeTeamsMeeting, prepareMicrosoft, saveVideoPrefs, useVideoPrefs, VIDEO_KINDS, warmTeams, type VideoKind } from '../../lib/meetings';
import { useGcalSetting } from '../../lib/gcal';

// The full form, for everything: a class or a meeting, the lesson, when and in which time zone,
// how often, where. The day and time are on the session's own clock.

const wallText = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return new Date(Date.UTC(2020, 0, 1, h || 0, m || 0)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
};
const MINS = [15, 30, 45, 60, 75, 90, 120, 150, 180];

export function SessionDialog({ init, classes, items, me, onClose, onSaved }: { init: Partial<Session>; classes: ClassDoc[]; items: Record<string, { id: string; title: string; type: string }[]>; me: { uid: string; name: string }; onClose: () => void; onSaved?: (title: string, start: number) => void }) {
  const dir = useDirectory();
  const colleagues = dir?.groups.find((g) => g.id === 'colleagues')?.people ?? [];
  const first = init.start ?? niceStart(Date.now());
  const [s, setS] = useState<Partial<Session>>({ kind: 'class', mins: 60, weeks: 1, online: true, ...init });
  const [tz, setTz] = useState(init.tz ? zoneOf(init) : localZone());
  const [date, setDate] = useState(toFields(first, tz).date);
  const [time, setTime] = useState(toFields(first, tz).time);
  const zones = useMemo(() => allZones().map((z) => ({ v: z, label: zoneLabel(z, first) })), [first]);
  const others = useZones(s.kind === 'meeting' ? s.attendees ?? [] : []);
  const [repeat, setRepeat] = useState((init.weeks ?? 1) > 1);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Session>) => setS((x) => ({ ...x, ...p }));
  // The video: ELT Suite's own room, or Meet, Teams, Zoom or another link.
  const prefs = useVideoPrefs(me.uid);
  const google = useGcalSetting(me.uid);
  const [vk, setVk] = useState<VideoKind>(init.video?.kind ?? 'eltsuite');
  const [vurl, setVurl] = useState(init.video?.url ?? '');
  const [picked, setPicked] = useState(!!init.id || !!init.video);
  useEffect(() => {
    if (picked || !prefs.kind) return;
    const d = defaultVideo(prefs, me.uid);
    setVk(prefs.kind);
    setVurl(d?.url ?? (prefs.kind === 'zoom' ? prefs.zoom ?? '' : prefs.kind === 'link' ? prefs.link ?? '' : ''));
  }, [prefs, picked, me.uid]);
  useEffect(() => void (vk === 'teams' && prepareMicrosoft()), [vk]);
  const pickVideo = (k: VideoKind) => {
    setPicked(true);
    setVk(k);
    setVurl(k === init.video?.kind ? init.video?.url ?? '' : k === 'zoom' ? prefs.zoom ?? '' : k === 'link' ? prefs.link ?? '' : '');
  };
  const needsUrl = s.online && (vk === 'zoom' || vk === 'link');
  const goodUrl = !needsUrl || !!cleanUrl(vurl);
  const c = classes.find((x) => x.id === s.classId);
  const lessons = (items[s.classId ?? ''] ?? []).filter((i) => i.type === 'lesson');
  const title = s.title?.trim() || (s.kind === 'class' ? lessons.find((l) => l.id === s.itemId)?.title || c?.name || '' : '');
  const ok = !!title && !!date && !!time && (s.kind === 'meeting' || !!c) && goodUrl;
  const mins = s.mins ?? 60;
  const lengths = [...new Set([...MINS, mins])].sort((a, b) => a - b);
  const at = date && time ? fromFields(date, time, tz) : NaN;
  const here = localZone();
  const away = !sameClock(tz, here, at || Date.now());
  const theirs = Number.isFinite(at)
    ? (s.attendees ?? [])
        .filter((a) => others[a] && !sameClock(others[a], here, at))
        .map((a) => `${clockIn(at, others[a])} for ${colleagues.find((p) => p.key === a)?.name ?? s.names?.[a] ?? 'a colleague'}, ${cityOf(others[a])}`)
    : [];
  const save = async () => {
    // A new Teams meeting: Microsoft's window opens from this click, if it is needed.
    const teams = s.online && vk === 'teams' && !(init.video?.kind === 'teams' && init.video.url) ? warmTeams() : null;
    setBusy(true);
    const start = fromFields(date, time, tz);
    let video: Session['video'] = null;
    if (s.online && vk !== 'eltsuite') {
      if (vk === 'zoom' || vk === 'link') video = { kind: vk, url: cleanUrl(vurl), by: me.uid };
      else if (vk === init.video?.kind && init.video?.url) video = init.video;
      else video = { kind: vk, by: me.uid };
    }
    if (teams && video) {
      try {
        await teams;
        video = { kind: 'teams', url: await makeTeamsMeeting({ title, start, mins: s.mins ?? 60, weeks: repeat ? Math.max(2, s.weeks ?? 2) : 1 }), by: me.uid };
      } catch (e) {
        setBusy(false);
        return void tell(e instanceof Error ? e.message : 'The Teams meeting could not be made.');
      }
    }
    const base = { ...s, video, tz, title, start, weeks: repeat ? Math.max(2, s.weeks ?? 2) : 1, classId: s.kind === 'class' ? s.classId : null, itemId: s.kind === 'class' ? s.itemId ?? null : null, attendees: s.kind === 'meeting' ? s.attendees ?? [] : [], names: Object.fromEntries(colleagues.filter((p) => (s.attendees ?? []).includes(p.key)).map((p) => [p.key, p.name])) };
    try {
      if (s.id) await saveSession(base as Session);
      else await addSession({ ...base, owner: me.uid, ownerName: me.name, live: null } as Omit<Session, 'id'>);
      onSaved?.(title, start);
      onClose();
    } catch (e) {
      console.error(e);
      void tell('It could not be saved. Please try again.');
      setBusy(false);
    }
  };
  return (
    <div className="scrim ttb-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog ttb-dialog" role="dialog" aria-label={s.id ? 'Change the session' : 'A new session'} onSubmit={(e) => (e.preventDefault(), ok && void save())} onKeyDown={(e) => e.key === 'Escape' && !busy && !e.defaultPrevented && (e.preventDefault(), onClose())}>
        <h2>{s.id ? 'Change the session' : 'Add to the timetable'}</h2>
        <span className="seg" role="radiogroup" aria-label="What">
          {(
            [
              ['class', 'A class'],
              ['meeting', 'A meeting'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={s.kind === k} className={s.kind === k ? 'on' : ''} onClick={() => set({ kind: k, online: k === 'meeting' ? true : s.online })}>
              {l}
            </button>
          ))}
        </span>
        {s.kind === 'class' ? (
          <div className="ttb-two">
            <div className="field">
              <span>Class</span>
              <Select label="Class" value={s.classId ?? ''} options={classes.map((x) => ({ v: x.id, label: x.name }))} onChange={(v) => set({ classId: v, itemId: null })} placeholder="Choose a class" />
            </div>
            <div className="field">
              <span>Lesson to teach</span>
              <Select label="Lesson" value={s.itemId ?? ''} options={[{ v: '', label: 'Choose later' }, ...lessons.map((l) => ({ v: l.id, label: l.title }))]} onChange={(v) => set({ itemId: v || null })} />
            </div>
            <span className="hint ttb-span">With a lesson, Start teaching opens it live, and learners see its time.</span>
          </div>
        ) : (
          <div className="field">
            <span>Who</span>
            <MultiSelect label="Colleagues" value={s.attendees ?? []} options={colleagues.map((p) => ({ v: p.key, label: p.name }))} onChange={(v) => set({ attendees: v })} none="Nobody yet" foot="" />
            <span className="hint">They see it in their timetable, and are called when it starts.</span>
          </div>
        )}
        <label className="field">
          <span>Title{s.kind === 'class' ? ' (optional)' : ''}</span>
          <input value={s.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={s.kind === 'class' ? title || 'The lesson or class name' : 'For example: Team planning'} maxLength={90} autoFocus />
        </label>
        <div className="ttb-when">
          <label className="field">
            <span>Day</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Starts</span>
            <input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <div className="field">
            <span>How long</span>
            <Select label="How long" value={String(mins)} options={lengths.map((m) => ({ v: String(m), label: lengthText(m) }))} onChange={(v) => set({ mins: Number(v) })} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Every week, at this time
          {repeat && (
            <span className="ttb-weeks">
              for <input type="number" min={2} max={52} value={s.weeks && s.weeks > 1 ? s.weeks : 10} onChange={(e) => set({ weeks: Math.max(2, Math.min(52, Number(e.target.value) || 2)) })} aria-label="How many weeks" /> weeks
            </span>
          )}
        </label>
        <div className="field ttb-tzf">
          <span>Time zone</span>
          <Select label="Time zone" value={tz} options={zones} onChange={setTz} search />
          {Number.isFinite(at) && (away || theirs.length > 0) && (
            <span className="hint ttb-yours">
              {[away ? `${shortDay(at)}, ${clock(at)} your time` : '', ...theirs].filter(Boolean).join(' · ')}
            </span>
          )}
          {repeat && <span className="hint">Every week it stays at {wallText(time)} on this clock, also when the clocks change.</span>}
        </div>
        <div className="field">
          <span>Where</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Where">
            <button type="button" role="radio" aria-checked={!!s.online} className={s.online ? 'on' : ''} onClick={() => set({ online: true })}>
              Online
            </button>
            <button type="button" role="radio" aria-checked={!s.online} className={!s.online ? 'on' : ''} onClick={() => set({ online: false })}>
              In person
            </button>
          </span>
          {s.online ? (
            <div className="ttb-video">
              <Select label="Video" value={vk} options={VIDEO_KINDS.map((v) => ({ v: v.k, label: v.label }))} onChange={pickVideo} />
              {vk === 'eltsuite' && <span className="hint">{s.kind === 'class' ? (c?.video?.url ? 'In the class video room. Learners join from their home page; no link to send.' : 'In the class video room, which is made within a few minutes of the class.') : 'A video room opens when it starts. No link to send.'}</span>}
              {vk === 'meet' && <span className="hint">{init.video?.kind === 'meet' && init.video.url ? `Google Meet: ${init.video.url.replace('https://', '')}` : google?.on ? 'A Google Meet link is made in your Google Calendar when you save, and learners see it on their home page.' : 'Google Meet links are made with your Google Calendar: turn on Add my timetable to Google Calendar in Settings.'}</span>}
              {vk === 'teams' && <span className="hint">{init.video?.kind === 'teams' && init.video.url ? 'The Teams meeting is ready. Learners see its link on their home page.' : 'A Teams meeting is made when you save. It needs a work or school Microsoft account.'}</span>}
              {(vk === 'zoom' || vk === 'link') && (
                <>
                  <input value={vurl} onChange={(e) => setVurl(e.target.value)} placeholder={vk === 'zoom' ? 'Your Zoom link, for example https://zoom.us/j/1234567890' : 'https://'} aria-label={vk === 'zoom' ? 'Zoom link' : 'Link'} inputMode="url" spellCheck={false} />
                  {vk === 'zoom' && vurl && cleanUrl(vurl) && !looksZoom(cleanUrl(vurl)) && <span className="hint">That does not look like a Zoom link, but it will work if it opens your meeting.</span>}
                  {cleanUrl(vurl) && cleanUrl(vurl) !== (vk === 'zoom' ? prefs.zoom : prefs.link) && (
                    <button type="button" className="btn link small ttb-keep" onClick={() => void saveVideoPrefs(me.uid, { ...prefs, kind: vk, [vk]: cleanUrl(vurl) })}>
                      Use this for my new sessions
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <input value={s.place ?? ''} onChange={(e) => set({ place: e.target.value })} placeholder="Room 4, or the address" aria-label="Where" />
          )}
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea rows={2} value={s.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!ok || busy}>
            {busy ? 'Saving…' : s.id ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
