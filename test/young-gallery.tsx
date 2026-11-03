// Real tasks in a young learners' class frame, for screenshots: /test/young-gallery.html?style=young
import '../src/styles.css';
import '../src/cohesion.css';
import '../src/lessons/youngLesson.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskRenderer } from '../src/components/TaskRenderer';
import { importLesson } from '../src/lib/textformat';
const SRC = `# Animals\n\n## Task 1: Which animal?\n[[mcq]]\nWhich animal says “moo”?\n- a cat\n* a cow\n- a dog\n- a duck\n[[/mcq]]\n\n## Task 2: Finish the sentences\nThe {{cat}} is on the mat. I {{like}} bananas.\n`;
const pk = importLesson(SRC);
const style = new URLSearchParams(location.search).get('style') || 'young';
function Task({ t, i }: { t: any; i: number }) {
  const [r, setR] = useState<Record<string, unknown>>({});
  return <main data-lesson-style={style} style={{ padding: 24, maxWidth: 980 }}><h1 className="task-title">{style === 'young' && <span className="yl-activity-number" aria-hidden="true">{i + 1}</span>}{t.title}</h1><TaskRenderer content={t.content} responses={r as any} onChange={(id: string, v: unknown) => setR((s) => ({ ...s, [id]: v }))} /></main>;
}
createRoot(document.getElementById('root')!).render(<>{pk.tasks.map((t: any, i: number) => <Task key={i} t={t} i={i} />)}</>);
