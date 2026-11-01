import {Select} from '../components/Select';
import {IMPORT_TYPES,IMPORT_TYPE_BY_KIND,defaultSchemaValue,newImportElement,type ImportElement,type ImportValue,type ImportSchema} from '../../functions/ai/import-types.js';
const human=(s:string)=>s.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
export function ImportElementEditor({element,name,onChange,training}:{element:ImportElement;name:string;onChange:(e:ImportElement)=>void;training:boolean}){
 const current=IMPORT_TYPE_BY_KIND.get(element.kind);
 return <details className="mi-inline-element"><summary>{current?.label||element.kind}{element.prompt?' · '+element.prompt.slice(0,100):''}</summary>
  <div className="mi-inline-type"><strong>{name}</strong><Select value={element.kind} options={IMPORT_TYPES.filter(t=>training||!t.kind.startsWith('tt-')).map(t=>({v:t.kind,label:t.label,hint:t.hint,icon:'task'}))} onChange={kind=>{const next=newImportElement(kind,element.prompt),schema=IMPORT_TYPE_BY_KIND.get(kind)?.dataSchema;next.needs=element.needs??[];next.feedback=element.feedback;next.example=element.example;for(const [key,value]of Object.entries(element.data))if(schema?.properties?.[key]&&JSON.stringify(schema.properties[key])===JSON.stringify(current?.dataSchema.properties?.[key]))next.data[key]=structuredClone(value);onChange(next);}} label={`${name} · Inline task type`} search /></div>
  <p className="hint">{element.reason}</p>
  <ImportValueEditor name={`${name} · Prompt`} value={element.prompt} onChange={v=>onChange({...element,prompt:String(v)})}/>
  <ImportValueEditor name={`${name} · Answer and settings`} value={element.data} schema={current?.dataSchema} onChange={v=>onChange({...element,data:{...v as ImportElement['data'],...(element.kind==='picture'?{asset:''}:{})}})}/>
  <ImportValueEditor name={`${name} · Missing resources`} value={element.needs??[]} schema={{type:'array',minItems:0,maxItems:4,items:{type:'string',enum:['picture','recording','transcript','classroomSetup']}}} onChange={v=>onChange({...element,needs:v as string[]})}/>
  <ImportValueEditor name={`${name} · Private answer feedback`} value={element.feedback} onChange={v=>onChange({...element,feedback:String(v)})}/>
  <label className="mi-check"><input type="checkbox" checked={element.example} onChange={e=>onChange({...element,example:e.target.checked})}/> Worked example: show its answer to learners without marking it.</label>
 </details>;
}
export function ImportValueEditor({value,name,onChange,schema}:{value:ImportValue;name:string;onChange:(v:ImportValue)=>void;schema?:ImportSchema}){
 if(schema?.enum)return <label className="mi-field">{name}<Select label={name} value={String(value)} options={schema.enum.map(v=>({v:String(v),label:human(String(v)),icon:'task'}))} onChange={v=>onChange(schema.type==='integer'||schema.type==='number'?Number(v):v)} /></label>;
 if(typeof value==='boolean')return <label className="mi-check"><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{name}</label>;
 if(typeof value==='string')return <label className="mi-field">{name}<textarea aria-label={name} rows={value.length>150?4:2} value={value} maxLength={schema?.maxLength} onChange={e=>onChange(e.target.value)}/></label>;
 if(typeof value==='number')return <label className="mi-field">{name}<input aria-label={name} type="number" step={schema?.type==='number'?'any':1} min={schema?.minimum} max={schema?.maximum} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
 if(Array.isArray(value))return <fieldset className="mi-array"><legend>{name}</legend>{value.map((v,i)=><div key={i} className="mi-array-item"><ImportValueEditor name={`${name} ${i+1}`} value={v} schema={schema?.items} onChange={next=>onChange(value.map((x,j)=>j===i?next:x))}/><button type="button" className="btn small-btn" aria-label={`Remove ${name} ${i+1}`} onClick={()=>onChange(value.filter((_,j)=>j!==i))}>Remove</button></div>)}{schema?.items&&<button type="button" className="btn" disabled={value.length>=(schema.maxItems??100)} onClick={()=>onChange([...value,defaultSchemaValue(schema.items!)])}>Add {name.split(' · ').at(-1)?.toLowerCase()} entry</button>}</fieldset>;
 if(!value)return null;
 return <>{Object.entries(value).filter(([key])=>key!=='asset').map(([key,v])=><ImportValueEditor key={key} name={`${name} · ${human(key)}`} value={v} schema={schema?.properties?.[key]} onChange={next=>onChange({...value,[key]:next})}/>)}</>;
}
