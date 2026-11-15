import { CHART_PALETTE, type ChartFigure, type Figure, type MapFigure, type MapItem, type MapItemKind, type Point } from './figures';

export type FigurePreset = { id:string; name:string; about:string; figure:Figure };
const s=(name:string,values:number[],i:number,dashed=false)=>({name,values,color:CHART_PALETTE[i],dashed});
const chart=(chart:ChartFigure['chart'],title:string,categories:string[],series:ChartFigure['series'],rest:Partial<ChartFigure>={}):ChartFigure=>({kind:'chart',chart,title,categories,series,...rest});
let counter=0;
const p=(kind:MapItemKind,x:number,y:number,w=.1,h=.1,label?:string,icon?:string):MapItem=>({id:`m${++counter}`,kind,x,y,w,h,label,icon});
const route=(kind:MapItemKind,points:[number,number][],label?:string):MapItem=>({id:`m${++counter}`,kind,points:points.map(([x,y])=>({x,y})),label});
const compass=(x=.91,y=.15)=>p('compass',x,y);
const tree=(x:number,y:number)=>p('tree',x,y);
const building=(x:number,y:number,w:number,h:number,label:string)=>p('building',x,y,w,h,label);
const marker=(x:number,y:number,label:string)=>p('marker',x,y,.05,.05,label);
const icon=(x:number,y:number,label:string,key:string)=>p('icon',x,y,.08,.08,label,key);
const map=(title:string,items:MapItem[]):MapFigure=>({kind:'map',title,items,showBorder:true});

export const CHART_PRESETS:FigurePreset[]=[
  {id:'grouped-bars',name:'Grouped columns',about:'Compare several groups across categories',figure:chart('bars','Coffee and tea habits by city',['Sydney','Melbourne','Brisbane','Adelaide','Hobart'],[s('Fresh coffee',[44,43,34,35,39],0),s('Instant coffee',[46,49,53,50,54],1),s('Visited a café',[61,64,56,50,63],2)],{unit:'%',min:20,max:70,step:10,yLabel:'Percentage of residents'})},
  {id:'horizontal-bars',name:'Horizontal bars',about:'Long category names remain easy to read',figure:chart('bars','Average weekly spending by families',['Food','Housing','Fuel and power','Clothing and footwear','Household goods','Personal goods','Transport','Leisure'],[s('1968',[35,10,6,10,8,8,8,9],0),s('2018',[17,19,4,5,8,4,14,22],1)],{horizontal:true,unit:'%',max:40,step:10,xLabel:'Share of weekly income'})},
  {id:'line',name:'Line graph',about:'Track two trends over time',figure:chart('lines','Shop openings and closures',['2011','2012','2013','2014','2015','2016','2017','2018'],[s('Closures',[6400,5900,7200,6500,600,5200,5000,5200],0),s('Openings',[8500,3900,5000,6200,4000,4000,4200,3000],1,true)],{max:9000,step:1000,yLabel:'Number of shops'})},
  {id:'multi-line',name:'Multiple lines',about:'Compare three or more changing series',figure:chart('lines','Households with electrical appliances',['1920','1940','1960','1980','2000','2019'],[s('Washing machine',[40,60,70,65,70,75],0),s('Refrigerator',[0,55,90,100,100,100],1),s('Vacuum cleaner',[30,50,70,90,100,100],2,true)],{unit:'%',max:100,step:20,yLabel:'Percentage of households'})},
  {id:'visitors-line',name:'Visitor trends',about:'Compare three visitor totals over time',figure:chart('lines','Tourists visiting a Caribbean island (2010–2017)',['2010','2011','2012','2013','2014','2015','2016','2017'],[s('Visitors staying on cruise ships',[.25,.5,.25,.5,1,1.25,1.5,2],0,true),s('Visitors staying on island',[.75,.75,1.25,1.5,1.5,1.5,1.25,1.5],1,true),s('Total',[1,1.25,1.5,2,2.5,2.75,2.75,3.5],2)],{max:4,step:.5,yLabel:'Millions of visitors'})},
  {id:'pie',name:'Pie chart',about:'Show how one total is divided',figure:chart('pie','Destinations after graduation',['Full-time work','Part-time work','Part-time work + postgraduate study','Full-time postgraduate study','Unemployed','Not known'],[s('Graduates',[52,15,5,8,12,8],0)])},
  {id:'many-pies',name:'Side-by-side pies',about:'Compare shares across years or subjects',figure:chart('pie','Police budget: how the money was spent',['Salaries','Technology','Buildings and transport'],[s('2017',[75,8,17],0),s('2018',[69,14,17],0)])},
  {id:'three-pies',name:'Three pie charts',about:'Compare the same categories in three totals',figure:chart('pie','Nutrients in typical meals',['Breakfast','Lunch','Dinner','Snacks'],[s('Sodium',[14,29,43,14],0),s('Saturated fat',[16,26,37,21],0),s('Added sugar',[16,19,23,42],0)])},
  {id:'table',name:'Data table',about:'A neat table of figures and units',figure:chart('table','Police budget sources',['National government','Local taxes','Other sources','Total'],[s('2017',[175.5,91.2,38,304.7],0),s('2018',[177.8,102.3,38.5,318.6],1)],{unit:'m'})},
  {id:'change-table',name:'Percentage change table',about:'Show the rise or fall for each category',figure:chart('table','Percentage change in export values',['Petroleum products','Engineered goods','Gems and jewellery','Agricultural products','Textiles'],[s('2015–2016',[3,8.5,-5.18,.81,15.24],0)],{unit:'%'})},
];

