import { useRef } from 'react';
import { AutoTextarea } from '../ai/AutoTextarea';
const groups = [
  { name: 'Cambridge', options: ['CELTA','DELTA (full qualification)','DELTA Module 1','DELTA Module 2','DELTA Module 3','TKT Module 1','TKT Module 2','TKT Module 3','TKT CLIL','TKT Young Learners','Cambridge Train the Trainer'] },
  { name: 'Trinity', options: ['Trinity CertTESOL','Trinity DipTESOL','Trinity TYLEC','Trinity CertPT','Trinity CertOT'] },
  { name: 'Other training', options: ['TEFL course','MA TESOL','Other','No formal qualification'] },
];
const all = groups.flatMap(g => g.options);
function selected(value: string) {
  const values: string[] = []; const custom: string[] = [];
  for (const raw of value.split(',').map(s => s.trim()).filter(Boolean)) {
    const alias = /^none$/i.test(raw) ? 'No formal qualification' : /^delta$/i.test(raw) ? 'DELTA (full qualification)' : /^certtesol$/i.test(raw) ? 'Trinity CertTESOL' : /^diptesol$/i.test(raw) ? 'Trinity DipTESOL' : raw;
    const known = all.find(option => option.toLowerCase() === alias.toLowerCase());
    if (known) values.push(known);
    else if (/^other:/i.test(raw)) { values.push('Other'); custom.push(raw.replace(/^other:\s*/i,'')); }
    else { values.push('Other'); custom.push(raw); }
  }
  return { values: [...new Set(values)], custom: custom.join(', ') };
}
export function Qualifications({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const current = selected(value);
  function write(values: string[], custom = current.custom) {
    onChange(values.map(v => v === 'Other' ? `Other: ${custom}` : v).join(', '));
  }
  function toggle(option: string, enabled: boolean) {
    let values = current.values.filter(v => v !== option);
    if (enabled) values = option === 'No formal qualification' ? [option] : [...values.filter(v => v !== 'No formal qualification'),option];
    write(values);
  }
  return <fieldset className="qualifications-field" disabled={disabled}><legend>Teaching courses and qualifications</legend><details ref={ref} className="qualifications-picker"><summary>{current.values.length ? current.values.map(v => v === 'Other' && current.custom ? current.custom : v).join(', ') : 'Select all that apply'}</summary><div className="qualifications-options">{groups.map(group => <fieldset key={group.name}><legend>{group.name}</legend>{group.options.map(option => <label key={option}><input type="checkbox" checked={current.values.includes(option)} onChange={e => toggle(option,e.target.checked)} /><span>{option}</span></label>)}</fieldset>)}<button className="btn" type="button" onClick={() => { if (ref.current) ref.current.open = false; }}>Done</button></div></details>{current.values.includes('Other') && <label>Specify your other course or qualification<AutoTextarea aria-label="Specify your other course or qualification" value={current.custom} required maxLength={3000} onChange={e => write(current.values,e.target.value)} placeholder="Course or qualification name" /></label>}<small>Select completed qualifications or individual modules. These don’t determine your expertise.</small></fieldset>;
}
