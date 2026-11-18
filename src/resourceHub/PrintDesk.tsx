import { useEffect, useMemo, useState } from 'react';
import { PdfPreview } from '../components/PdfPreview';
import { Select } from '../components/Select';
import { useAuth } from '../lib/auth';
import { useClassLessons, type ClassLesson } from '../lib/classFiles';
import { useTeacherClasses } from '../lib/coteach';
import { HUB_ACTIVITIES, HUB_COLLECTIONS, type HubActivity, type HubCollection, type HubPage } from './catalog';
import { makeResourcePdf } from './ResourcePrint';
import { makeEditorResourcePdf } from './ResourceRichPdf';
import { defaultTaskIndices, lessonKey, loadDeskLesson, makeDeskLessonPdfs, printableTasks, type DeskLesson } from './printDeskClass';
import { mergePrintPdfs, type PdfSlice } from './printDeskMerge';
import './hub-secondary.css';

const pageKey = (activityId: string, pageId: string) => `${activityId}:${pageId}`;

export function PrintDesk({ basketIds, onBack, onRemove, onDiscover, preferredClassId, activities: catalog = HUB_ACTIVITIES, collections = HUB_COLLECTIONS }: {
  basketIds: string[];
  onBack: () => void;
  onRemove: (id: string) => void;
  onDiscover: () => void;
  preferredClassId?: string;
  activities?: HubActivity[];
  collections?: HubCollection[];
}) {
  const { user } = useAuth();
  const classLessons = useClassLessons(user?.uid);
  const myClasses = useTeacherClasses(user?.uid);
  const activities = useMemo(() => [...new Set(basketIds)].map(id => catalog.find(activity => activity.id === id)).filter((activity): activity is HubActivity => !!activity && activity.status === 'ready' && (activity.pages.length > 0 || !!activity.editorSections?.length)), [basketIds, catalog]);
  const [classId, setClassId] = useState('');
  const [lessonKeys, setLessonKeys] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<Record<string, DeskLesson>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [taskPicks, setTaskPicks] = useState<Record<string, Set<number>>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set(activities.flatMap(activity => [...activity.pages, ...(activity.editorSections ?? [])].filter(part => part.audience === 'learner').map(part => pageKey(activity.id, part.id)))));
  const [includeClassTeacherPages, setIncludeClassTeacherPages] = useState(false);
  const [copies, setCopies] = useState(1);
  const [paper, setPaper] = useState<'a4' | 'letter'>('a4');
  const [colour, setColour] = useState<'colour' | 'mono'>('colour');
  const [twoUp, setTwoUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Uint8Array | null>(null);
  const [lastPageCount, setLastPageCount] = useState<number | null>(null);
  const packSignature = JSON.stringify({ basketIds, selected: [...selected].sort(), lessons: [...lessonKeys].sort(), tasks: Object.entries(taskPicks).map(([key, picks]) => [key, [...picks].sort()]), copies, paper, colour, twoUp, includeClassTeacherPages });
  useEffect(() => setLastPageCount(null), [packSignature]);
  useEffect(() => { setSelected(current => {
    const all = activities.flatMap(activity => [...activity.pages, ...(activity.editorSections ?? [])].map(part => ({ key: pageKey(activity.id, part.id), audience: part.audience, activityId: activity.id })));
    const previous = new Set(current);
    return new Set(all.filter(part => previous.has(part.key) || (part.audience === 'learner' && ![...previous].some(old => old.startsWith(part.activityId + ':')))).map(part => part.key));
  }); }, [activities]);
  const availableLessons = useMemo(() => {
    const unique = new Map<string, ClassLesson>();
    for (const lesson of [...classLessons.list ?? [], ...classLessons.withMe]) if (lesson.type === 'lesson') unique.set(lessonKey(lesson.classId, lesson.itemId), lesson);
    return [...unique.values()].sort((a, b) => a.className.localeCompare(b.className) || a.title.localeCompare(b.title));
  }, [classLessons.list, classLessons.withMe]);
  const classChoices = [...new Map(availableLessons.map(lesson => [lesson.classId, lesson.className])).entries()];
  const preferredAvailable = !!preferredClassId && classChoices.some(([id]) => id === preferredClassId);
  useEffect(() => { if (preferredAvailable) setClassId(current => current || preferredClassId!); }, [preferredAvailable, preferredClassId]);
  const selectedLessons = availableLessons.filter(lesson => lessonKeys.has(lessonKey(lesson.classId, lesson.itemId)));
  const selectedLessonCount = selectedLessons.filter(lesson => (taskPicks[lessonKey(lesson.classId, lesson.itemId)]?.size ?? 0) > 0).length;
  const toggleLesson = async (lesson: ClassLesson) => {
    const key = lessonKey(lesson.classId, lesson.itemId);
    if (lessonKeys.has(key)) { setLessonKeys(current => new Set([...current].filter(item => item !== key))); return; }
    setLessonKeys(current => new Set(current).add(key));
    if (loaded[key]) return;
    setLoading(current => new Set(current).add(key)); setError('');
    try {
      const data = await loadDeskLesson(lesson.classId, lesson.itemId, lesson.className);
      setLoaded(current => ({ ...current, [key]: data }));
      setTaskPicks(current => ({ ...current, [key]: defaultTaskIndices(data.tasks) }));
    } catch (cause) {
      console.error('Print Desk could not read Class lesson', cause);
      setLessonKeys(current => new Set([...current].filter(item => item !== key)));
      setError(`We couldn’t load “${lesson.title}”. Check your Class access and try again.`);
    } finally { setLoading(current => { const next = new Set(current); next.delete(key); return next; }); }
  };
  const toggleTask = (key: string, index: number) => setTaskPicks(current => {
    const next = new Set(current[key] ?? []); next.has(index) ? next.delete(index) : next.add(index);
    return { ...current, [key]: next };
  });
  // A copied Hub activity is independent in Classes. Detect its distinctive task title so it is printed once.
  const duplicateIds = new Set(activities.filter(activity => selectedLessons.some(lesson => {
    const key = lessonKey(lesson.classId, lesson.itemId), data = loaded[key], picks = taskPicks[key];
    const kitTitles = ['Lead-in · Have you ever…?', 'Practice A · Past participles', 'Practice B · Follow-up questions', 'Find someone who… · Mingle and report'];
    return !!data && activity.id === 'otp-002' && kitTitles.every(title => data.tasks.some((task, index) => picks?.has(index) && task.title === title));
  })).map(activity => activity.id));
  const chosen = activities.filter(activity => !duplicateIds.has(activity.id)).flatMap(activity => activity.pages.filter(page => selected.has(pageKey(activity.id, page.id))));
  const richChosen = activities.filter(activity => !duplicateIds.has(activity.id)).flatMap(activity => (activity.editorSections ?? []).filter(section => selected.has(pageKey(activity.id, section.id))));
  const learnerPages: HubPage[] = chosen.filter(page => page.audience === 'learner');
  const teacherPages: HubPage[] = chosen.filter(page => page.audience === 'teacher');
  const learnerSheets = (twoUp ? Math.ceil(learnerPages.length / 2) : learnerPages.length) * copies;
  const totalSheets = learnerSheets + teacherPages.length;
  const hasSelection = chosen.length > 0 || richChosen.length > 0 || selectedLessonCount > 0;
  const togglePage = (key: string) => setSelected(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const toggleActivity = (activity: HubActivity) => setSelected(current => {
    const next = new Set(current), keys = [...activity.pages, ...(activity.editorSections ?? [])].filter(part => part.audience === 'learner').map(part => pageKey(activity.id, part.id));
    const allSelected = keys.every(key => next.has(key));
    keys.forEach(key => allSelected ? next.delete(key) : next.add(key));
    return next;
  });
  const generate = async () => {
    if (!hasSelection || busy || loading.size) return;
    setBusy(true); setError(''); setLastPageCount(null);
    try {
      const learner: PdfSlice[] = [], teacher: PdfSlice[] = [];
      if (learnerPages.length) learner.push({ bytes: await makeResourcePdf({ learnerPages, teacherPages: [], copies: 1, paper, colour, twoUp }), repeat: copies });
      if (teacherPages.length) teacher.push({ bytes: await makeResourcePdf({ learnerPages: [], teacherPages, copies: 1, paper, colour, twoUp: false }) });
      for (const activity of activities.filter(item => !duplicateIds.has(item.id) && item.editorSections?.length)) {
        const learnerIds = activity.editorSections!.filter(section => section.audience === 'learner' && selected.has(pageKey(activity.id, section.id))).map(section => section.id);
        const teacherIds = activity.editorSections!.filter(section => section.audience === 'teacher' && selected.has(pageKey(activity.id, section.id))).map(section => section.id);
        const collection = collections.find(item => item.id === activity.collectionId);
        if (learnerIds.length) learner.push({ bytes: await makeEditorResourcePdf({ activity, collection, learnerIds, teacherIds: [], copies: 1, paper, colour }), repeat: copies });
        if (teacherIds.length) teacher.push({ bytes: await makeEditorResourcePdf({ activity, collection, learnerIds: [], teacherIds, copies: 1, paper, colour }) });
      }
      for (const lesson of selectedLessons) {
        const key = lessonKey(lesson.classId, lesson.itemId), data = loaded[key], picked = taskPicks[key];
        if (!data || !picked?.size) continue;
        const cls = myClasses.classes?.find(item => item.id === lesson.classId);
        const pdfs = await makeDeskLessonPdfs(data, cls, picked, paper);
        learner.push({ bytes: pdfs.learner, repeat: copies });
        if (includeClassTeacherPages && pdfs.teacher) teacher.push({ bytes: pdfs.teacher });
      }
      const pack = await mergePrintPdfs([...learner, ...teacher], paper, colour === 'mono');
      setLastPageCount(pack.pages); setPreview(pack.bytes);
    } catch (cause) { console.error('Resource Hub Print Desk failed', cause); setError(`We couldn’t build the PDF. ${cause instanceof Error ? cause.message : 'Please try again.'}`); }
    finally { setBusy(false); }
  };
  return <section className="rh-secondary-page rh-desk" aria-labelledby="rh-desk-title"><header className="rh-secondary-header"><div><button type="button" className="rh-back" onClick={onBack}>← Back to basket</button><span className="rh-kicker">PRINT DESK</span><h1 id="rh-desk-title">Make your classroom pack</h1><p>Add whole Class lessons and Resource Hub pages. Every printable task is included at first; you can leave out individual tasks. Learner copies come first and teacher pages go at the end.</p></div></header>
    <div className="rh-desk-layout"><div className="rh-desk-main">
      <div className="rh-desk-card"><div className="rh-desk-card-heading"><h2>From your Classes</h2><span>{selectedLessons.length} selected</span></div><p className="rh-desk-help">Choose a class, then select one or more whole lessons.</p><div className="rh-desk-class-choice"><span>Class</span><Select value={classId} options={[{ v: '', label: 'Choose a class' }, ...classChoices.map(([id, name]) => ({ v: id, label: name }))]} onChange={setClassId} label="Class" /></div>
        {classId && (availableLessons.some(lesson => lesson.classId === classId) ? <div className="rh-desk-lesson-list">{availableLessons.filter(lesson => lesson.classId === classId).map(lesson => { const key = lessonKey(lesson.classId, lesson.itemId), data = loaded[key], picked = taskPicks[key], checked = lessonKeys.has(key); return <div className="rh-desk-lesson" key={key}><label className="rh-desk-lesson-head"><input type="checkbox" checked={checked} onChange={() => void toggleLesson(lesson)} /><span><strong>{lesson.title}</strong><small>{lesson.className}{loading.has(key) ? ' · Loading tasks…' : data ? ` · ${printableTasks(data.tasks).length} printable tasks` : ''}</small></span></label>{checked && data && <div className="rh-desk-task-list">{printableTasks(data.tasks).length ? printableTasks(data.tasks).map(({ task, index }) => <label key={task.id}><input type="checkbox" checked={picked?.has(index) ?? false} onChange={() => toggleTask(key, index)} /><span>{task.title}{task.variant ? ` · ${task.variant}` : ''}</span></label>) : <p>This lesson has no printable tasks. Hidden and screen only tasks stay out of the pack.</p>}</div>}</div>; })}</div> : <p className="rh-desk-help">This class has no lessons available to print.</p>)}
        {!classId && classChoices.length === 0 && <p className="rh-desk-help">{!user ? 'Sign in to add Class lessons.' : classLessons.list === null ? 'Loading your Classes…' : 'No Class lessons are available yet. You can still print a Resource Hub activity.'}</p>}
      </div>
      <div className="rh-desk-card"><div className="rh-desk-card-heading"><h2>From your basket</h2><span>{activities.length} {activities.length === 1 ? 'activity' : 'activities'}</span></div>
      {activities.length ? activities.map(activity => { const keys = [...activity.pages, ...(activity.editorSections ?? [])].filter(part => part.audience === 'learner').map(part => pageKey(activity.id, part.id)); const all = keys.every(key => selected.has(key)); const some = keys.some(key => selected.has(key)); const duplicate = duplicateIds.has(activity.id); return <div className="rh-desk-activity" key={activity.id}><div className="rh-desk-activity-heading"><label><input type="checkbox" checked={all && !duplicate} disabled={duplicate} ref={input => { if (input) input.indeterminate = some && !all && !duplicate; }} onChange={() => toggleActivity(activity)} /><span><strong>{activity.title}</strong><small>Off the Page · {activity.number} · {activity.pages.length ? `${activity.pages.length} actual pages` : `${activity.editorSections?.length ?? 0} editable sections`}{duplicate ? ' · Included in your selected Class lesson, so it is left out here' : ''}</small></span></label><button type="button" onClick={() => onRemove(activity.id)} aria-label={`Remove ${activity.title} from basket`}>Remove</button></div>{!duplicate && <div className="rh-desk-page-list">{[...activity.pages, ...(activity.editorSections ?? [])].map(page => <label key={page.id} className="rh-desk-page"><input type="checkbox" checked={selected.has(pageKey(activity.id, page.id))} onChange={() => togglePage(pageKey(activity.id, page.id))} />{'image' in page ? page.audience === 'teacher' ? <span className="rh-desk-section-icon rh-desk-private-icon" aria-hidden="true">◆</span> : <img src={page.image} alt="" /> : <span className="rh-desk-section-icon" aria-hidden="true">▤</span>}<span><strong>{page.title}</strong><small>{page.audience === 'learner' ? 'Learner sheet · repeated per copy' : 'Teacher only · printed once at the end'}</small></span><span className={page.audience === 'learner' ? 'rh-desk-learner' : 'rh-desk-private'}>{page.audience === 'learner' ? 'Learner' : 'Teacher'}</span></label>)}</div>}</div>; }) : <div className="rh-shelf-empty"><p>Your basket has no printable activities yet. The complete four-page “Have You Ever…?” activity is available now.</p><button type="button" onClick={onDiscover}>Browse activities →</button></div>}
    </div><div className="rh-desk-card"><h2>Print settings</h2><div className="rh-desk-settings"><label className="rh-field">Learner copies<input type="number" min={1} max={30} step={1} value={copies} onChange={event => setCopies(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label><div className="rh-field"><span>Paper size</span><Select value={paper} options={[{ v: 'a4', label: 'A4' }, { v: 'letter', label: 'US Letter' }]} onChange={setPaper} label="Paper size" /></div><div className="rh-field"><span>Colour</span><Select value={colour} options={[{ v: 'colour', label: 'Colour' }, { v: 'mono', label: 'Black and white' }]} onChange={setColour} label="Colour" /></div></div><label className="rh-desk-toggle"><input type="checkbox" checked={twoUp} onChange={event => setTwoUp(event.target.checked)} /><span><strong>Two scanned learner pages per sheet</strong><small>Applies to Resource Hub pages. Class worksheets keep their readable layout.</small></span></label><label className="rh-desk-toggle"><input type="checkbox" checked={includeClassTeacherPages} onChange={event => setIncludeClassTeacherPages(event.target.checked)} /><span><strong>Include Class teacher notes and keys</strong><small>Private pages print once at the end. Leave this off for a learner-only pack.</small></span></label></div></div>
    <aside className="rh-desk-summary"><span className="rh-kicker">YOUR PACK</span><h2>{lastPageCount !== null ? `${lastPageCount} ${lastPageCount === 1 ? 'sheet' : 'sheets'}` : selectedLessonCount || richChosen.length ? 'Ready to assemble' : `${totalSheets} ${totalSheets === 1 ? 'sheet' : 'sheets'}`}</h2><dl><div><dt>Class lessons</dt><dd>{selectedLessonCount}</dd></div><div><dt>Resource Hub activities</dt><dd>{activities.filter(activity => !duplicateIds.has(activity.id) && [...activity.pages, ...(activity.editorSections ?? [])].some(part => selected.has(pageKey(activity.id, part.id)))).length}</dd></div><div><dt>Learner copies</dt><dd>{copies}</dd></div><div><dt>Teacher pages</dt><dd>{teacherPages.length + richChosen.filter(section => section.audience === 'teacher').length}{selectedLessonCount && includeClassTeacherPages ? ' + Class keys' : ''}</dd></div></dl><div className="rh-desk-sequence"><span>1</span><p>Learner sheets<br /><small>Repeated for each copy</small></p><span>2</span><p>Teacher section<br /><small>Notes and keys once, at the end</small></p></div><button type="button" className="rh-primary" disabled={busy || !hasSelection || loading.size > 0} onClick={() => void generate()}>{busy ? 'Preparing PDF…' : 'Preview and print PDF →'}</button>{!hasSelection && <p className="rh-desk-error" role="status">Choose a lesson or at least one Resource Hub page to make a pack.</p>}{loading.size > 0 && <p className="rh-desk-fineprint">Loading selected lesson tasks…</p>}{error && <p className="rh-desk-error" role="alert">{error}</p>}<p className="rh-desk-fineprint">The exact sheet count appears after the PDF is prepared. Class worksheets use the same layout as Print in Classes.</p></aside></div>
    {preview && <PdfPreview bytes={preview} name="Resource Hub classroom pack" onClose={() => setPreview(null)} />}
  </section>;
}
