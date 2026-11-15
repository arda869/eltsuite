import { NSelect } from '../components/Select';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { El } from './model';
import type { Ctx } from './Editor';
import { CHART_PALETTE, drawFigure, type ChartFigure } from './figures';
import MapEditor from './MapEditor';
import './figures.css';

function Field({name,value,onChange,placeholder}:{name:string;value:string;onChange:(s:string)=>void;placeholder?:string}){return <label className="dz-field"><span>{name}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;}
function NumberField({name,value,onChange}:{name:string;value?:number;onChange:(n:number|undefined)=>void}){return <label className="dz-field"><span>{name}</span><input type="number" value={value??''} onChange={e=>onChange(e.target.value===''?undefined:Number(e.target.value))}/></label>;}

export function FigureProps({cx,e,set}:{cx:Ctx;e:El;set:(p:Partial<El>,key?:string)=>void}){
  const f=e.figure!;
  const [open,setOpen]=useState(true);
  const [editorOpen,setOpenEditor]=useState(false);
  return <section className="dz-sec"><button type="button" className="dz-sec-h" onClick={()=>setOpen(o=>!o)} aria-expanded={open}>{f.kind==='chart'?'Chart':'Map'} settings <span aria-hidden="true">⌄</span></button>
    {open&&<div className="dz-sec-b dz-figure-quick">
      <Field name="Title" value={f.title} onChange={title=>set({figure:{...f,title}},'figure-title')}/>
      {f.kind==='chart'&&<label className="dz-field"><span>Chart type</span><NSelect value={f.chart} onChange={ev=>set({figure:{...f,chart:ev.target.value as ChartFigure['chart']}},'figure-kind')}><option value="bars">Bars</option><option value="lines">Lines</option><option value="pie">Pie</option><option value="table">Table</option></NSelect></label>}
      <button type="button" className="dz-figure-open" onClick={()=>setOpenEditor(true)}>{f.kind==='chart'?'Edit chart data and style':'Edit map and symbols'} ↗</button>
      <p className="hint">The figure remains sharp in downloads and print.</p>
    </div>}
    {editorOpen&&createPortal(f.kind==='chart'?<ChartEditor e={e} set={set} onClose={()=>setOpenEditor(false)}/>:<MapEditor cx={cx} e={e} set={set} onClose={()=>setOpenEditor(false)}/>,document.querySelector('.dz-figure-modal-root')||document.body)}
  </section>;
}

