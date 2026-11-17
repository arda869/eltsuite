// Native, editable figures. The same canvas renderer is used by the editor,
// image/PDF downloads and the design picker in Classes.
import { mapSymbolGlyph } from './mapSymbols';
export { MAP_ICONS } from './mapSymbols';
export type ChartKind = 'bars' | 'lines' | 'pie' | 'table';
export type Series = { name: string; values: number[]; color: string; dashed?: boolean };
export type ChartFigure = {
  kind: 'chart'; chart: ChartKind; title: string; categories: string[]; series: Series[];
  palette?: string[]; // shared category colours across all pies
  horizontal?: boolean; min?: number; max?: number; step?: number; unit?: string;
  xLabel?: string; yLabel?: string; footnote?: string; showValues?: boolean;
};
export type Point = { x: number; y: number };
export type MapItemKind = 'road' | 'river' | 'footpath' | 'wall' | 'fence' | 'zone' | 'building' | 'room' | 'water' | 'roundabout' | 'tree' | 'gate' | 'bridge' | 'compass' | 'icon' | 'marker' | 'label';
export type MapItem = {
  id: string; kind: MapItemKind; x?: number; y?: number; w?: number; h?: number;
  points?: Point[]; label?: string; icon?: string; fill?: string; dashed?: boolean; rotation?: number; hidden?: boolean; locked?: boolean;
  groupId?: string; iconStyle?: 'plain' | 'shaded'; iconColor?: string;
};
export type MapFigure = { kind: 'map'; title: string; items: MapItem[]; ink?: string; paper?: string; showBorder?: boolean; backgroundImage?: string; backgroundOpacity?: number; backgroundFit?: 'contain'|'cover'; backgroundOffsetX?: number; backgroundOffsetY?: number; backgroundLocked?: boolean };
export type Figure = ChartFigure | MapFigure;