export const CHART_COMBINATIONS = [
  {
    id:'police-budget',name:'Budget table and pie charts',
    about:'Sources of funding above two spending breakdowns',
    top:CHART_PRESETS.find(x=>x.id==='table')!.figure as ChartFigure,
    bottom:CHART_PRESETS.find(x=>x.id==='many-pies')!.figure as ChartFigure,
  },
  {
    id:'export-change',name:'Bar chart and change table',
    about:'Values by category with a comparison table',
    top:chart('bars','Export earnings (2015–2016)',['Petroleum products','Engineered goods','Gems and jewellery','Agricultural products','Textiles'],[s('2015',[61,57,43,31,25],0),s('2016',[63,62,41,31.25,31],1)],{max:70,step:10,yLabel:'$ billions'}),
    bottom:CHART_PRESETS.find(x=>x.id==='change-table')!.figure as ChartFigure,
  },
  {
    id:'graduate-outcomes',name:'Pie chart and salary table',
    about:'Destinations above an employment comparison',
    top:CHART_PRESETS.find(x=>x.id==='pie')!.figure as ChartFigure,
    bottom:chart('table','Salaries after five years',['Freelance consultants','Government sector','Private companies'],[s('$25–49k',[5,5,10],0),s('$50–74k',[15,15,35],1),s('$75–99k',[40,30,25],2),s('$100k+',[40,50,30],3)],{unit:'%'}),
  },
  {
    id:'household-trends',name:'Two related line graphs',
    about:'Appliance ownership above housework hours',
    top:CHART_PRESETS.find(x=>x.id==='multi-line')!.figure as ChartFigure,
    bottom:chart('lines','Housework hours per week',['1920','1940','1960','1980','2000','2019'],[s('Hours per week',[50,35,20,15,15,12],0)],{max:60,step:10,yLabel:'Hours per household'}),
  },
];

