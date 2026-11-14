// Native, editable figures. The same canvas renderer is used by the editor,
// image/PDF downloads and the design picker in Classes.
export type ChartKind = 'bars' | 'lines' | 'pie' | 'table';
export type Series = { name: string; values: number[]; color: string; dashed?: boolean };
export type ChartFigure = {
  kind: 'chart'; chart: ChartKind; title: string; categories: string[]; series: Series[];
  horizontal?: boolean; min?: number; max?: number; step?: number; unit?: string;
  xLabel?: string; yLabel?: string; footnote?: string; showValues?: boolean;
};
export type Point = { x: number; y: number };
export type MapItemKind = 'road' | 'river' | 'footpath' | 'wall' | 'fence' | 'zone' | 'building' | 'room' | 'water' | 'roundabout' | 'tree' | 'gate' | 'bridge' | 'compass' | 'icon' | 'marker' | 'label';
export type MapItem = {
  id: string; kind: MapItemKind; x?: number; y?: number; w?: number; h?: number;
  points?: Point[]; label?: string; icon?: string; fill?: string; dashed?: boolean;
};
export type MapFigure = { kind: 'map'; title: string; items: MapItem[]; ink?: string; paper?: string; showBorder?: boolean; backgroundImage?: string; backgroundOpacity?: number };
export type Figure = ChartFigure | MapFigure;

