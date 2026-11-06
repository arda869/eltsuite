import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MultiSelect, NSelect } from '../src/components/Select';
import '../src/styles.css';
import '../src/cohesion.css';
import './control-gallery.css';

function Gallery() {
  const [choice, setChoice] = useState('b');
  const [many, setMany] = useState<string[]>(['reading']);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState(45);
  const [dialog, setDialog] = useState(false);
  const [file, setFile] = useState('No file chosen');
  return <main className="cg" aria-label="ELT Suite control gallery">
    <header className="cg-head"><span>ELT SUITE</span><h1>Controls and states</h1><p>Shared controls at desktop, tablet, phone and browser zoom sizes.</p></header>
    <div className="cg-grid">
      <section className="cg-card"><h2>Text</h2>
        <label className="field">Default<input placeholder="Enter a name" /></label>
        <label className="field">Filled<input defaultValue="Reading journal" /></label>
        <label className="field">Required<input required placeholder="Required field" aria-describedby="cg-required-help" /></label><small id="cg-required-help" className="hint">Add a title before saving.</small>
        <label className="field">Invalid<input aria-invalid="true" aria-describedby="cg-invalid-help" defaultValue="Missing @ sign" /></label><small id="cg-invalid-help" className="error">Enter a valid email address.</small>
        <label className="field">Read only<input readOnly value="Classroom A" /></label>
        <label className="field">Disabled<input disabled value="Unavailable" /></label>
        <label className="field">Long answer<textarea rows={3} placeholder="Write your response here…" /></label>
        <label className="field">Search<input type="search" value={query} placeholder="Find a resource" onChange={e=>setQuery(e.target.value)} /></label>
        <button className="btn" type="button" onClick={()=>setQuery('')} disabled={!query}>Clear search</button>
      </section>
      <section className="cg-card"><h2>Choose</h2>
        <div className="field"><span>One option</span><NSelect aria-label="One option" value={choice} onChange={e=>setChoice(e.target.value)}><option value="a">Short option</option><option value="b">A longer selected option</option><option value="c">Third option</option></NSelect></div>
        <div className="field"><span>Several options</span><MultiSelect label="Several options" value={many} onChange={setMany} options={[{v:'reading',label:'Reading'},{v:'speaking',label:'Speaking'},{v:'writing',label:'Writing'}]} /></div>
        <div className="field"><span>Unavailable option</span><NSelect aria-label="Unavailable option" disabled value="a"><option value="a">Disabled control</option></NSelect></div>
        <fieldset className="cg-choices"><legend>Checkboxes</legend><label><input type="checkbox" defaultChecked />Reading</label><label><input type="checkbox" />Speaking</label><label><input type="checkbox" disabled />Unavailable</label></fieldset>
        <fieldset className="cg-choices"><legend>Radio buttons</legend><label><input type="radio" name="cg-level" defaultChecked />Young learners</label><label><input type="radio" name="cg-level" />Adults</label></fieldset>
        <label className="cg-check"><input type="checkbox" role="switch" defaultChecked />Show spelling suggestions</label>
      </section>
      <section className="cg-card"><h2>Dates, numbers and colour</h2>
        <label className="field">Date<input type="date" defaultValue="2026-11-06" /></label>
        <label className="field">Time<input type="time" defaultValue="09:30" /></label>
        <label className="field">Number<input type="number" min="0" max="100" step="5" defaultValue="25" /></label>
        <label className="field">Colour<input type="color" defaultValue="#d98f63" /></label>
        <label className="field">Volume <output>{range}%</output><input type="range" min="0" max="100" value={range} onChange={e=>setRange(Number(e.target.value))} /></label>
      </section>
      <section className="cg-card"><h2>Files and actions</h2>
        <label className="cg-drop"><strong>Upload a file</strong><span>PNG, JPG or PDF · choose a file</span><input aria-label="Upload a file" type="file" accept="image/png,image/jpeg,application/pdf" onChange={e=>setFile(e.target.files?.[0]?.name||'No file chosen')} /></label><small role="status" className="hint">{file}</small>
        <div className="cg-actions"><button className="btn primary">Save changes</button><button className="btn">Cancel</button><button className="btn" disabled>Unavailable</button></div>
        <button type="button" className="btn" onClick={()=>setDialog(true)}>Open dialog</button>
        <div className="field"><span>Rich text</span><div className="cg-edit" contentEditable role="textbox" aria-label="Rich text" data-placeholder="Write here…" suppressContentEditableWarning /></div>
      </section>
    </div>
    {dialog && <div className="cg-shade"><dialog open aria-label="Control example" className="cg-dialog"><h2>Review changes</h2><p>Your edits are ready to save.</p><button className="btn primary" onClick={()=>setDialog(false)}>Done</button></dialog></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Gallery />);