export const MAP_PRESETS:FigurePreset[]=[
  {id:'park',name:'Park or recreation ground',about:'River, paths, trees, facilities and lettered places',figure:map('Riverside Park',[
    route('river',[[0,.13],[.22,.1],[.42,.16],[.65,.14],[1,.11]],'River'),
    route('road',[[0,.96],[1,.96]],'Main road'),
    route('footpath',[[.18,.86],[.23,.67],[.32,.54],[.45,.44],[.62,.45],[.78,.61],[.81,.86]]),
    route('footpath',[[.22,.68],[.42,.75],[.58,.7],[.65,.45]]),
    p('water',.46,.55,.22,.16,'Lily pond'),building(.19,.39,.18,.12,'Community hall'),
    p('zone',.7,.32,.17,.13,'Playground'),p('zone',.68,.73,.16,.12,'Sports field'),
    ...[[.15,.22],[.39,.23],[.84,.46],[.54,.77],[.1,.72]].map(([x,y])=>tree(x,y)),
    marker(.15,.58,'A'),marker(.4,.35,'B'),marker(.57,.28,'C'),marker(.72,.54,'D'),marker(.91,.72,'E'),
    p('gate',.23,.85,.05,.06),p('gate',.81,.85,.05,.06),
    p('label',.23,.9,.1,.04,'West gate'),p('label',.81,.9,.1,.04,'East gate'),compass()
  ])},
  {id:'site',name:'Building or factory plan',about:'Rooms, courtyard, access roads and labelled points',figure:map('Stevenson’s site',[
    building(.48,.18,.63,.19,'Factory'),
    route('road',[[.05,.98],[.94,.98]],'Main road'),route('road',[[.91,.96],[.91,.39]],'Access road'),
    ...[[.18,.41,'A'],[.4,.41,'B'],[.73,.41,'C'],[.18,.56,'D'],[.4,.56,'E'],[.18,.71,'F'],[.73,.71,'G']].map(([x,y,n])=>building(Number(x),Number(y),.15,.1,String(n))),
    p('zone',.55,.72,.15,.12,'Open courtyard'),
    ...[[.21,.85,'H'],[.39,.85,'I'],[.57,.85,'J']].map(([x,y,n])=>building(Number(x),Number(y),.12,.09,String(n))),
    building(.77,.85,.17,.09,'Reception'),
    ...[[.05,.41],[.05,.56],[.05,.71]].map(([x,y])=>tree(x,y)),compass(.94,.16)
  ])},
  {id:'town',name:'Town before and after',about:'Roads, roundabouts, river and new facilities',figure:map('Industrial area · proposed development',[
    route('river',[[.04,.16],[.25,.22],[.48,.18],[.72,.27],[.96,.2]],'River'),
    route('road',[[.06,.87],[.49,.87],[.49,.59],[.84,.59]]),
    route('road',[[.49,.59],[.49,.33],[.49,.2]]),p('roundabout',.49,.59,.11,.16),
    p('zone',.25,.37,.17,.13,'Housing'),p('zone',.68,.38,.2,.14,'Playground'),
    icon(.75,.68,'School','school'),icon(.32,.68,'Shops','shop'),icon(.58,.69,'Medical centre','medical'),
    p('gate',.49,.87,.06,.06),compass(.9,.12)
  ])},
  {id:'airport',name:'Airport plan',about:'Terminal, concourse, gates and amenity icons',figure:map('Southwest Airport · after development',[
    route('road',[[.1,.96],[.9,.96]],'Access'),
    building(.5,.67,.7,.4,''),route('wall',[[.5,.47],[.5,.17]]),
    route('wall',[[.5,.17],[.22,.09]]),route('wall',[[.5,.17],[.79,.09]]),
    ...Array.from({length:5},(_,i)=>marker(.21+i*.06,.22,String(i+1))),
    ...Array.from({length:4},(_,i)=>marker(.24+i*.06,.3,String(i+6))),
    ...Array.from({length:5},(_,i)=>marker(.55+i*.06,.22,String(i+10))),
    ...Array.from({length:4},(_,i)=>marker(.58+i*.06,.3,String(i+15))),
    p('label',.5,.52,.1,.04,'Terminal'),
    icon(.26,.6,'Check-in','checkin'),icon(.5,.6,'Café','café'),icon(.74,.6,'ATM','atm'),
    icon(.35,.72,'Bag drop','baggage'),icon(.65,.72,'Car hire','car'),
    icon(.5,.38,'','train'),p('label',.62,.38,.12,.04,'Sky train'),
    p('gate',.29,.86,.05,.06),p('gate',.71,.86,.05,.06),
    p('label',.29,.91,.1,.04,'Departures'),p('label',.71,.91,.1,.04,'Arrivals'),compass(.91,.15)
  ])},
  {id:'castle',name:'Castle or heritage site',about:'River, walls, towers, bridges and walking routes',figure:map('Branley Castle',[
    route('river',[[.04,.72],[.14,.55],[.18,.32],[.31,.18],[.59,.2],[.92,.23]],'River'),
    route('footpath',[[.53,.94],[.53,.79],[.83,.62],[.84,.3]]),
    route('footpath',[[.53,.79],[.32,.82],[.19,.72]]),
    p('roundabout',.53,.53,.4,.44),building(.53,.52,.19,.16,'Great Hall'),
    ...[[.34,.39],[.72,.39],[.34,.68],[.72,.68]].map(([x,y])=>icon(x,y,'','tower')),
    route('bridge',[[.16,.72],[.24,.72]],'Bridge'),p('gate',.53,.31,.05,.06),p('gate',.53,.75,.05,.06),
    p('label',.42,.27,.1,.04,'North gate'),p('label',.42,.87,.1,.04,'South gate'),
    ...[[.2,.43,'A'],[.65,.27,'B'],[.79,.49,'C'],[.27,.74,'D'],[.77,.81,'E'],[.88,.74,'F']].map(([x,y,n])=>marker(Number(x),Number(y),String(n))),compass(.92,.13)
  ])}
];

