import { useEffect, useRef, useState } from 'react';
import type { Ctx } from './Editor';
import { CHART_PRESETS, CHART_COMBINATIONS, MAP_PRESETS, MAP_COMPARISONS, blankChart, blankMap, cloneFigure, makeMapItem, type FigurePreset } from './figureTemplates';
import { drawFigure, MAP_ICONS, type Figure, type MapFigure } from './figures';
import { storePicture } from './model';
import './figures.css';

function Preview({ figure }: { figure: Figure }) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const canvas=ref.current;if(!canvas)return;const g=canvas.getContext('2d');if(!g)return;g.clearRect(0,0,400,300);const ratio=figure.kind==='chart'?800/560:1000/720;const h=400/ratio;drawFigure(g,figure,400,h);},[figure]);
  return <canvas ref={ref} width={400} height={300} aria-hidden="true" />;
}
export function FigureDrawer({cx}:{cx:Ctx}){
  const [tab,setTab]=useState<'charts'|'maps'|'symbols'>('charts');
  const [query,setQuery]=useState('');
  const [importing,setImporting]=useState(false);
  const [error,setError]=useState('');
  const file=useRef<HTMLInputElement>(null);
  const add=(figure:Figure)=>{
    const w=Math.max(200,Math.min(cx.page.w-72,figure.kind==='chart'?720:800));
    const h=Math.round(w*(figure.kind==='chart'?560/800:720/1000));
    cx.add([{t:'figure',figure:cloneFigure(figure),name:figure.kind==='chart'?'Chart':'Map',...cx.spot(w,h)}]);
  };
  const addSymbol=(key:string,name:string)=>{
    const existing=cx.sel.length===1&&cx.sel[0].t==='figure'&&cx.sel[0].figure?.kind==='map'?cx.sel[0]:null;
    const figure:MapFigure=existing?cloneFigure(existing.figure!) as MapFigure:blankMap();
    figure.items.push(makeMapItem(key==='tree'?'tree':key==='gate'?'gate':key==='bridge'?'bridge':'icon',.5,.5,key));
    figure.items[figure.items.length-1].label=name;
    if(existing)cx.patch({[existing.id]:{figure}},'map-symbol');else add(figure);
  };
  const importMap=async(picture?:File)=>{if(!picture)return;setImporting(true);setError('');try{if(!picture.type.startsWith('image/'))throw new Error('Choose a picture of the map.');const {id}=await storePicture(cx.d.id,picture);const f=blankMap();f.title=picture.name.replace(/\.[^.]+$/,'');f.backgroundImage=id;add(f);}catch(err){setError(err instanceof Error?err.message:'Could not import this map.');}finally{setImporting(false);if(file.current)file.current.value='';}};
  const addPair=(pair:typeof MAP_COMPARISONS[number])=>void cx.addPages({k:pair.id,name:pair.name,about:'Two editable maps on one print-ready page',pages:[{p:{w:1123,h:1587,bg:'#ffffff'},els:[{t:'figure',figure:cloneFigure(pair.now),name:'Now',x:61,y:46,w:1000,h:720},{t:'figure',figure:cloneFigure(pair.after),name:'After',x:61,y:820,w:1000,h:720}]}]});
  const addCombination=(pair:typeof CHART_COMBINATIONS[number])=>void cx.addPages({k:pair.id,name:pair.name,about:pair.about,pages:[{p:{w:1123,h:1587,bg:'#ffffff'},els:[{t:'figure',figure:cloneFigure(pair.top),name:pair.top.title,x:61,y:45,w:1000,h:700},{t:'figure',figure:cloneFigure(pair.bottom),name:pair.bottom.title,x:61,y:825,w:1000,h:700}]}]});
  const preset=(v:FigurePreset)=><button key={v.id} type="button" className="dz-figure-preset" onClick={()=>add(v.figure)} disabled={!cx.canEdit} aria-label={`Add ${v.name}`}>
    <span className="dz-figure-preview"><Preview figure={v.figure}/></span><span className="dz-figure-preset-copy"><strong>{v.name}</strong><small>{v.about}</small></span><span className="dz-figure-plus" aria-hidden="true">+</span>
  </button>;
  return <div className="dz-figure-drawer">
    <p className="dz-dr-note">Build an editable visual here, then place it in a Classes task. Questions and answers are added in Classes.</p>
    <div className="dz-figure-tabs" role="tablist" aria-label="Figure tools">
      {([['charts','Charts'],['maps','Maps'],['symbols','Map symbols']] as const).map(([k,n])=><button key={k} role="tab" type="button" aria-selected={tab===k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{n}</button>)}
    </div>
    {tab==='charts'&&<><button type="button" className="dz-figure-new" onClick={()=>add(blankChart())} disabled={!cx.canEdit}>+ Start a blank chart</button><p className="dz-figure-sub">Choose a layout, then edit the title, data, axes, series and colours.</p><h3 className="dz-dr-h">Chart collections</h3>{CHART_COMBINATIONS.map(pair=><button type="button" key={pair.id} className="dz-figure-new" onClick={()=>addCombination(pair)} disabled={!cx.canEdit}><strong>+ {pair.name}</strong><small>{pair.about}</small></button>)}<h3 className="dz-dr-h">Single charts</h3><div className="dz-figure-preset-list">{CHART_PRESETS.map(preset)}</div></>}
    {tab==='maps'&&<><button type="button" className="dz-figure-new" onClick={()=>add(blankMap())} disabled={!cx.canEdit}>+ Start a blank map</button><button type="button" className="dz-figure-new" onClick={()=>file.current?.click()} disabled={!cx.canEdit||importing}>{importing?'Importing map…':'↑ Import a map image'}</button><input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e=>void importMap(e.target.files?.[0])}/>{error&&<p role="alert" className="dz-map-error">{error}</p>}<p className="dz-figure-sub">Start with a place or import a plan, then add movable roads, labels and landmarks.</p><h3 className="dz-dr-h">Before and after</h3>{MAP_COMPARISONS.map(pair=><button type="button" key={pair.id} className="dz-figure-new" onClick={()=>addPair(pair)} disabled={!cx.canEdit}>+ {pair.name}</button>)}<h3 className="dz-dr-h">Single maps</h3><div className="dz-figure-preset-list">{MAP_PRESETS.map(preset)}</div></>}
    {tab==='symbols'&&<><p className="dz-figure-sub">Choose a symbol to add to the selected map. A new map is made if none is selected.</p><input className="dz-figure-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search more than 100 map symbols" aria-label="Search map symbols"/><div className="dz-figure-symbols">{MAP_ICONS.filter(([key,name])=>`${key} ${name}`.toLowerCase().includes(query.toLowerCase())).map(([key,name])=><button type="button" key={key} onClick={()=>addSymbol(key,name)} disabled={!cx.canEdit}><span aria-hidden="true">{key==='tree'?'♣':key==='parking'?'P':key==='atm'?'$':key==='information'?'i':'◇'}</span>{name}</button>)}</div></>}
  </div>;
}
