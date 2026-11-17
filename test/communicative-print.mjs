import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const b=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});const p=await b.newPage();mkdirSync('outputs/communicative',{recursive:true});
try{
 await p.goto('http://localhost:5197/dev.html?seed&as=teacher');await p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return !!localStorage.getItem('mockdemo');},null,{timeout:180000});await p.waitForLoadState('networkidle');
 for(const paper of ['A4','Letter']){
 const html=await p.evaluate(async paper=>{
  const {ACTIVITY_KINDS,communicativeFixture,ACTIVITY_LABELS}=await import('/test/communicative-fixtures.ts');const {flattenTask}=await import('/src/lib/worksheet.ts');const {worksheetHtml}=await import('/src/lib/worksheetHtml.ts');
  const {savePrivateActivityPicture}=await import('/src/communicative/privatePictures.ts'),{sheetPictures}=await import('/src/lib/sheetMedia.ts');const d=JSON.parse(localStorage.getItem('mockdemo'));const canvas=document.createElement('canvas');canvas.width=120;canvas.height=90;const g=canvas.getContext('2d');g.fillStyle='#305f8a';g.fillRect(0,0,120,90);const src=await savePrivateActivityPicture(d.classId,await new Promise(r=>canvas.toBlob(r,'image/png')));
  const items=ACTIVITY_KINDS.map(kind=>({kind:'task',task:flattenTask({title:ACTIVITY_LABELS[kind],instructions:'Work with your partner.',content:{type:'doc',content:[communicativeFixture(kind)]}})}));
  for(const kind of ['board','bingo','cue','findSomeone']) {
   const node=communicativeFixture(kind),count=kind==='board'?48:kind==='bingo'?30:kind==='findSomeone'?16:8;
   node.attrs.id+='-large';node.attrs.settings={...node.attrs.settings,...(kind==='board'?{boardStyle:'spiral',printDie:true}:kind==='bingo'?{gridSize:5,printCards:4}:{})};
   const originals=node.content;node.content=Array.from({length:count},(_,n)=>{const item=structuredClone(originals[n%originals.length]);item.attrs.activityItemId='large-'+n;if(kind==='board')item.attrs={...item.attrs,special:n===0?'start':n===count-1?'finish':null,title:'Describe a journey '+n};if(kind==='cue')item.content=[{type:'paragraph',content:[{type:'text',text:'Explain your plan to your partner. Give a reason for each choice. '.repeat(15)}]}];return item;});
   items.push({kind:'task',task:flattenTask({title:'Largest '+kind,instructions:'Work with your partner.',content:{type:'doc',content:[node]}})});
  }
  for(const [family,length]of [['short-roles',2],['long-roles',27]])for(const [n,label]of ['A','B'].entries())items.push({kind:'task',task:flattenTask({id:family+label,family,variant:label,title:'Journey plans',instructions:'Read your information. Ask your partner for the missing details.',content:{type:'doc',content:Array.from({length},(_,i)=>({type:'paragraph',content:[{type:'text',text:`Plan ${i+1}: Take the tram to the harbour. Ask which stop is nearest to the market.`}]}))}})});
  const pictureNode=communicativeFixture('cue');pictureNode.content.forEach(item=>item.attrs.picture={src,alt:'Synthetic blue protected image',fit:'contain'});items.push({kind:'task',task:flattenTask({title:'Private picture print check',instructions:'Describe your picture.',content:{type:'doc',content:[pictureNode]}})});const media=await sheetPictures(d.classId,items);if(!media[src]?.data?.startsWith('data:image/'))throw Error('Protected picture missing from print media');
  return worksheetHtml('Synthetic communicative activity checks',items,{media,header:true,key:false,paper,columns:1,accent:'#5b8881',className:'Synthetic test class',level:'B1'});
 },paper);
 const out=await b.newPage();await out.setContent(html,{waitUntil:'domcontentloaded'});await out.waitForFunction(()=>window.__laidOut,{timeout:30000});
 await out.waitForFunction(()=>[...document.querySelectorAll('.page img[alt="Synthetic blue protected image"]')].filter(i=>i.complete&&i.naturalWidth>0).length===3);
 const details=await out.evaluate(()=>({pages:document.querySelectorAll('.page').length,labels:[...document.querySelectorAll('.page [data-label]')].map(x=>x.dataset.label),overflow:[...document.querySelectorAll('.page .pa-activity')].filter(x=>{const a=x.getBoundingClientRect(),page=x.closest('.page').getBoundingClientRect();return a.bottom>page.bottom-20||a.right>page.right-10||a.left<page.left;}).map(x=>({text:x.innerText.slice(0,100),h:x.getBoundingClientRect().height,pg:x.closest('.page').getBoundingClientRect().height})),cards:[...document.querySelectorAll('.page .cut-card')].filter(x=>{const r=x.getBoundingClientRect(),p=x.closest('.page').getBoundingClientRect();return r.bottom>p.bottom-20||r.right>p.right-10;}).map(x=>x.innerText.slice(0,100))}));
 writeFileSync(`outputs/communicative/print-${paper}.json`,JSON.stringify(details,null,2));console.log(paper,JSON.stringify(details));
 await out.pdf({path:`outputs/communicative/communicative-${paper}.pdf`,format:paper,printBackground:true});await out.locator('.page').nth(0).screenshot({path:`outputs/communicative/print-${paper}-board.png`});
 assert.ok(details.pages>=13);assert.equal(details.labels.length>12,true);assert.deepEqual(details.overflow,[]);assert.deepEqual(details.cards,[]);await out.close();
 }
 console.log('PASS all 13 activity print exports on A4 and Letter, page/card containment and decoded protected uploaded pictures.');
}finally{await b.close();}
