import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { loadPicture, storePicture, type El } from './model';
import type { Ctx } from './Editor';
import { cloneFigure, makeMapItem, mapPointFromCanvas } from './figureTemplates';
import { CHART_PALETTE, drawFigure, MAP_ICONS, type ChartFigure, type MapFigure, type MapItem, type MapItemKind, type Point } from './figures';
import './figures.css';

const pathKinds:MapItemKind[]=['road','river','footpath','wall','fence','bridge'];
const objectKinds:MapItemKind[]=['building','room','zone','water','roundabout','tree','gate','marker','label','compass'];
const labelOf=(k:string)=>k.charAt(0).toUpperCase()+k.slice(1).replace(/([A-Z])/g,' $1');
function Field({name,value,onChange,placeholder}:{name:string;value:string;onChange:(s:string)=>void;placeholder?:string}){return <label className="dz-field"><span>{name}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;}
function NumberField({name,value,onChange}:{name:string;value?:number;onChange:(n:number|undefined)=>void}){return <label className="dz-field"><span>{name}</span><input type="number" value={value??''} onChange={e=>onChange(e.target.value===''?undefined:Number(e.target.value))}/></label>;}

export function FigureProps({cx,e,set}:{cx:Ctx;e:El;set:(p:Partial<El>,key?:string)=>void}){
  const f=e.figure!;
  const [open,setOpen]=useState(true);
  const [editorOpen,setOpenEditor]=useState(false);
  return <section className="dz-sec"><button type="button" className="dz-sec-h" onClick={()=>setOpen(o=>!o)} aria-expanded={open}>{f.kind==='chart'?'Chart':'Map'} settings <span aria-hidden="true">⌄</span></button>
    {open&&<div className="dz-sec-b dz-figure-quick">
      <Field name="Title" value={f.title} onChange={title=>set({figure:{...f,title}},'figure-title')}/>
      {f.kind==='chart'&&<label className="dz-field"><span>Chart type</span><select value={f.chart} onChange={ev=>set({figure:{...f,chart:ev.target.value as ChartFigure['chart']}},'figure-kind')}><option value="bars">Bars</option><option value="lines">Lines</option><option value="pie">Pie</option><option value="table">Table</option></select></label>}
      <button type="button" className="dz-figure-open" onClick={()=>setOpenEditor(true)}>{f.kind==='chart'?'Edit chart data and style':'Edit map and symbols'} ↗</button>
      <p className="hint">The figure remains sharp in downloads and print.</p>
    </div>}
    {editorOpen&&(f.kind==='chart'?<ChartEditor e={e} set={set} onClose={()=>setOpenEditor(false)}/>:<MapEditor cx={cx} e={e} set={set} onClose={()=>setOpenEditor(false)}/>)}
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
      <div className="dz-figure-formrow"><Field name="Title" value={f.title} onChange={title=>patch({title},'chart-title')}/><label className="dz-field"><span>Type</span><select value={f.chart} onChange={ev=>patch({chart:ev.target.value as ChartFigure['chart']})}><option value="bars">Bar chart</option><option value="lines">Line graph</option><option value="pie">Pie chart</option><option value="table">Table</option></select></label></div>
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

type MapTool='select'|MapItemKind|'icon';
function MapEditor({cx,e,set,onClose}:{cx:Ctx;e:El;set:(p:Partial<El>,key?:string)=>void;onClose:()=>void}){
  const initial=e.figure as MapFigure;
  const [draft,setDraft]=useState<MapFigure>(()=>cloneFigure(initial) as MapFigure);
  const [tool,setTool]=useState<MapTool>('select');
  const [iconKey,setIconKey]=useState<string>('café');
  const [symbolQuery,setSymbolQuery]=useState('');
  const [selected,setSelected]=useState<string>('');
  const [zoom,setZoom]=useState(1);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [background,setBackground]=useState<CanvasImageSource|undefined>(()=>initial.backgroundImage?cx.imgs.get(initial.backgroundImage):undefined);
  const canvas=useRef<HTMLCanvasElement>(null);
  const upload=useRef<HTMLInputElement>(null);
  const dragging=useRef<{id:string;start:Point;item:MapItem;vertex?:number}|null>(null);
  const path=useRef<Point[]|null>(null);
  const current=draft.items.find(x=>x.id===selected);
  useEffect(()=>{if(draft.backgroundImage&&!background)void loadPicture(cx.d.id,draft.backgroundImage).then(setBackground,()=>{});},[draft.backgroundImage,cx.d.id,background]);
  useEffect(()=>{const g=canvas.current?.getContext('2d');if(!g)return;g.clearRect(0,0,1000,720);drawFigure(g,draft,1000,720,background);if(current){g.strokeStyle='#8d68b6';g.lineWidth=3;if(current.points?.length){current.points.forEach(pt=>{const x=40+pt.x*920,y=88+pt.y*570;g.fillStyle='#fff';g.fillRect(x-7,y-7,14,14);g.strokeRect(x-7,y-7,14,14);});}else{const x=40+(current.x??0)*920,y=88+(current.y??0)*570;g.setLineDash([6,5]);g.strokeRect(x-18,y-18,36,36);g.setLineDash([]);}}if(path.current?.length){g.strokeStyle='#9b86b5';g.lineWidth=3;g.beginPath();path.current.forEach((p,i)=>{const x=40+p.x*920,y=88+p.y*570;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();}},[draft,current,background]);
  const point=(ev:PointerEvent<HTMLCanvasElement>)=>{const r=ev.currentTarget.getBoundingClientRect();return mapPointFromCanvas((ev.clientX-r.left)*1000/r.width,(ev.clientY-r.top)*720/r.height,1000,720);};
  const nearest=(q:Point)=>draft.items.slice().reverse().find(it=>{if(it.points?.length)return it.points.some(pt=>Math.hypot(pt.x-q.x,pt.y-q.y)<.04);return Math.hypot((it.x??0)-q.x,(it.y??0)-q.y)<Math.max(.045,(it.w??.1)/2);});
  const down=(ev:PointerEvent<HTMLCanvasElement>)=>{ev.currentTarget.setPointerCapture(ev.pointerId);const q=point(ev);if(tool==='select'){const hit=nearest(q);setSelected(hit?.id||'');if(hit){const item=(cloneFigure({kind:'map',title:'',items:[hit]}) as MapFigure).items[0];const vertex=item.points?.findIndex(pt=>Math.hypot(pt.x-q.x,pt.y-q.y)<.04);dragging.current={id:hit.id,start:q,item,vertex:vertex===-1?undefined:vertex};}}
    else if(pathKinds.includes(tool as MapItemKind)){path.current=[q];}
    else {const item=makeMapItem(tool==='icon'?'icon':tool,q.x,q.y,iconKey);if(tool==='icon')item.label=MAP_ICONS.find(([k])=>k===iconKey)?.[1]||'Place';setDraft(d=>({...d,items:[...d.items,item]}));setSelected(item.id);setTool('select');}
  };
  const move=(ev:PointerEvent<HTMLCanvasElement>)=>{if(!ev.currentTarget.hasPointerCapture(ev.pointerId))return;const q=point(ev);if(path.current){const last=path.current[path.current.length-1];if(Math.hypot(q.x-last.x,q.y-last.y)>.008){path.current=[...path.current,q];setDraft(d=>({...d}));}return;}
    const drag=dragging.current;if(!drag)return;const dx=q.x-drag.start.x,dy=q.y-drag.start.y;setDraft(d=>({...d,items:d.items.map(it=>it.id!==drag.id?it:{...drag.item,x:drag.item.x===undefined?undefined:Math.max(0,Math.min(1,drag.item.x+dx)),y:drag.item.y===undefined?undefined:Math.max(0,Math.min(1,drag.item.y+dy)),points:drag.item.points?.map((pt,i)=>drag.vertex!==undefined&&i!==drag.vertex?pt:{x:Math.max(0,Math.min(1,pt.x+dx)),y:Math.max(0,Math.min(1,pt.y+dy))})})}));
  };
  const up=(ev:PointerEvent<HTMLCanvasElement>)=>{if(ev.currentTarget.hasPointerCapture(ev.pointerId))ev.currentTarget.releasePointerCapture(ev.pointerId);if(path.current){const points=path.current;path.current=null;if(points.length>1){const item:MapItem={id:crypto.randomUUID(),kind:tool as MapItemKind,points};setDraft(d=>({...d,items:[...d.items,item]}));setSelected(item.id);}else setError('Drag across the map to draw a line.');setTool('select');}dragging.current=null;};
  const modify=(v:Partial<MapItem>)=>setDraft(d=>({...d,items:d.items.map(it=>it.id===selected?{...it,...v}:it)}));
  const save=()=>{set({figure:draft},'map-edit');onClose();};
  const importImage=async(file?:File)=>{if(!file)return;setBusy(true);setError('');try{if(!file.type.startsWith('image/'))throw new Error('Choose a PNG, JPG, WebP or SVG image.');const {id}=await storePicture(cx.d.id,file);const im=await loadPicture(cx.d.id,id);setBackground(im);setDraft(d=>({...d,backgroundImage:id}));}catch(err){setError(err instanceof Error?err.message:'Could not add this image.');}finally{setBusy(false);if(upload.current)upload.current.value='';}};
  return <div className="dz-figure-modal" role="dialog" aria-modal="true" aria-label="Edit map"><div className="dz-figure-dialog dz-map-dialog">
    <header><span><strong>Edit map</strong><small>Draw the plan, place symbols and add a background picture.</small></span><button type="button" onClick={onClose} aria-label="Close map editor">×</button></header>
    <div className="dz-figure-work"><div className="dz-map-tools">
      <Field name="Map title" value={draft.title} onChange={title=>setDraft(d=>({...d,title}))}/>
      <div className="dz-map-toolgroup"><strong>Start</strong><button type="button" className={tool==='select'?'on':''} onClick={()=>setTool('select')}>↖ Select & move</button></div>
      <div className="dz-map-toolgroup"><strong>Draw lines</strong><div>{pathKinds.map(k=><button type="button" key={k} className={tool===k?'on':''} onClick={()=>setTool(k)}>{labelOf(k)}</button>)}</div></div>
      <div className="dz-map-toolgroup"><strong>Place shapes</strong><div>{objectKinds.map(k=><button type="button" key={k} className={tool===k?'on':''} onClick={()=>setTool(k)}>{labelOf(k)}</button>)}</div></div>
      <div className="dz-map-toolgroup"><strong>Symbols</strong><input type="search" value={symbolQuery} onChange={ev=>setSymbolQuery(ev.target.value)} placeholder="Search symbols" aria-label="Search map symbols"/><div className="dz-map-symbol-picker">{MAP_ICONS.filter(([k,n])=>`${k} ${n}`.toLowerCase().includes(symbolQuery.toLowerCase())).map(([k,n])=><button type="button" key={k} className={tool==='icon'&&iconKey===k?'on':''} onClick={()=>{setIconKey(k);setTool('icon');}}>{n}</button>)}</div></div>
      <div className="dz-map-toolgroup"><strong>Background visual</strong><input ref={upload} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={ev=>void importImage(ev.target.files?.[0])}/><button type="button" onClick={()=>upload.current?.click()} disabled={busy}>{busy?'Importing…':'Import map image…'}</button>{draft.backgroundImage&&<><label>Opacity <input type="range" min="20" max="100" value={Math.round((draft.backgroundOpacity??1)*100)} onChange={ev=>setDraft(d=>({...d,backgroundOpacity:Number(ev.target.value)/100}))}/></label><button type="button" onClick={()=>{setDraft(d=>({...d,backgroundImage:undefined}));setBackground(undefined);}}>Remove image</button></>}</div>
      {error&&<p role="alert" className="dz-map-error">{error}</p>}
    </div><div className="dz-map-center"><div className="dz-map-instruction">{tool==='select'?'Click a map object to edit it. Drag to reposition.':pathKinds.includes(tool as MapItemKind)?`Drag to draw a ${tool}.`:`Click the map to place ${tool==='icon'?MAP_ICONS.find(([k])=>k===iconKey)?.[1]:tool}.`}</div><div className="dz-map-zoom"><button type="button" onClick={()=>setZoom(v=>Math.max(1,v-.25))} aria-label="Zoom map out">−</button><span>{Math.round(zoom*100)}%</span><button type="button" onClick={()=>setZoom(v=>Math.min(2.5,v+.25))} aria-label="Zoom map in">+</button></div><canvas ref={canvas} width={1000} height={720} style={{width:`${zoom*100}%`,maxWidth:'none'}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Editable map canvas"/><p>Tip: use a reference image as the base, then add movable markers and symbols on top.</p></div>
    <div className="dz-map-inspector"><strong>{current?`Selected ${labelOf(current.kind)}`:'Map layers'}</strong>{current?<><Field name="Label or letter" value={current.label||''} onChange={label=>modify({label})}/>{current.kind==='icon'&&<label className="dz-field"><span>Symbol</span><select value={current.icon} onChange={ev=>modify({icon:ev.target.value})}>{MAP_ICONS.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>}{!current.points&&<><NumberField name="X (%)" value={Math.round((current.x??.5)*100)} onChange={x=>modify({x:Math.max(0,Math.min(1,(x??50)/100))})}/><NumberField name="Y (%)" value={Math.round((current.y??.5)*100)} onChange={y=>modify({y:Math.max(0,Math.min(1,(y??50)/100))})}/>{!['tree','marker','compass','gate','icon','label'].includes(current.kind)&&<><NumberField name="Width (%)" value={Math.round((current.w??.1)*100)} onChange={w=>modify({w:Math.max(.01,Math.min(1,(w??10)/100))})}/><NumberField name="Height (%)" value={Math.round((current.h??.1)*100)} onChange={h=>modify({h:Math.max(.01,Math.min(1,(h??10)/100))})}/></>}</>}{['building','room','zone'].includes(current.kind)&&<label className="dz-field"><span>Fill colour</span><input type="color" value={current.fill||'#ffffff'} onChange={ev=>modify({fill:ev.target.value})}/></label>}<div className="dz-map-layer-actions"><button type="button" onClick={()=>{setDraft(d=>({...d,items:d.items.filter(it=>it.id!==selected)}));setSelected('');}}>Delete</button><button type="button" onClick={()=>{const copy={...current,id:crypto.randomUUID(),x:(current.x??.5)+.04,y:(current.y??.5)+.04,points:current.points?.map(pt=>({x:Math.min(1,pt.x+.04),y:Math.min(1,pt.y+.04)}))};setDraft(d=>({...d,items:[...d.items,copy]}));setSelected(copy.id);}}>Duplicate</button></div></>:<p>Select an object on the map to edit its label, size and position.</p>}<div className="dz-map-layers">{draft.items.map(it=><button type="button" key={it.id} className={selected===it.id?'on':''} onClick={()=>{setSelected(it.id);setTool('select');}}>{it.label||labelOf(it.kind)}</button>)}</div></div></div>
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={save}>Save map</button></footer>
  </div></div>;
}