const townNow=map('Industrial area · now',[
  route('river',[[.04,.16],[.25,.22],[.48,.18],[.72,.27],[.96,.2]],'River'),
  route('road',[[.06,.87],[.49,.87],[.49,.59],[.84,.59]]),p('roundabout',.49,.59,.11,.16),
  ...[[.28,.43],[.37,.31],[.66,.4],[.79,.72],[.83,.35]].map(([x,y])=>building(x,y,.12,.07,'Factory')),
  p('zone',.22,.72,.16,.12,'Town'),compass(.9,.12)
]);
const airportNow=map('Southwest Airport · now',[
  route('road',[[.1,.96],[.9,.96]],'Access'),building(.5,.6,.64,.42,''),
  route('wall',[[.5,.39],[.5,.25]]),building(.5,.2,.14,.12,'Gates 1–8'),
  p('label',.5,.45,.1,.04,'Terminal'),icon(.3,.57,'Check-in','checkin'),icon(.7,.57,'Café','café'),
  p('gate',.29,.86,.05,.06),p('gate',.71,.86,.05,.06),
  p('label',.29,.91,.1,.04,'Departures'),p('label',.71,.91,.1,.04,'Arrivals'),compass(.9,.14)
]);
MAP_PRESETS.unshift({id:'town-now',name:'Town plan · now',about:'Pair with the proposed development map',figure:townNow});
MAP_PRESETS.push({id:'airport-now',name:'Airport plan · now',about:'Pair with the airport redevelopment map',figure:airportNow});
export const MAP_COMPARISONS=[
  {id:'town-pair',name:'Town before & after',now:townNow,after:MAP_PRESETS.find(x=>x.id==='town')!.figure as MapFigure},
  {id:'airport-pair',name:'Airport before & after',now:airportNow,after:MAP_PRESETS.find(x=>x.id==='airport')!.figure as MapFigure},
];

export const blankMap=():MapFigure=>map('New map',[compass()]);
export const blankChart=():ChartFigure=>chart('bars','New chart',['Category A','Category B','Category C'],[s('Series 1',[10,18,14],0),s('Series 2',[14,12,21],1)]);
export function cloneFigure(f:Figure):Figure{return JSON.parse(JSON.stringify(f)) as Figure;}
export function makeMapItem(kind:MapItemKind,x:number,y:number,iconKey?:string):MapItem{
  return {id:crypto.randomUUID(),kind,x,y,w:kind==='building'||kind==='zone'||kind==='room'?.16:.08,h:kind==='building'||kind==='zone'||kind==='room'?.12:.08,label:kind==='marker'?'A':kind==='icon'?'Place':'',icon:iconKey};
}
export function mapPointFromCanvas(x:number,y:number,width:number,height:number):Point{
  return {x:Math.max(0,Math.min(1,(x/width-0.04)/.92)),y:Math.max(0,Math.min(1,(y/height-88/720)/(570/720)))};
}