export const CHART_PALETTE = ['#443a40', '#9b86b5', '#6e9aa0', '#d69b68', '#b9c0ad', '#c76d6d'];
export const MAP_ICONS = [
  ['tree','Tree'], ['café','Café'], ['toilets','Toilets'], ['parking','Car park'],
  ['playground','Playground'], ['school','School'], ['medical','Medical centre'],
  ['shop','Shop'], ['atm','ATM'], ['train','Sky train'], ['car','Car hire'],
  ['plane','Airport'], ['checkin','Check-in'], ['baggage','Bag drop'],
  ['tower','Tower'], ['castle','Castle'], ['museum','Museum'], ['factory','Factory'],
  ['house','Housing'], ['field','Sports field'], ['tennis','Tennis courts'],
  ['gym','Outdoor gym'], ['flower','Flowers'], ['pond','Pond'],
  ['bridge','Bridge'], ['gate','Gate'], ['bus','Bus stop'], ['information','Information'],
  ['sculpture','Sculpture'], ['food','Canteen'], ['office','Office'], ['reception','Reception'],
  ['restaurant','Restaurant'], ['picnic','Picnic area'], ['hotel','Hotel'], ['camping','Campsite'],
  ['warehouse','Warehouse'], ['bank','Bank'], ['post','Post office'], ['library','Library'],
  ['pharmacy','Pharmacy'], ['hospital','Hospital'], ['police','Police station'], ['fire','Fire station'],
  ['security','Security'], ['passport','Passport control'], ['customs','Customs'],
  ['arrival','Arrivals'], ['departure','Departures'], ['ticket','Tickets'], ['ferry','Ferry terminal'],
  ['rail','Rail station'], ['tram','Tram stop'], ['bike','Bicycle parking'], ['charging','EV charging'],
  ['petrol','Petrol station'], ['taxi','Taxi rank'], ['walkway','Walkway'], ['stairs','Stairs'],
  ['lift','Lift'], ['accessible','Accessible entrance'], ['entrance','Entrance'], ['exit','Exit'],
  ['emergency','Emergency exit'], ['firstaid','First aid'], ['drinking','Drinking water'],
  ['garden','Garden'], ['forest','Forest'], ['lake','Lake'], ['river','River'], ['beach','Beach'],
  ['mountain','Mountain'], ['waterfall','Waterfall'], ['fountain','Fountain'], ['bench','Bench'],
  ['bin','Rubbish bin'], ['notice','Notice board'], ['viewpoint','Viewpoint'], ['maze','Maze'],
  ['skate','Skateboard ramp'], ['cricket','Cricket pitch'], ['football','Football pitch'],
  ['basketball','Basketball court'], ['pool','Swimming pool'], ['stadium','Stadium'],
  ['zoo','Zoo'], ['aquarium','Aquarium'], ['cinema','Cinema'], ['theatre','Theatre'],
  ['gallery','Gallery'], ['temple','Temple'], ['church','Church'], ['monument','Monument'],
  ['exhibit','Exhibition'], ['meeting','Meeting room'], ['boardroom','Boardroom'],
  ['coffee','Coffee room'], ['classroom','Classroom'], ['lab','Laboratory'],
  ['courtyard','Courtyard'], ['roundabout','Roundabout'], ['north','North arrow'],
] as const;

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const fmt = (v: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(v);
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
  label(g,f.title || 'Chart title',400,38,25,'center',700);
  if (f.footnote) label(g,f.footnote,32,536,13,'left',400,'#69636a');
}
function chartLegend(g: CanvasRenderingContext2D, f: ChartFigure, y = 496) {
  if (f.series.length < 2) return;
  const entries = f.series.map(s => ({...s, width: Math.min(220, g.measureText(s.name).width + 48)}));
  const total = entries.reduce((a,s) => a+s.width+16, -16);
  let x = Math.max(24,(800-total)/2);
  entries.forEach(s => { g.fillStyle=s.color; g.fillRect(x,y-7,16,14); label(g,s.name,x+23,y,15); x += s.width+16; });
}
function chartAxis(g: CanvasRenderingContext2D, f: ChartFigure, horizontal: boolean) {
  const cats=f.categories; const series=f.series; const all=series.flatMap(s=>s.values).filter(Number.isFinite);
  const rawMin=Math.min(0,...all); const rawMax=Math.max(1,...all);
  const lo=Number.isFinite(f.min) ? f.min! : Math.min(0,rawMin);
  const hi=Number.isFinite(f.max) && f.max!>lo ? f.max! : Math.ceil(rawMax/(f.step||10))*(f.step||10);
  const step=f.step&&f.step>0?f.step:(hi-lo)/5;
  const plot=horizontal?{x:245,y:90,w:480,h:Math.min(370,cats.length*44)}:{x:100,y:94,w:620,h:350};
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
  if(f.xLabel) label(g,f.xLabel,plot.x+plot.w/2,477,16,'center',700);
  if(f.yLabel) {g.save();g.translate(23,plot.y+plot.h/2);g.rotate(-Math.PI/2);label(g,f.yLabel,0,0,16,'center',700);g.restore();}
  return {plot,scale};
}
function drawBars(g: CanvasRenderingContext2D, f: ChartFigure) {
  const horizontal=!!f.horizontal; const {plot,scale}=chartAxis(g,f,horizontal);
  const n=Math.max(1,f.categories.length), m=Math.max(1,f.series.length);
  const group=(horizontal?plot.h:plot.w)/n; const gap=Math.min(10,group*.12); const bw=(group-2*gap)/m;
  f.series.forEach((s,j)=>f.categories.forEach((_,i)=>{
    const v=Number(s.values[i])||0; const zero=scale(0);
    g.fillStyle=s.color||CHART_PALETTE[j%CHART_PALETTE.length];
    if(horizontal){const x=plot.x+plot.w*Math.min(zero,scale(v));const y=plot.y+i*group+gap+j*bw;const w=Math.max(1,Math.abs(scale(v)-zero)*plot.w);g.fillRect(x,y,w,Math.max(2,bw-2));if(f.showValues)label(g,fmt(v),x+w+5,y+bw/2,12);}
    else {const x=plot.x+i*group+gap+j*bw;const y=plot.y+plot.h-plot.h*Math.max(zero,scale(v));const h=Math.max(1,Math.abs(scale(v)-zero)*plot.h);g.fillRect(x,y,Math.max(2,bw-2),h);if(f.showValues)label(g,fmt(v),x+bw/2,y-8,12,'center');}
  }));
  chartLegend(g,f,horizontal?Math.min(505,plot.y+plot.h+66):505);
}
function drawLines(g: CanvasRenderingContext2D, f: ChartFigure) {
  const {plot,scale}=chartAxis(g,f,false); const n=Math.max(1,f.categories.length);
  f.series.forEach((s,j)=>{
    const pts=f.categories.map((_,i)=>({x:plot.x+(i+.5)*plot.w/n,y:plot.y+plot.h-plot.h*scale(Number(s.values[i])||0)}));
    line(g,pts,s.color||CHART_PALETTE[j%CHART_PALETTE.length],3,!!s.dashed);
    pts.forEach((p,i)=>{g.beginPath();g.arc(p.x,p.y,5,0,Math.PI*2);g.fillStyle='#fff';g.fill();g.strokeStyle=s.color;g.lineWidth=2.5;g.stroke();if(f.showValues)label(g,fmt(s.values[i]||0),p.x,p.y-13,12,'center');});
  });
  chartLegend(g,f,505);
}
function drawPie(g: CanvasRenderingContext2D, f: ChartFigure) {
  const cols=f.series.length===1?1:Math.min(3,f.series.length);
  const rows=Math.ceil(f.series.length/cols); const radius=Math.min(124,175/rows,320/cols);
  f.series.forEach((s,si)=>{
    const col=si%cols,row=Math.floor(si/cols),cx=400+(col-(cols-1)/2)*(cols===2?330:230),cy=105+row*(rows===1?0:220)+radius;
    const vals=f.categories.map((_,i)=>Math.max(0,Number(s.values[i])||0));const total=vals.reduce((a,b)=>a+b,0)||1;let a=-Math.PI/2;
    vals.forEach((v,i)=>{const next=a+v/total*Math.PI*2;const color=CHART_PALETTE[i%CHART_PALETTE.length];g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,radius,a,next);g.closePath();g.fillStyle=color;g.fill();g.strokeStyle='#fff';g.lineWidth=2;g.stroke();if(v/total>.045){const mid=(a+next)/2;label(g,`${Math.round(v/total*100)}%`,cx+Math.cos(mid)*radius*.66,cy+Math.sin(mid)*radius*.66,14,'center',700,darkText(color)?ink:'#fff');}a=next;});
    label(g,s.name,cx,cy+radius+21,17,'center',700);
  });
  let x=60,y=505;f.categories.forEach((c,i)=>{const width=Math.min(180,g.measureText(c).width+32);if(x+width>770){x=60;y+=23;}g.fillStyle=CHART_PALETTE[i%CHART_PALETTE.length];g.fillRect(x,y-7,13,13);label(g,c,x+19,y,13);x+=width+14;});
}
function drawTable(g: CanvasRenderingContext2D, f: ChartFigure) {
  const columns=f.series.length+1;const rows=f.categories.length+1;const x=42,y=92,w=716,h=Math.min(404,rows*46);const rh=h/rows;const first=Math.min(280,w*.4),other=(w-first)/(columns-1||1);
  g.fillStyle='#f5f2f6';g.fillRect(x,y,w,rh);
  for(let i=0;i<=rows;i++)line(g,[{x,y:y+i*rh},{x:x+w,y:y+i*rh}],grid,i===0||i===rows?2:1);
  for(let i=0;i<=columns;i++){const xx=x+(i===0?0:i===1?first:first+(i-1)*other);line(g,[{x:xx,y},{x:xx,y:y+h}],grid,i===0||i===columns?2:1);}
  label(g,'',x+10,y+rh/2);f.series.forEach((s,j)=>wrapped(g,s.name,x+first+(j+.5)*other,y+rh/2-9,other-12,15));
  f.categories.forEach((c,i)=>{wrapped(g,c,x+12,y+(i+1)*rh+rh/2-8,first-20,15,'left');f.series.forEach((s,j)=>label(g,fmt(s.values[i]||0)+(f.unit||''),x+first+(j+.5)*other,y+(i+1.5)*rh,15,'center'));});
}
export function drawChart(g: CanvasRenderingContext2D, f: ChartFigure) {
  chartFrame(g,f);if(f.chart==='bars')drawBars(g,f);else if(f.chart==='lines')drawLines(g,f);else if(f.chart==='pie')drawPie(g,f);else drawTable(g,f);
}

