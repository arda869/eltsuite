import QRCode from 'qrcode';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { splitKey, questionIds, scoreTask } from '../src/lib/questions';
import { TaskRenderer } from '../src/components/TaskRenderer';
import { TaskEditor, COMMANDS } from '../src/editor/TaskEditor';
import { fixture, exportFixture } from './lesson-style-fixture';
import { flattenTask } from '../src/lib/worksheet';
import { worksheetHtml } from '../src/lib/worksheetHtml';
import { worksheetPdf } from '../src/lib/pdfMake';
import '../src/styles.css';
import '../src/friday-ui.css';
import '../src/lessons/youngLesson.css';

function Check() {
  const [style, setStyle] = useState('young');
  const [responses, setResponses] = useState({});
  const [content, setContent] = useState(fixture);
  Object.assign(window, { setFixture: setContent, fixture, COMMANDS, splitKey, questionIds, scoreTask, exportFixture, flattenTask, worksheetHtml, worksheetPdf, responses, soundFixture: async () => ({'style-recording': {url:'https://example.org/visit',svg: await QRCode.toString('https://example.org/visit',{type:'svg'}),png:'',title:'Listen to the visit plan',video:false,script:['We will go on Monday.']}}) });
  return <div style={{ padding: 24, ['--accent' as string]: '#338399', ['--accent-text' as string]: '#216073' }}>
    <aside id="outside">Outside lesson</aside>
    <label>Fixture style <select value={style} onChange={e => setStyle(e.target.value)}><option value="adult">Adult</option><option value="young">Young learner</option></select></label>
    <main className="task-frame" data-lesson-style={style} style={{ maxWidth: 920, margin: '20px auto' }}>
      <div className="frame-inner"><div className="frame-head"><h1 className="task-title"><span className="yl-activity-number">1</span>Planning a visit</h1><p className="task-instr">Read, choose and compare your ideas.</p></div>
      <div className="frame-body"><TaskRenderer content={content} responses={responses} teacher onChange={(id, value) => setResponses(r => ({ ...r, [id]: value }))} /></div></div>
    </main>
    <div id="catalogue-editor"><TaskEditor content={{type:'doc',content:[{type:'paragraph'}]}} onChange={()=>{}} /></div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Check />);
