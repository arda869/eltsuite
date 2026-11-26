import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

// The answer key under a document with questions in it. It is made from the questions as they are
// written, keeps up as they change, and prints on its own page at the end.
export function AnswerKey({ editor }: { editor: Editor }) {
  const [rows, setRows] = useState<{ n: string; text: string }[]>([]);
  useEffect(() => {
    let t = 0;
    let live = true;
    const make = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        void import('./export')
          .then(async ({ printableTasks, answerRows }) => answerRows((await printableTasks(editor.getJSON())).map(([, task]) => task)))
          .then((r) => live && setRows(r))
          .catch(() => {});
      }, 500);
    };
    make();
    editor.on('update', make);
    return () => { live = false; window.clearTimeout(t); editor.off('update', make); };
  }, [editor]);
  if (!rows.length) return null;
  return (
    <section className="cd-key" aria-label="Answer key">
      <header>
        <h2>Answer key</h2>
        <span>Made from the questions above. It prints on its own page at the end.</span>
      </header>
      <ol>
        {rows.map((r, i) => (
          <li key={i}><b>{r.n}</b><span>{r.text}</span></li>
        ))}
      </ol>
    </section>
  );
}
