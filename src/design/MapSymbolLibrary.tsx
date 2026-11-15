import { useEffect, useId, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { MAP_SYMBOL_CATEGORIES, MAP_SYMBOL_DRAG_TYPE, MAP_SYMBOLS, mapSymbolGlyph, type MapSymbolCategory } from './mapSymbols';
import './mapSymbols.css';

const FAVOURITES_KEY='elt-map-symbol-favourites';
const RECENT_KEY='elt-map-symbol-recent';
type Category=MapSymbolCategory|'all'|'favourites'|'recent';

function savedKeys(key:string):string[]{
  try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter((x):x is string=>typeof x==='string'):[];}catch{return [];}
}
function normalize(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}

export function MapSymbolIcon({symbolKey,size=34}:{symbolKey:string;size?:number}){
  const glyph=mapSymbolGlyph(symbolKey);
  return <svg width={size} height={size} viewBox={`0 0 ${glyph.viewBox||48} ${glyph.viewBox||48}`} fill="none" stroke="currentColor" strokeWidth={glyph.viewBox===24?2:2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {glyph.paths.map((path,i)=><path key={i} d={path}/>)}
    {glyph.text&&<text x="24" y="25" fill="currentColor" stroke="none" textAnchor="middle" dominantBaseline="middle" fontSize={glyph.text.length>1?11:25} fontWeight="800">{glyph.text}</text>}
  </svg>;
}

export default function MapSymbolLibrary({selectedKey,onSelect,disabled=false,draggable=true}:{selectedKey?:string;onSelect:(key:string)=>void;disabled?:boolean;draggable?:boolean}){
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState<Category>('all');
  const [categoriesOpen,setCategoriesOpen]=useState(false);
  const categoriesId=useId();
  const [favourites,setFavourites]=useState<string[]>(()=>savedKeys(FAVOURITES_KEY));
  const [recent,setRecent]=useState<string[]>(()=>savedKeys(RECENT_KEY));
  useEffect(()=>{try{localStorage.setItem(FAVOURITES_KEY,JSON.stringify(favourites));}catch{/* Storage can be unavailable in a private window. */}},[favourites]);
  useEffect(()=>{try{localStorage.setItem(RECENT_KEY,JSON.stringify(recent));}catch{/* The library still works without saved history. */}},[recent]);
  const remember=(key:string)=>setRecent(current=>[key,...current.filter(x=>x!==key)].slice(0,10));
  const toggleFavourite=(key:string)=>setFavourites(current=>current.includes(key)?current.filter(x=>x!==key):[...current,key]);
  const matches=useMemo(()=>{
    const term=normalize(query);
    const found=MAP_SYMBOLS.filter(symbol=>(!term||normalize(`${symbol.name} ${symbol.key} ${symbol.category}`).includes(term))&&(
      category==='all'||category==='favourites'&&favourites.includes(symbol.key)||category==='recent'&&recent.includes(symbol.key)||symbol.category===category
    ));
    if(category==='recent')found.sort((a,b)=>recent.indexOf(a.key)-recent.indexOf(b.key));
    if(category==='favourites')found.sort((a,b)=>favourites.indexOf(a.key)-favourites.indexOf(b.key));
    return found;
  },[query,category,favourites,recent]);
  const select=(key:string)=>{remember(key);onSelect(key);};
  const startDrag=(event:DragEvent<HTMLButtonElement>,key:string)=>{
    if(disabled||!draggable){event.preventDefault();return;}
    event.dataTransfer.effectAllowed='copy';
    event.dataTransfer.setData(MAP_SYMBOL_DRAG_TYPE,key);
    event.dataTransfer.setData('text/plain',key);
    remember(key);
  };
  return <div className="dz-symbol-library">
    <label className="dz-symbol-search"><span className="dz-symbol-search-icon" aria-hidden="true">⌕</span><input type="search" value={query} onChange={event=>{setQuery(event.target.value);if(event.target.value.trim())setCategory('all');}} placeholder="Find a symbol" aria-label="Search map symbols"/></label>
    <div className="dz-symbol-browse" role="group" aria-label="Browse map symbols">
      {([['all','All'],['recent','Recent'],['favourites','Favourites']] as [Category,string][]).map(([key,name])=><button type="button" key={key} aria-pressed={category===key} className={category===key?'is-active':''} onClick={()=>{setCategory(key);setCategoriesOpen(false);}}>{name}</button>)}
      <button type="button" className={`dz-symbol-browse-toggle${MAP_SYMBOL_CATEGORIES.some(group=>group.key===category)?' is-active':''}`} aria-expanded={categoriesOpen} aria-controls={categoriesId} onClick={()=>setCategoriesOpen(open=>!open)}>{MAP_SYMBOL_CATEGORIES.find(group=>group.key===category)?.name||'Categories'} <span aria-hidden="true">⌄</span></button>
    </div>
    {categoriesOpen&&<div id={categoriesId} className="dz-symbol-categories" role="group" aria-label="Symbol categories">
      {MAP_SYMBOL_CATEGORIES.map(group=><button type="button" key={group.key} aria-pressed={category===group.key} className={category===group.key?'is-active':''} onClick={()=>{setCategory(group.key);setCategoriesOpen(false);}}>{group.name}</button>)}
    </div>}
    <div className="dz-symbol-results" role="group" aria-label="Map symbols">
      {matches.map(symbol=>{
        const group=MAP_SYMBOL_CATEGORIES.find(item=>item.key===symbol.category);
        return <div className="dz-symbol-tile" key={symbol.key} style={{'--symbol-accent':group?.colour||'#758793'} as CSSProperties}>
          <button type="button" className={`dz-symbol-choice${selectedKey===symbol.key?' is-selected':''}`} onClick={()=>select(symbol.key)} onDragStart={event=>startDrag(event,symbol.key)} draggable={!disabled&&draggable} disabled={disabled} aria-pressed={selectedKey===symbol.key} aria-label={`${symbol.name}${draggable?', drag onto map or click to select':''}`}>
            <span className="dz-symbol-art"><MapSymbolIcon symbolKey={symbol.key}/></span><span className="dz-symbol-name">{symbol.name}</span>
          </button>
          <button type="button" className={`dz-symbol-star${favourites.includes(symbol.key)?' is-favourite':''}`} onClick={()=>toggleFavourite(symbol.key)} aria-label={`${favourites.includes(symbol.key)?'Remove':'Add'} ${symbol.name} ${favourites.includes(symbol.key)?'from':'to'} favourites`} aria-pressed={favourites.includes(symbol.key)} title={favourites.includes(symbol.key)?'Remove from favourites':'Add to favourites'}>{favourites.includes(symbol.key)?'★':'☆'}</button>
        </div>;
      })}
      {matches.length===0&&<p className="dz-symbol-empty">{category==='recent'&&!query?'Symbols you use will appear here.':category==='favourites'&&!query?'Save symbols here for quick access.':'No symbols found. Try another word or category.'}</p>}
    </div>
    <p className="dz-symbol-count">{matches.length} {matches.length===1?'symbol':'symbols'}</p>
  </div>;
}