export const CHART_PALETTE = ['#443a40', '#9b86b5', '#6e9aa0', '#d69b68', '#b9c0ad', '#c76d6d'];
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const fmt = (v: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(v);
// Tables show entered values, including the hundredths used in exam data.
// Axis ticks stay at their simpler one-decimal precision.
const fmtTable = (v: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 9 }).format(v);
const darkText = (hex: string) => { const n=parseInt(hex.slice(1),16);const r=(n>>16)&255,g=(n>>8)&255,b=n&255;return (r*299+g*587+b*114)/1000>150; };
const ink = '#302e31';
const grid = '#ddd9de';
const font = 'Karla, Arial, sans-serif';
function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, size = 17, align: CanvasTextAlign = 'left', weight = 400, color = ink) {
  g.fillStyle = color; g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
}
function line(g: CanvasRenderingContext2D, points: Point[], color = ink, width = 2, dashed = false) {
  if (points.length < 2) return;
  g.beginPath(); g.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(p => g.lineTo(p.x,p.y));
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.setLineDash(dashed ? [9,7] : []); g.stroke(); g.setLineDash([]);
}
function wrapped(g: CanvasRenderingContext2D, s: string, x: number, y: number, width: number, size = 16, align: CanvasTextAlign = 'center') {
  g.font = `400 ${size}px ${font}`;
  const words = s.split(' '); let row = ''; const rows: string[] = [];
  for (const word of words) { const next = row ? `${row} ${word}` : word; if (row && g.measureText(next).width > width) { rows.push(row); row = word; } else row = next; }
  if (row) rows.push(row);
  rows.slice(0, 3).forEach((r,i) => label(g,r,x,y+i*(size+3),size,align));
}
function chartFrame(g: CanvasRenderingContext2D, f: ChartFigure) {
  g.fillStyle = '#fff'; g.fillRect(0,0,800,560);
  const title = (f.title || 'Chart title').trim();
  let size = 25;
  let rows: string[] = [];
  // Leave clear margins around long titles from imported worksheets. Keep every
  // word visible, including when a teacher enters the original exam heading.
  for (const candidate of [25, 23, 21, 19, 17]) {
    g.font = `700 ${candidate}px ${font}`;
    const next: string[] = [];
    let row = '';
    for (const word of title.split(/\s+/)) {
      const joined = row ? `${row} ${word}` : word;
      if (row && g.measureText(joined).width > 736) { next.push(row); row = word; }
      else row = joined;
    }
    if (row) next.push(row);
    size = candidate; rows = next;
    if (rows.length <= 2) break;
  }
  rows.forEach((row, index) => label(g,row,400,rows.length === 1 ? 38 : 26 + index * 27,size,'center',700));
  if (f.footnote) label(g,f.footnote,32,536,13,'left',400,'#69636a');
}
type LegendEntry = {name:string;color:string};
function legendRows(g: CanvasRenderingContext2D, entries: LegendEntry[], size: number) {
  const available = 752, gap = 14, swatch = 16, textOffset = 23;
  g.font = `400 ${size}px ${font}`;
  const widths = entries.map(e => Math.min(available, Math.ceil(g.measureText(e.name).width) + textOffset + 8));
  const rows: number[][] = [[]];
  for (let i=0;i<entries.length;i++) {
    const row = rows[rows.length-1];
    const used = row.reduce((total,j) => total + widths[j] + gap, -gap);
    if (row.length && used + gap + widths[i] > available) rows.push([]);
    rows[rows.length-1].push(i);
  }
  return { rows, widths, gap, textOffset, swatch };
}
function legendStart(g: CanvasRenderingContext2D, f: ChartFigure, entries: LegendEntry[], preferred: number, size: number) {
  const rowCount=legendRows(g,entries,size).rows.length;
  // Leave the bottom line for a footnote. The chart plot moves up with a longer
  // legend, so custom series names remain readable in print and downloads.
  return Math.min(preferred,(f.footnote?514:548)-(rowCount-1)*22);
}
function chartLegend(g: CanvasRenderingContext2D, f: ChartFigure, y: number) {
  if (f.series.length < 2) return;
  drawLegendRows(g, f.series.map(s => ({ name:s.name, color:s.color })), y, 14);
}
function drawLegendRows(g: CanvasRenderingContext2D, entries: LegendEntry[], startY: number, size: number) {
  const {rows,widths,gap,textOffset,swatch}=legendRows(g,entries,size);
  rows.forEach((row,ri) => {
    const rowWidth = row.reduce((total,i) => total + widths[i] + gap, -gap);
    let x = (800-rowWidth)/2;
    row.forEach(i => {
      const entry=entries[i];
      g.fillStyle=entry.color;
      g.fillRect(x,startY+ri*22-7,swatch,14);
      g.fillStyle=ink;
      g.font=`400 ${size}px ${font}`;
      g.textAlign='left';g.textBaseline='middle';
      g.fillText(entry.name,x+textOffset,startY+ri*22,widths[i]-textOffset-4);
      x+=widths[i]+gap;
    });
  });
}
function chartAxis(g: CanvasRenderingContext2D, f: ChartFigure, horizontal: boolean, legendY = 505) {
  const cats=f.categories; const series=f.series; const all=series.flatMap(s=>s.values).filter(Number.isFinite);
  const rawMin=Math.min(0,...all); const rawMax=Math.max(1,...all);
  const lo=Number.isFinite(f.min) ? f.min! : Math.min(0,rawMin);
  const hi=Number.isFinite(f.max) && f.max!>lo ? f.max! : Math.ceil(rawMax/(f.step||10))*(f.step||10);
  const step=f.step&&f.step>0?f.step:(hi-lo)/5;
  const plot=horizontal?{x:245,y:90,w:480,h:Math.min(370,cats.length*44)}:{x:100,y:94,w:620,h:350};
  if(legendY<505||f.xLabel)plot.h=Math.min(plot.h,Math.max(145,legendY-plot.y-(f.xLabel?80:76)));
  const scale=(v:number)=>clamp((v-lo)/(hi-lo));
  const ticks=Math.min(12,Math.max(1,Math.ceil((hi-lo)/step)));
  for(let t=0;t<=ticks;t++) {
    const v=Math.min(hi,lo+t*step);
    if(horizontal) {const x=plot.x+plot.w*scale(v); line(g,[{x,y:plot.y},{x,y:plot.y+plot.h}],grid,1); label(g,fmt(v)+(f.unit||''),x,plot.y+plot.h+23,14,'center');}
    else {const y=plot.y+plot.h-plot.h*scale(v); line(g,[{x:plot.x,y},{x:plot.x+plot.w,y}],grid,1); label(g,fmt(v)+(f.unit||''),plot.x-14,y,14,'right');}
  }
  if(horizontal) {
    line(g,[{x:plot.x,y:plot.y},{x:plot.x,y:plot.y+plot.h}],ink,2);
    cats.forEach((c,i)=>wrapped(g,c,plot.x-18,plot.y+(i+.5)*plot.h/cats.length-8,190,15,'right'));
  } else {
    line(g,[{x:plot.x,y:plot.y+plot.h},{x:plot.x+plot.w,y:plot.y+plot.h}],ink,2);
    cats.forEach((c,i)=>wrapped(g,c,plot.x+(i+.5)*plot.w/cats.length,plot.y+plot.h+24,plot.w/cats.length-8,15));
  }
  if(f.xLabel) label(g,f.xLabel,plot.x+plot.w/2,Math.min(legendY-27,plot.y+plot.h+53),16,'center',700);
  if(f.yLabel) {g.save();g.translate(23,plot.y+plot.h/2);g.rotate(-Math.PI/2);label(g,f.yLabel,0,0,16,'center',700);g.restore();}
  return {plot,scale};
}
function drawBars(g: CanvasRenderingContext2D, f: ChartFigure) {
  const horizontal=!!f.horizontal;
  const preferred=horizontal?Math.min(505,90+Math.min(370,f.categories.length*44)+66):505;
  const legendY=f.series.length>1?legendStart(g,f,f.series,preferred,14):preferred;
  const {plot,scale}=chartAxis(g,f,horizontal,legendY);
  const n=Math.max(1,f.categories.length), m=Math.max(1,f.series.length);
  const group=(horizontal?plot.h:plot.w)/n; const gap=Math.min(10,group*.12); const bw=(group-2*gap)/m;
  f.series.forEach((s,j)=>f.categories.forEach((_,i)=>{
    const v=Number(s.values[i])||0; const zero=scale(0);
    g.fillStyle=s.color||CHART_PALETTE[j%CHART_PALETTE.length];
    if(horizontal){const x=plot.x+plot.w*Math.min(zero,scale(v));const y=plot.y+i*group+gap+j*bw;const w=Math.max(1,Math.abs(scale(v)-zero)*plot.w);g.fillRect(x,y,w,Math.max(2,bw-2));if(f.showValues)label(g,fmt(v),x+w+5,y+bw/2,12);}
    else {const x=plot.x+i*group+gap+j*bw;const y=plot.y+plot.h-plot.h*Math.max(zero,scale(v));const h=Math.max(1,Math.abs(scale(v)-zero)*plot.h);g.fillRect(x,y,Math.max(2,bw-2),h);if(f.showValues)label(g,fmt(v),x+bw/2,y-8,12,'center');}
  }));
  chartLegend(g,f,legendY);
}
function drawLines(g: CanvasRenderingContext2D, f: ChartFigure) {
  const legendY=f.series.length>1?legendStart(g,f,f.series,505,14):505;
  const {plot,scale}=chartAxis(g,f,false,legendY); const n=Math.max(1,f.categories.length);
  f.series.forEach((s,j)=>{
    const pts=f.categories.map((_,i)=>({x:plot.x+(i+.5)*plot.w/n,y:plot.y+plot.h-plot.h*scale(Number(s.values[i])||0)}));
    line(g,pts,s.color||CHART_PALETTE[j%CHART_PALETTE.length],3,!!s.dashed);
    pts.forEach((p,i)=>{g.beginPath();g.arc(p.x,p.y,5,0,Math.PI*2);g.fillStyle='#fff';g.fill();g.strokeStyle=s.color;g.lineWidth=2.5;g.stroke();if(f.showValues)label(g,fmt(s.values[i]||0),p.x,p.y-13,12,'center');});
  });
  chartLegend(g,f,legendY);
}
function drawPie(g: CanvasRenderingContext2D, f: ChartFigure) {
  const cols=f.series.length===1?1:Math.min(3,f.series.length);
  const rows=Math.ceil(f.series.length/cols); const radius=Math.min(124,175/rows,320/cols);
  f.series.forEach((s,si)=>{
    const col=si%cols,row=Math.floor(si/cols),cx=400+(col-(cols-1)/2)*(cols===2?330:230),cy=105+row*(rows===1?0:220)+radius;
    const vals=f.categories.map((_,i)=>Math.max(0,Number(s.values[i])||0));const total=vals.reduce((a,b)=>a+b,0)||1;let a=-Math.PI/2;
    vals.forEach((v,i)=>{const next=a+v/total*Math.PI*2;const color=f.palette?.[i]||CHART_PALETTE[i%CHART_PALETTE.length];g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,radius,a,next);g.closePath();g.fillStyle=color;g.fill();g.strokeStyle='#fff';g.lineWidth=2;g.stroke();if(v/total>.045){const mid=(a+next)/2;label(g,`${Math.round(v/total*100)}%`,cx+Math.cos(mid)*radius*.66,cy+Math.sin(mid)*radius*.66,14,'center',700,darkText(color)?ink:'#fff');}a=next;});
    label(g,s.name,cx,cy+radius+21,17,'center',700);
  });
  const entries=f.categories.map((name,i)=>({name,color:f.palette?.[i]||CHART_PALETTE[i%CHART_PALETTE.length]}));
  drawLegendRows(g,entries,legendStart(g,f,entries,480,17),17);
}
function drawTable(g: CanvasRenderingContext2D, f: ChartFigure) {
  const columns=f.series.length+1;const rows=f.categories.length+1;const x=42,y=92,w=716,h=Math.min(404,rows*46);const rh=h/rows;const first=Math.min(280,w*.4),other=(w-first)/(columns-1||1);
  g.fillStyle='#f5f2f6';g.fillRect(x,y,w,rh);
  for(let i=0;i<=rows;i++)line(g,[{x,y:y+i*rh},{x:x+w,y:y+i*rh}],grid,i===0||i===rows?2:1);
  for(let i=0;i<=columns;i++){const xx=x+(i===0?0:i===1?first:first+(i-1)*other);line(g,[{x:xx,y},{x:xx,y:y+h}],grid,i===0||i===columns?2:1);}
  label(g,'',x+10,y+rh/2);f.series.forEach((s,j)=>wrapped(g,s.name,x+first+(j+.5)*other,y+rh/2-9,other-12,15));
  f.categories.forEach((c,i)=>{wrapped(g,c,x+12,y+(i+1)*rh+rh/2-8,first-20,15,'left');f.series.forEach((s,j)=>label(g,fmtTable(s.values[i]||0)+(f.unit||''),x+first+(j+.5)*other,y+(i+1.5)*rh,15,'center'));});
}
export function drawChart(g: CanvasRenderingContext2D, f: ChartFigure) {
  chartFrame(g,f);if(f.chart==='bars')drawBars(g,f);else if(f.chart==='lines')drawLines(g,f);else if(f.chart==='pie')drawPie(g,f);else drawTable(g,f);
}

