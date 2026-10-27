import { NSelect } from './Select';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importLesson, type ImportResult } from '../lib/textformat';
import { createLessonFromImport } from '../lib/transfer';
import { importGift, looksLikeGift } from '../lib/gift';
import { importBundle, parseBundle, type ClassBundle, type LessonBundle } from '../lib/fullcopy';
import type { Topic } from '../lib/classes';

type Source = { kind: 'text'; result: ImportResult } | { kind: 'gift'; result: ImportResult & { count: number } } | { kind: 'bundle'; bundle: LessonBundle | ClassBundle } | { kind: 'bad'; message: string };

function detect(text: string, format: 'auto' | 'text' | 'gift'): Source | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      return { kind: 'bundle', bundle: parseBundle(t) };
    } catch (e) {
      return { kind: 'bad', message: (e as Error).message };
    }
  }
  if (format === 'gift' || (format === 'auto' && looksLikeGift(t) && !/^#\s/.test(t))) return { kind: 'gift', result: importGift(t) };
  return { kind: 'text', result: importLesson(t) };
}

// Paste or upload a lesson: the text convention, a Moodle GIFT file, or a full copy (.lessonlit.json).
export function ImportDialog({ classId, topics, onClose }: { classId: string; topics: Topic[]; onClose: () => void }) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<'auto' | 'text' | 'gift'>('auto');
  const [topicId, setTopicId] = useState<string>(topics[0]?.id ?? '');
  const [busy, setBusy] = useState('');
  const navigate = useNavigate();
  const src = useMemo(() => detect(text, format), [text, format]);
  const result = src && (src.kind === 'text' || src.kind === 'gift') ? src.result : null;
  const errLines = new Set(result?.errors.map((e) => e.line));
  const lines = text.split('\n');
  const qCount = (c: unknown) => (JSON.stringify(c).match(/"id":"/g) ?? []).length;
  const ready = src && (src.kind === 'bundle' || (result && !result.errors.length && result.tasks.length > 0));

  async function create() {
    if (!src || !ready) return;
    setBusy('Importing…');
    try {
      if (src.kind === 'bundle') {
        if (src.bundle.format === 'lessonlit-class') {
          let n = 0;
          for (const l of src.bundle.lessons) {
            setBusy(`Importing lesson ${++n} of ${src.bundle.lessons.length}…`);
            await importBundle(classId, l, { topicId: topicId || null });
          }
          onClose();
          navigate(`/class/${classId}`);
        } else {
          const id = await importBundle(classId, src.bundle, { topicId: topicId || null });
          onClose();
          navigate(`/class/${classId}/lesson/${id}`);
        }
      } else if (result) {
        const id = await createLessonFromImport(classId, topicId || null, result.title, result.tasks);
        onClose();
        navigate(`/class/${classId}/lesson/${id}`);
      }
    } catch (e) {
      setBusy('Import failed: ' + (e as Error).message);
      return;
    }
    setBusy('');
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog import-dialog" role="dialog" aria-label="Import a lesson" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Import a lesson</h2>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <NSelect value={format} onChange={(e) => setFormat(e.target.value as typeof format)} aria-label="File format">
              <option value="auto">Work out the format</option>
              <option value="text">Lesson text (.md)</option>
              <option value="gift">Moodle GIFT</option>
            </NSelect>
            <label className="btn small-btn">
              Upload a file
              <input type="file" accept=".md,.txt,.gift,.json,text/plain,text/markdown,application/json" hidden onChange={(e) => e.target.files?.[0]?.text().then(setText)} />
            </label>
          </span>
        </div>
        <div className="import-grid">
          <div className="import-src">
            <textarea value={text} spellCheck={false} placeholder={'# Lesson title\n\n## Task 1: Warm-up\nI {{have been|\'ve been}} to Tokyo.\nShe {{?go|*goes|going}} to work.\n\nYou can also paste a Moodle GIFT file, or upload a full copy (.lessonlit.json) made with Export → Full copy.'} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="import-preview">
            {!src ? (
              <p className="hint">Paste the lesson text on the left, or upload a file. You will see the tasks and any problems here before anything is created.</p>
            ) : src.kind === 'bad' ? (
              <div className="import-errors" role="alert">
                <strong>{src.message}</strong>
              </div>
            ) : src.kind === 'bundle' ? (
              <>
                <span className="import-ok">Full copy file</span>
                {src.bundle.format === 'lessonlit-class' ? (
                  <>
                    <span className="eyebrow">Class · {src.bundle.name}</span>
                    <ol className="import-tasks">
                      {src.bundle.lessons.map((l, i) => (
                        <li key={i}>
                          <strong>{(l.item.title as string) || 'Untitled lesson'}</strong>
                          <span className="hint"> · {l.tasks.length} {l.tasks.length === 1 ? 'task' : 'tasks'}{Object.keys(l.boards ?? {}).length ? ' · board' : ''}</span>
                        </li>
                      ))}
                    </ol>
                    <span className="hint">All {src.bundle.lessons.length} lessons go into the topic chosen below, hidden until you show them.</span>
                  </>
                ) : (
                  <>
                    <span className="eyebrow">{(src.bundle.item.title as string) || 'Untitled lesson'}</span>
                    <ol className="import-tasks">
                      {src.bundle.tasks.map((t, i) => (
                        <li key={i} className={t.data.kind === 'section' ? 'sec' : ''}>
                          <strong>{(t.data.title as string) || 'Untitled task'}</strong>
                        </li>
                      ))}
                    </ol>
                    <span className="hint">
                      Comes with answer keys and notes{Object.keys(src.bundle.boards ?? {}).length ? ', the board drawings' : ''}
                      {Object.keys(src.bundle.media ?? {}).length ? ` and ${Object.keys(src.bundle.media).length} pictures or audio clips` : ''}.
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                {src.kind === 'gift' && <span className="eyebrow">Moodle GIFT · {src.result.count} {src.result.count === 1 ? 'question' : 'questions'}</span>}
                {result!.errors.length > 0 ? (
                  <div className="import-errors" role="alert">
                    <strong>
                      {result!.errors.length} {result!.errors.length === 1 ? 'problem' : 'problems'} to fix
                    </strong>
                    {result!.errors.map((e, i) => (
                      <span key={i} className="ie-row">
                        <span className="ie-line">Line {e.line}</span>
                        <span>{e.message}</span>
                        {lines[e.line - 1] !== undefined && <code>{lines[e.line - 1].trim().slice(0, 60) || '(empty line)'}</code>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="import-ok">Everything looks right.</span>
                )}
                <span className="eyebrow">{result!.title || 'Untitled lesson'}</span>
                <ol className="import-tasks">
                  {result!.tasks.map((t, i) => (
                    <li key={i} className={t.kind === 'section' ? 'sec' : ''}>
                      <strong>{t.title || 'Untitled task'}</strong>
                      {t.kind !== 'section' && (
                        <span className="hint">
                          {' '}
                          · {qCount(t.content)} {qCount(t.content) === 1 ? 'question' : 'questions'}
                          {t.notes ? ' · notes' : ''}
                          {t.hidden ? ' · hidden' : ''}
                          {t.locked ? ' · locked' : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {errLines.size > 0 && <span className="hint">Fix the lines above, then import.</span>}
              </>
            )}
          </div>
        </div>
        <div className="row-between">
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            Topic
            <NSelect value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="">Unsorted</option>
            </NSelect>
          </label>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {busy && <span className="hint">{busy}</span>}
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={!ready || busy.startsWith('Importing')} onClick={create}>
              {busy.startsWith('Importing') ? 'Importing…' : src?.kind === 'bundle' && src.bundle.format === 'lessonlit-class' ? 'Import all lessons' : 'Import lesson'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