function rounded(g:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r=8){g.beginPath();g.roundRect(x,y,w,h,Math.min(r,w/2,h/2));}
function icon(g:CanvasRenderingContext2D,key:string,x:number,y:number,s:number,color:string){
  const aliases:Record<string,string>={restaurant:'café',picnic:'food',hotel:'house',camping:'house',warehouse:'factory',bank:'atm',post:'office',library:'school',pharmacy:'medical',hospital:'medical',police:'office',fire:'office',security:'gate',passport:'gate',customs:'gate',arrival:'plane',departure:'plane',ticket:'information',ferry:'bus',rail:'train',tram:'train',bike:'car',charging:'car',petrol:'car',taxi:'car',walkway:'bridge',stairs:'bridge',lift:'train',accessible:'information',entrance:'gate',exit:'gate',emergency:'gate',firstaid:'medical',drinking:'pond',garden:'flower',forest:'tree',lake:'pond',river:'pond',beach:'pond',mountain:'sculpture',waterfall:'pond',fountain:'pond',bench:'information',bin:'information',notice:'information',viewpoint:'information',maze:'playground',skate:'playground',cricket:'field',football:'field',basketball:'tennis',pool:'pond',stadium:'field',zoo:'tree',aquarium:'pond',cinema:'museum',theatre:'museum',gallery:'museum',temple:'castle',church:'castle',monument:'tower',exhibit:'museum',meeting:'office',boardroom:'office',coffee:'café',classroom:'school',lab:'school',courtyard:'house',roundabout:'parking',north:'information'};
  key=aliases[key]||key;
  g.save();g.translate(x,y);g.scale(s/48,s/48);g.strokeStyle=color;g.fillStyle=color;g.lineWidth=2.5;g.lineCap='round';g.lineJoin='round';
  const path=(d:(p:CanvasRenderingContext2D)=>void)=>{g.beginPath();d(g);g.stroke();};
  switch(key){
    case 'tree':path(p=>{p.arc(17,20,8,0,7);p.arc(28,16,10,0,7);p.arc(33,25,8,0,7);p.moveTo(24,29);p.lineTo(24,44);p.moveTo(18,44);p.lineTo(30,44)});break;
    case 'café':case 'food':path(p=>{p.moveTo(8,19);p.lineTo(36,19);p.lineTo(33,34);p.lineTo(13,34);p.closePath();p.moveTo(36,22);p.quadraticCurveTo(47,20,42,28);p.lineTo(35,29);p.moveTo(10,39);p.lineTo(37,39)});break;
    case 'toilets':path(p=>{p.arc(16,11,4,0,7);p.arc(33,11,4,0,7);p.moveTo(16,17);p.lineTo(16,38);p.moveTo(8,27);p.lineTo(24,27);p.moveTo(33,17);p.lineTo(33,38);p.moveTo(26,29);p.lineTo(40,29)});break;
    case 'parking':case 'information':label(g,key==='parking'?'P':'i',24,25,34,'center',700,color);break;
    case 'atm':label(g,'$',24,25,35,'center',700,color);break;
    case 'playground':path(p=>{p.moveTo(8,38);p.lineTo(16,11);p.lineTo(33,11);p.lineTo(41,38);p.moveTo(16,11);p.lineTo(16,29);p.moveTo(33,11);p.lineTo(33,29);p.moveTo(15,29);p.quadraticCurveTo(24,37,34,29)});break;
    case 'school':case 'museum':case 'factory':case 'house':case 'office':case 'reception':case 'castle':path(p=>{p.moveTo(7,22);p.lineTo(24,9);p.lineTo(41,22);p.moveTo(10,21);p.lineTo(10,40);p.lineTo(38,40);p.lineTo(38,21);p.moveTo(20,40);p.lineTo(20,28);p.lineTo(28,28);p.lineTo(28,40)});break;
    case 'medical':path(p=>{p.moveTo(24,8);p.lineTo(24,40);p.moveTo(8,24);p.lineTo(40,24)});break;
    case 'shop':path(p=>{p.moveTo(8,17);p.lineTo(40,17);p.lineTo(37,25);p.lineTo(11,25);p.closePath();p.moveTo(12,25);p.lineTo(12,40);p.lineTo(36,40);p.lineTo(36,25);p.moveTo(21,40);p.lineTo(21,31)});break;
    case 'train':case 'bus':case 'car':path(p=>{p.moveTo(9,14);p.lineTo(39,14);p.lineTo(39,35);p.lineTo(9,35);p.closePath();p.moveTo(14,21);p.lineTo(34,21);p.moveTo(15,40);p.lineTo(12,44);p.moveTo(33,40);p.lineTo(36,44)});break;
    case 'plane':path(p=>{p.moveTo(24,5);p.lineTo(27,25);p.lineTo(42,32);p.lineTo(42,37);p.lineTo(26,33);p.lineTo(25,42);p.lineTo(23,42);p.lineTo(22,33);p.lineTo(6,37);p.lineTo(6,32);p.lineTo(21,25);p.closePath()});break;
    case 'tower':path(p=>{p.moveTo(15,42);p.lineTo(18,11);p.lineTo(30,11);p.lineTo(33,42);p.closePath();p.moveTo(12,11);p.lineTo(36,11);p.moveTo(20,20);p.lineTo(28,20)});break;
    case 'field':case 'tennis':path(p=>{p.rect(6,10,36,28);p.moveTo(24,10);p.lineTo(24,38);p.arc(24,24,6,0,7)});break;
    case 'gym':case 'sculpture':path(p=>{p.arc(24,11,5,0,7);p.moveTo(24,16);p.lineTo(24,31);p.moveTo(11,22);p.lineTo(37,22);p.moveTo(24,31);p.lineTo(15,43);p.moveTo(24,31);p.lineTo(33,43)});break;
    case 'flower':path(p=>{for(let i=0;i<5;i++){const a=i*2*Math.PI/5;p.ellipse(24+Math.cos(a)*9,20+Math.sin(a)*9,6,4,a,0,7);}p.moveTo(24,29);p.lineTo(24,43)});break;
    case 'pond':path(p=>{p.ellipse(24,25,20,12,.1,0,7);p.moveTo(14,24);p.quadraticCurveTo(20,20,26,24)});break;
    case 'bridge':path(p=>{p.moveTo(7,30);p.quadraticCurveTo(24,11,41,30);p.moveTo(7,35);p.lineTo(41,35);p.moveTo(12,26);p.lineTo(12,35);p.moveTo(36,26);p.lineTo(36,35)});break;
    case 'gate':case 'checkin':case 'baggage':path(p=>{p.moveTo(10,42);p.lineTo(10,11);p.lineTo(38,11);p.lineTo(38,42);p.moveTo(18,42);p.lineTo(18,25);p.lineTo(30,25);p.lineTo(30,42)});break;
    default:path(p=>{p.arc(24,24,15,0,7);p.moveTo(24,17);p.lineTo(24,32)});
  }
  g.restore();
}
const mapBox={x:40,y:88,w:920,h:570};
export function drawMap(g:CanvasRenderingContext2D,f:MapFigure,background?:CanvasImageSource){
  g.fillStyle=f.paper||'#fff';g.fillRect(0,0,1000,720);label(g,f.title||'Map title',500,43,31,'center',700,f.ink||ink);
  const b=mapBox;const C=f.ink||ink;
  if(background){g.save();g.globalAlpha=f.backgroundOpacity??1;g.drawImage(background,b.x,b.y,b.w,b.h);g.restore();}
  if(f.showBorder!==false){g.strokeStyle='#bbb4bd';g.lineWidth=2;g.strokeRect(b.x,b.y,b.w,b.h);}
  const pos=(p:Point)=>({x:b.x+clamp(p.x)*b.w,y:b.y+clamp(p.y)*b.h});
  for(const item of f.items){
    const x=b.x+clamp(item.x??.5)*b.w,y=b.y+clamp(item.y??.5)*b.h,w=clamp(item.w??.1,0,1)*b.w,h=clamp(item.h??.1,0,1)*b.h;
    if(item.points?.length){const pts=item.points.map(pos);const widths:{[k:string]:number}={road:31,river:39,footpath:8,wall:14,fence:4,bridge:22};const sw=widths[item.kind]||5;
      if(item.kind==='road'||item.kind==='river'||item.kind==='bridge')line(g,pts,item.kind==='river'?'#a6c6c9':item.kind==='bridge'?'#d5d0d3':'#d5d0d3',sw);
      line(g,pts,item.kind==='river'?'#5e9198':C,item.kind==='road'||item.kind==='river'?2:item.kind==='wall'?sw:3,item.kind==='footpath'||item.dashed);
      if(item.kind==='road')line(g,pts,'#fff',1,true);
      if(item.label){const a=pts[Math.floor((pts.length-1)/2)],c=pts[Math.ceil((pts.length-1)/2)];const q={x:(a.x+c.x)/2,y:(a.y+c.y)/2};g.font=`700 17px ${font}`;const tw=g.measureText(item.label).width;rounded(g,q.x-tw/2-9,q.y-32,tw+18,21,6);g.fillStyle='#ffffffed';g.fill();label(g,item.label,q.x,q.y-21,17,'center',700);}
      continue;
    }
    if(item.kind==='water'){rounded(g,x-w/2,y-h/2,w,h,Math.min(w,h)*.35);g.fillStyle='#e1eff0';g.fill();g.strokeStyle='#5e9198';g.lineWidth=3;g.stroke();}
    else if(item.kind==='roundabout'){g.beginPath();g.arc(x,y,Math.min(w,h)/2,0,7);g.fillStyle='#f2f0f0';g.fill();g.strokeStyle=C;g.lineWidth=5;g.stroke();g.beginPath();g.arc(x,y,Math.min(w,h)*.27,0,7);g.stroke();}
    else if(['building','room','zone'].includes(item.kind)){rounded(g,x-w/2,y-h/2,w,h,item.kind==='zone'?12:2);g.fillStyle=item.fill|| (item.kind==='zone'?'#f1f0f3':'#fff');g.fill();g.strokeStyle=C;g.lineWidth=item.kind==='zone'?2:3;g.stroke();}
    else if(item.kind==='compass'){line(g,[{x,y:y-30},{x,y:y+30}],C,2);line(g,[{x:x-30,y},{x:x+30,y}],C,2);label(g,'N',x,y-42,15,'center',700);label(g,'S',x,y+43,15,'center',700);label(g,'W',x-42,y,15,'center',700);label(g,'E',x+42,y,15,'center',700);}
    else if(item.kind==='marker'){g.beginPath();g.arc(x,y,17,0,7);g.fillStyle='#fff';g.fill();g.strokeStyle=C;g.lineWidth=2;g.stroke();}
    else if(item.kind==='tree'){icon(g,'tree',x-20,y-20,40,'#56806e');}
    else if(item.kind==='gate'){line(g,[{x:x-22,y:y-14},{x:x-22,y:y+14}],C,3);line(g,[{x:x+22,y:y-14},{x:x+22,y:y+14}],C,3);}
    else if(item.kind==='icon'){g.beginPath();g.arc(x,y,27,0,7);g.fillStyle='#fff';g.fill();g.strokeStyle='#bcb5be';g.lineWidth=2;g.stroke();icon(g,item.icon||'information',x-19,y-19,38,C);}
    if(item.label)label(g,item.label,x,item.kind==='marker'?y:y+(item.kind==='icon'?42:item.kind==='tree'?30:0),item.kind==='marker'?18:16,'center',item.kind==='marker'?700:500,C);
  }
}
export function drawFigure(g:CanvasRenderingContext2D,f:Figure,w:number,h:number,background?:CanvasImageSource){g.save();g.scale(w/(f.kind==='chart'?800:1000),h/(f.kind==='chart'?560:720));if(f.kind==='chart')drawChart(g,f);else drawMap(g,f,background);g.restore();}