function rounded(g:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r=8){g.beginPath();g.roundRect(x,y,w,h,Math.min(r,w/2,h/2));}
function icon(g:CanvasRenderingContext2D,key:string,x:number,y:number,s:number,color:string){
  const glyph=mapSymbolGlyph(key);
  const viewBox=glyph.viewBox||48;
  g.save();g.translate(x,y);g.scale(s/viewBox,s/viewBox);
  g.strokeStyle=color;g.fillStyle=color;g.lineWidth=viewBox===24?2:2.5;g.lineCap='round';g.lineJoin='round';
  for(const d of glyph.paths)g.stroke(new Path2D(d));
  if(glyph.text){g.font=`800 ${glyph.text.length>1?11:25}px ${font}`;g.textAlign='center';g.textBaseline='middle';g.fillText(glyph.text,24,25);}
  g.restore();
}
const mapBox={x:40,y:88,w:920,h:570};
function symbolColor(value:string|undefined,fallback:string){return value&&/^#[\da-f]{6}$/i.test(value)?value:fallback;}
function symbolTint(hex:string,alpha:number){const n=parseInt(hex.slice(1),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;}
export function drawMap(g:CanvasRenderingContext2D,f:MapFigure,background?:CanvasImageSource){
  g.fillStyle=f.paper||'#fff';g.fillRect(0,0,1000,720);label(g,f.title||'Map title',500,43,31,'center',700,f.ink||ink);
  const b=mapBox;const C=f.ink||ink;
  if(background){
    g.save();g.globalAlpha=f.backgroundOpacity??1;
    const source=background as {width?:number;height?:number;naturalWidth?:number;naturalHeight?:number};
    const sw=source.naturalWidth||source.width||b.w,sh=source.naturalHeight||source.height||b.h;
    const scale=(f.backgroundFit==='cover'?Math.max:Math.min)(b.w/sw,b.h/sh);
    const dw=sw*scale,dh=sh*scale;
    g.beginPath();g.rect(b.x,b.y,b.w,b.h);g.clip();
    const offsetX=clamp(f.backgroundOffsetX||0,-1,1),offsetY=clamp(f.backgroundOffsetY||0,-1,1);
    g.drawImage(background,b.x+(b.w-dw)/2+offsetX*Math.abs(b.w-dw)/2,b.y+(b.h-dh)/2+offsetY*Math.abs(b.h-dh)/2,dw,dh);g.restore();
  }
  if(f.showBorder!==false){g.strokeStyle='#bbb4bd';g.lineWidth=2;g.strokeRect(b.x,b.y,b.w,b.h);}
  const pos=(p:Point)=>({x:b.x+clamp(p.x)*b.w,y:b.y+clamp(p.y)*b.h});
  for(const item of f.items){
    if(item.hidden)continue;
    const x=b.x+clamp(item.x??.5)*b.w,y=b.y+clamp(item.y??.5)*b.h,w=clamp(item.w??.1,0,1)*b.w,h=clamp(item.h??.1,0,1)*b.h;
    if(item.points?.length){const pts=item.points.map(pos);const widths:{[k:string]:number}={road:31,river:39,footpath:8,wall:14,fence:4,bridge:22};const sw=widths[item.kind]||5;
      if(item.kind==='road'||item.kind==='river'||item.kind==='bridge')line(g,pts,item.kind==='river'?'#a6c6c9':item.kind==='bridge'?'#d5d0d3':'#d5d0d3',sw);
      line(g,pts,item.kind==='river'?'#5e9198':C,item.kind==='road'||item.kind==='river'?2:item.kind==='wall'?sw:3,item.kind==='footpath'||item.dashed);
      if(item.kind==='road')line(g,pts,'#fff',1,true);
      if(item.label){const a=pts[Math.floor((pts.length-1)/2)],c=pts[Math.ceil((pts.length-1)/2)];const q={x:(a.x+c.x)/2,y:(a.y+c.y)/2};g.font=`700 17px ${font}`;const tw=g.measureText(item.label).width;rounded(g,q.x-tw/2-9,q.y-32,tw+18,21,6);g.fillStyle='#ffffffed';g.fill();label(g,item.label,q.x,q.y-21,17,'center',700);}
      continue;
    }
    const symbolSize=Math.max(36,Math.min(140,Math.sqrt(w*h)));
    g.save();
    if(item.rotation){g.translate(x,y);g.rotate(item.rotation*Math.PI/180);g.translate(-x,-y);}
    if(item.kind==='water'){rounded(g,x-w/2,y-h/2,w,h,Math.min(w,h)*.35);g.fillStyle='#e1eff0';g.fill();g.strokeStyle='#5e9198';g.lineWidth=3;g.stroke();}
    else if(item.kind==='roundabout'){g.beginPath();g.arc(x,y,Math.min(w,h)/2,0,7);g.fillStyle='#f2f0f0';g.fill();g.strokeStyle=C;g.lineWidth=5;g.stroke();g.beginPath();g.arc(x,y,Math.min(w,h)*.27,0,7);g.stroke();}
    else if(['building','room','zone'].includes(item.kind)){rounded(g,x-w/2,y-h/2,w,h,item.kind==='zone'?12:2);g.fillStyle=item.fill|| (item.kind==='zone'?'#f1f0f3':'#fff');g.fill();g.strokeStyle=C;g.lineWidth=item.kind==='zone'?2:3;g.stroke();}
    else if(item.kind==='compass'){line(g,[{x,y:y-30},{x,y:y+30}],C,2);line(g,[{x:x-30,y},{x:x+30,y}],C,2);label(g,'N',x,y-42,15,'center',700);label(g,'S',x,y+43,15,'center',700);label(g,'W',x-42,y,15,'center',700);label(g,'E',x+42,y,15,'center',700);}
    else if(item.kind==='marker'){g.beginPath();g.arc(x,y,17,0,7);g.fillStyle='#fff';g.fill();g.strokeStyle=C;g.lineWidth=2;g.stroke();}
    else if(item.kind==='tree'){icon(g,'tree',x-symbolSize/2,y-symbolSize/2,symbolSize,'#56806e');}
    else if(item.kind==='gate'){line(g,[{x:x-22,y:y-14},{x:x-22,y:y+14}],C,3);line(g,[{x:x+22,y:y-14},{x:x+22,y:y+14}],C,3);}
    else if(item.kind==='icon'){
      const color=symbolColor(item.iconColor,C);
      if(item.iconStyle==='plain'){
        icon(g,item.icon||'information',x-symbolSize*.46,y-symbolSize*.46,symbolSize*.92,color);
      }else if(item.iconStyle==='shaded'){
        g.beginPath();g.arc(x,y,symbolSize*.55,0,7);g.fillStyle=symbolTint(color,.2);g.fill();g.strokeStyle=symbolTint(color,.55);g.lineWidth=2;g.stroke();
        icon(g,item.icon||'information',x-symbolSize*.4,y-symbolSize*.4,symbolSize*.8,color);
      }else{
        // Older maps keep their original outlined symbol treatment.
        g.beginPath();g.arc(x,y,symbolSize*.55,0,7);g.fillStyle='#fff';g.fill();g.strokeStyle='#bcb5be';g.lineWidth=2;g.stroke();
        icon(g,item.icon||'information',x-symbolSize*.4,y-symbolSize*.4,symbolSize*.8,color);
      }
    }
    g.restore();
    if(item.label){
      if(item.kind==='label'&&item.rotation){g.save();g.translate(x,y);g.rotate(item.rotation*Math.PI/180);g.translate(-x,-y);}
      label(g,item.label,x,item.kind==='marker'?y:y+(item.kind==='icon'?42:item.kind==='tree'?30:0),item.kind==='marker'?18:16,'center',item.kind==='marker'?700:500,C);
      if(item.kind==='label'&&item.rotation)g.restore();
    }
  }
}
export function drawFigure(g:CanvasRenderingContext2D,f:Figure,w:number,h:number,background?:CanvasImageSource){g.save();g.scale(w/(f.kind==='chart'?800:1000),h/(f.kind==='chart'?560:720));if(f.kind==='chart')drawChart(g,f);else drawMap(g,f,background);g.restore();}
