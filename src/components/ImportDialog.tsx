import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importLesson } from '../lib/textformat';
import { createLessonFromImport } from '../lib/transfer';
import type { Topic } from '../lib/classes';

// Paste or upload a lesson written in the text convention, check it, then create it.
export function ImportDialog({ classId, topics, onClose }: { classId: string; topics: Topic[]; onClose: () => void }) {
  const [text, setText] = useState('');
  const [topicId, setTopicId] = useState<string>(topics[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const result = useMemo(() => (text.trim() ? importLesson(text) : null), [text]);
  const errLines = new Set(result?.errors.map((e) => e.line));
  const lines = text.split('\n');
  const qCount = (c: unknown) => (JSON.stringify(c).match(/"id":"/g) ?? []).length;

  async function create() {
    if (!result || result.errors.length) return;
    setBusy(true);
    try {
      const id = await createLessonFromImport(classId, topicId || null, result.title, result.tasks);
      onClose();
      navigate(`/class/${classId}/lesson/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog import-dialog" role="dialog" aria-label="Import a lesson" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Import a lesson</h2>
          <label className="btn small-btn">
            Upload a .md or .txt file
            <input type="file" accept=".md,.txt,text/plain,text/markdown" hidden onChange={(e) => e.target.files?.[0]?.text().then(setText)} />
          </label>
        </div>
        <div className="import-grid">
          <div className="import-src">
            <textarea value={text} spellCheck={false} placeholder={'# Lesson title\n\n## Task 1: Warm-up\nI {{have been|\'ve been}} to Tokyo.\nShe {{?go|*goes|going}} to work.'} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="import-preview">
            {!result ? (
              <p className="hint">Paste the lesson text on the left. You will see the tasks and any problems here before anything is created.</p>
            ) : (
              <>
                {result.errors.length > 0 ? (
                  <div className="import-errors" role="alert">
                    <strong>
                      {result.errors.length} {result.errors.length === 1 ? 'problem' : 'problems'} to fix
                    </strong>
                    {result.errors.map((e, i) => (
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
                <span className="eyebrow">{result.title || 'Untitled lesson'}</span>
                <ol className="import-tasks">
                  {result.tasks.map((t, i) => (
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
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="">Unsorted</option>
            </select>
          </label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={!result || result.errors.length > 0 || !result.tasks.length || busy} onClick={create}>
              {busy ? 'Importing…' : 'Import lesson'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
