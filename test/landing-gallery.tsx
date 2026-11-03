// Real components for the homepage pictures (run after ?seed in the same browser):
//   ?show=marks — a sentence marked the way classes mark pronunciation, with a definition open
//   ?show=live  — the live answers pane for a task, with learners' answers
import '../src/styles.css';
import '../src/cohesion.css';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { TaskRenderer } from '../src/components/TaskRenderer';
import { LivePanel } from '../src/components/LivePanel';
import { importLesson } from '../src/lib/textformat';
import { splitKey, questionIds } from '../src/lib/questions';

const show = new URLSearchParams(location.search).get('show') || 'marks';
const t = (text: string, marks?: any[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const schwa = [{ type: 'speechSound', attrs: { k: 'schwa', s: 'top' } }];
const platform = { type: 'definition', attrs: { data: { pos: 'noun', ipa: '/ˈplætfɔːm/', meaning: 'A piece of software or a website where people can do things together, such as plan, teach and share their work.', example: 'Our school uses one platform for lessons and homework.' } } };
const sentence = { type: 'doc', content: [{ type: 'paragraph', content: [
  t('A', schwa), t(' '), t('platform', [platform]), t(' th'), t('a', schwa), t('t speaks'),
  { type: 'plink', attrs: { k: 'link', s: 'under' } },
  t('your '), { type: 'stress', attrs: { syllables: ['lan', 'guage'], stressed: 0, style: 'box' } }, t('.'),
] }] };

function Marks() {
  return <main className="lg-marks" style={{ padding: '40px 30px 300px', background: '#fff', minHeight: '100vh' }}><div className="task-body"><TaskRenderer content={sentence as any} responses={{}} onChange={() => {}} /></div></main>;
}

const SRC = `# Opinions\n\n## Task 1: Giving reasons\n[[mcq]]\nWhich phrase introduces a reason?\n- I see your point\n* The main reason is\n- Let me think\n[[/mcq]]\n\nI {{agree}} with you, but what {{about}} the cost?\n`;
function Live() {
  const [ready, setReady] = useState<null | { classId: string; content: any; key: any }>(null);
  useEffect(() => { void (async () => {
    const demo = JSON.parse(localStorage.getItem('mockdemo') || '{}');
    const classId = demo.classId as string;
    const task = importLesson(SRC).tasks[0] as any;
    const { content, key } = splitKey(task.content);
    const qs = questionIds(content).map((q) => q.id);
    const learners = (await getDocs(collection(db, 'classes', classId, 'learners'))).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const picks = [[1, 'agree', 'about'], [1, 'agree', 'about'], [0, 'agree', 'about'], [1, 'agreed', 'about'], [1, 'agree', 'for'], [2, 'agree', 'about'], [1, 'agree', 'about'], [1, 'agree', 'about']];
    for (let i = 0; i < learners.length; i++) {
      const l = learners[i], [c, g1, g2] = picks[i % picks.length];
      const responses: any = { [qs[0]]: [c], [qs[1]]: g1, [qs[2]]: g2 };
      await setDoc(doc(db, 'classes', classId, 'answers', `t-live_${l.authUid || l.id}`), { learnerUid: l.authUid || l.id, learnerId: l.id, itemId: 'i-live', taskId: 't-live', responses, checked: i % 3 !== 2 });
    }
    setReady({ classId, content, key });
  })(); }, []);
  if (!ready) return <p>One moment…</p>;
  return <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: '100vh', background: '#fff' }}><div style={{ width: 380 }}><LivePanel classId={ready.classId} taskId="t-live" content={ready.content} answerKey={ready.key} presence={[]} seeLearners={false} /></div></div>;
}
createRoot(document.getElementById('root')!).render(show === 'live' ? <Live /> : <Marks />);