function ChartEditor({e,set,onClose}:{e:El;set:(p:Partial<El>,key?:string)=>void;onClose:()=>void}){
  const f=e.figure as ChartFigure;
  const patch=(v:Partial<ChartFigure>,key='chart-edit')=>set({figure:{...f,...v}},key);
  const cell=(row:number,col:number,v:string)=>{const series=f.series.map((s,i)=>i===col?{...s,values:f.categories.map((_,r)=>r===row?Number(v)||0:s.values[r]||0)}:s);patch({series},'chart-data');};
  const renameSeries=(i:number,name:string)=>patch({series:f.series.map((s,j)=>i===j?{...s,name}:s)},'chart-series');
  const preview=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const g=preview.current?.getContext('2d');if(g)drawFigure(g,f,800,560);},[f]);
  return <div className="dz-figure-modal" role="dialog" aria-modal="true" aria-label="Edit chart"><div className="dz-figure-dialog">
    <header><span><strong>Edit chart</strong><small>Change the figures and see the finished chart beside them.</small></span><button type="button" onClick={onClose} aria-label="Close chart editor">×</button></header>
    <div className="dz-figure-work"><div className="dz-figure-controls">
      <div className="dz-figure-formrow"><Field name="Title" value={f.title} onChange={title=>patch({title},'chart-title')}/><label className="dz-field"><span>Type</span><NSelect value={f.chart} onChange={ev=>patch({chart:ev.target.value as ChartFigure['chart']})}><option value="bars">Bar chart</option><option value="lines">Line graph</option><option value="pie">Pie chart</option><option value="table">Table</option></NSelect></label></div>
      {f.chart==='bars'&&<label className="dz-figure-check"><input type="checkbox" checked={!!f.horizontal} onChange={ev=>patch({horizontal:ev.target.checked})}/> Horizontal bars</label>}
      <h3>Data</h3><p className="dz-figure-help">Edit each value directly. Add rows for categories and columns for series. Pie charts use one series per pie.</p>
      <div className="dz-figure-data-wrap"><table className="dz-figure-data"><thead><tr><th>Category</th>{f.series.map((s,j)=><th key={j}><input aria-label={`Series ${j+1} name`} value={s.name} onChange={ev=>renameSeries(j,ev.target.value)}/></th>)}<th/></tr></thead><tbody>{f.categories.map((c,i)=><tr key={i}><td><input aria-label={`Category ${i+1}`} value={c} onChange={ev=>patch({categories:f.categories.map((x,r)=>r===i?ev.target.value:x)},'chart-category')}/></td>{f.series.map((s,j)=><td key={j}><input type="number" step="any" aria-label={`${c}, ${s.name}`} value={s.values[i]??0} onChange={ev=>cell(i,j,ev.target.value)}/></td>)}<td><button type="button" onClick={()=>patch({categories:f.categories.filter((_,r)=>r!==i),series:f.series.map(s=>({...s,values:s.values.filter((_,r)=>r!==i)}))})} aria-label={`Remove ${c}`}>×</button></td></tr>)}</tbody></table></div>
      <div className="dz-figure-actions"><button type="button" onClick={()=>patch({categories:[...f.categories,`Category ${f.categories.length+1}`],series:f.series.map(s=>({...s,values:[...s.values,0]}))})}>+ Category</button><button type="button" onClick={()=>patch({series:[...f.series,{name:`Series ${f.series.length+1}`,values:f.categories.map(()=>0),color:CHART_PALETTE[f.series.length%CHART_PALETTE.length]}]})}>+ Series</button></div>
      <h3>{f.chart==='pie'?'Slice colours':'Series style'}</h3>
      {f.chart==='pie'&&f.categories.map((category,i)=><label key={i} className="dz-figure-series"><input type="color" aria-label={`${category} slice colour`} value={f.palette?.[i]||CHART_PALETTE[i%CHART_PALETTE.length]} onChange={ev=>patch({palette:f.categories.map((_,j)=>j===i?ev.target.value:f.palette?.[j]||CHART_PALETTE[j%CHART_PALETTE.length])},'chart-colour')}/><span>{category}</span></label>)}
      {f.series.map((s,i)=><div key={i} className="dz-figure-series">{f.chart!=='pie'&&<input type="color" aria-label={`${s.name} colour`} value={s.color} onChange={ev=>patch({series:f.series.map((x,j)=>j===i?{...x,color:ev.target.value}:x)},'chart-colour')}/>}<span>{s.name}</span>{f.chart==='lines'&&<label><input type="checkbox" checked={!!s.dashed} onChange={ev=>patch({series:f.series.map((x,j)=>j===i?{...x,dashed:ev.target.checked}:x)})}/> Dashed</label>}<button type="button" disabled={f.series.length===1} onClick={()=>patch({series:f.series.filter((_,j)=>i!==j)})} aria-label={`Remove ${s.name}`}>×</button></div>)}
      {f.chart!=='pie'&&f.chart!=='table'&&<><h3>Axes</h3><div className="dz-figure-formrow"><NumberField name="Minimum" value={f.min} onChange={min=>patch({min})}/><NumberField name="Maximum" value={f.max} onChange={max=>patch({max})}/><NumberField name="Tick interval" value={f.step} onChange={step=>patch({step})}/></div><div className="dz-figure-formrow"><Field name="Horizontal axis" value={f.xLabel||''} onChange={xLabel=>patch({xLabel})}/><Field name="Vertical axis" value={f.yLabel||''} onChange={yLabel=>patch({yLabel})}/></div><label className="dz-figure-check"><input type="checkbox" checked={!!f.showValues} onChange={ev=>patch({showValues:ev.target.checked})}/> Show values on chart</label></>}
      <div className="dz-figure-formrow"><Field name="Unit or suffix" value={f.unit||''} onChange={unit=>patch({unit})} placeholder="%, £m, millions…"/><Field name="Footnote" value={f.footnote||''} onChange={footnote=>patch({footnote})}/></div>
    </div><div className="dz-figure-live"><p>Live preview</p><canvas ref={preview} width={800} height={560}/><small>All labels, bars and lines are rendered in the download too.</small></div></div>
    <footer><button type="button" className="btn primary" onClick={onClose}>Done</button></footer>
  </div></div>;
}

