import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const port=5276,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port',String(port),'--strictPort','--host','127.0.0.1'],{stdio:'inherit'});
const out=process.env.PDF_AUDIT_DIR||'outputs/pdf-audit';
let browser;
try{
 await mkdir(out,{recursive:true});
 for(let i=0;i<120;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch();
 const page=await browser.newPage();
 await page.goto(base+'/test/inline-pdf-audit.html',{waitUntil:'domcontentloaded',timeout:180000});
 await page.locator('main[data-ready=true]').waitFor({timeout:180000});
 // Vite can finish optimising a dependency immediately after the fixture becomes
 // ready. That reload invalidates a page.evaluate context; retry on the new page.
 let results;
 for(let attempt=0;attempt<3;attempt++){
  await page.locator('main[data-ready=true]').waitFor({timeout:180000});
  try{
   results=await page.evaluate(async()=>{
  const {flattenWithSections}=await import('/src/lib/worksheet.ts');
  const {worksheetHtml}=await import('/src/lib/worksheetHtml.ts');
  const {worksheetPdf}=await import('/src/lib/pdfMake.ts');
  const {docBodyHtml,prepareDocumentPrint,EXPORT_DEFAULT}=await import('/src/collab/export.ts');
  const {htmlToPdf}=await import('/src/lib/folderExport.ts');
  const text=text=>({type:'text',text}),para=(...content)=>({type:'paragraph',content});
  const choice = (...options) => ({type:'choice',attrs:{options,correct:0}});
  const listItem = (...content) => ({type:'listItem',content:[para(...content)]});
  const numbering = flattenWithSections([{
    title:'Numbering check',
    content:{type:'doc',content:[
      {type:'subTask',attrs:{instr:'Choose true or false'},content:[
        {type:'orderedList',attrs:{start:3},content:[
          listItem(choice('True','False','  '),text(' The train is late.')),
          listItem(choice('True','False'),text(' First. '),choice('True','False'),text(' Second.')),
        ]},
        para(text('In a paragraph, choose '),choice('True','False'),text('.')),
      ]},
    ]},
  }]);
  const numberingHtml = worksheetHtml('Numbering check',numbering,{key:true});
  const numberingDoc = new DOMParser().parseFromString(numberingHtml,'text/html');
  const numberedRows = numberingDoc.querySelector('#u-main').content.querySelectorAll('.li');
  if (numberedRows[0].querySelector('.mk').textContent !== '3.' || numberedRows[0].querySelector('.qn')) throw Error('The worksheet repeated the ordered-list label.');
  if (numberedRows[0].querySelector('.opts').textContent !== 'True / False') throw Error('An empty choice added a separator.');
  if (numberedRows[1].querySelectorAll('.qn').length !== 2) throw Error('Two questions in one list item lost their separate numbers.');
  const paragraph = [...numberingDoc.querySelector('#u-main').content.querySelectorAll('p')].find(p=>p.textContent.includes('In a paragraph'));
  if (!paragraph?.querySelector('.qn')) throw Error('A question inside prose lost its number.');
  if (!numberingDoc.querySelector('#u-key').content.textContent.includes('a.3')) throw Error('The answer key lost the printed list label.');
  await window.seedPdf();
  const doc={type:'doc',content:[
   para(text('Ask for directions. Complete the sentence: '),{type:'gap',attrs:{id:'gap',answers:['secret-key']}},text('.')),
   {type:'pdfBlock',attrs:{src:'file:audit-source',pages:[{w:595,h:842}],title:'Attached map'},content:[
    {type:'pdfBox',attrs:{page:0},content:[para(text('Map annotation'))]},
    {type:'pdfBox',attrs:{page:0,key:true},content:[para(text('secret-key'))]}]},
   {type:'tt',attrs:{kind:'custom',title:'Peer observation',mode:'complete',data:{},def:{name:'Training form',fields:[{id:'evidence',label:'What did you observe?',kind:'long'}]}}},
   {type:'survey',attrs:{questions:[{type:'single',prompt:'Choose a route',options:['North route','South route']}]}},
   {type:'board',attrs:{prompt:'Post a landmark'}},
   {type:'reveal',attrs:{title:'Map hint'},content:[para(text('Look near the park.'))]},
   {type:'diagram',content:[{type:'diagramCell',content:[para(text('North entrance'))]}]},
   {type:'subTask',attrs:{instr:'Discuss the map'},content:[para(text('Walk east.'))]},
   {type:'mcq',attrs:{id:'quiz',prompt:'Which place lends books?',options:['Library','Bakery','Station'],correct:0}},
   {type:'textBox',attrs:{label:'Reading'},content:[para(text('Read the street map.'))]},
   {type:'speakingPractice',attrs:{title:'Ask a neighbour',scenario:'Find the library.',focus:'Check the directions.'}},
   {type:'studioForm',attrs:{kind:'language',title:'Language notes',fields:{target:'Could you help me?'},examples:[]}},
   {type:'randomPick',attrs:{mode:'cards'},content:[{type:'pickCard',attrs:{title:'Role A'},content:[para(text('Ask about the bus stop.'))]}]},
   {type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:2},content:[para(text('One-row table'))]}]}]},
   {type:'classroomGame',attrs:{sessionId:'fictional'}},
   {type:'bankLink',attrs:{bank:'grammar',title:'Indirect questions'}},
  ]};
  const task={title:'Around town',content:doc,instructions:'Work with a partner.',variant:'Standard'};
  const opts={header:true,key:false,notes:false,paper:'A4',columns:1};
  const items=flattenWithSections([task]);
  const {sheetPictures,sheetSounds}=await import('/src/lib/sheetMedia.ts');
  const {doc:setDocRef,setDoc}=await import('/test/mock/firestore.ts');
  const {db}=await import('/src/lib/firebase.ts');
  await setDoc(setDocRef(db,'classes','audit','media','dialogue'),{title:'Holiday plans',script:[{t:0,who:'Alex',text:'Where shall we go?'},{t:2,who:'Sam',text:'Let us go camping.'},{t:4,text:'The train leaves.'},{t:5,who:'Alex',text:'   '}]});
  const qrItems=flattenWithSections([{title:'Play and listen',content:{type:'doc',content:[{type:'classroomGame',attrs:{sessionId:'saved-game'}},{type:'media',attrs:{media:'dialogue'}}]}}]);
  const qrSounds=await sheetSounds('audit',qrItems,'#975f40');
  // Old game blocks are gone (live quizzes are played online), so they print nothing and get no QR.
  if(qrSounds['game:saved-game'])throw Error('An old game block still got a QR code');
  if(JSON.stringify(qrSounds.dialogue.script)!==JSON.stringify(['Alex: Where shall we go?','Sam: Let us go camping.','The train leaves.']))throw Error('Speaker labels missing or invented');
  const qrHtml=worksheetHtml('Games and named speakers',qrItems,{...opts,key:true,qr:false,sounds:qrSounds});
  if(qrHtml.includes('Scan to play')||!qrHtml.includes('Alex: Where shall we go?')||!qrHtml.includes('Sam: Let us go camping.'))throw Error('QR or speakers omitted');
  const unconfigured=worksheetHtml('Unconfigured',flattenWithSections([{title:'Game',content:{type:'doc',content:[{type:'classroomGame',attrs:{}}]}}]),opts);
  if(unconfigured.includes('Choose a saved game')||unconfigured.includes('Scan to play'))throw Error('An old game block printed a note or a QR');

  const media=await sheetPictures('audit',items);
  if(!media['pdf-page:1:file:audit-source']?.data.startsWith('data:image/jpeg')) throw Error('Lost the original attachment page.');
  const html=worksheetHtml('Town lesson',items,{...opts,media,sounds:await sheetSounds('audit',items,'#975f40')});
  await prepareDocumentPrint(doc,'audit');const collab=docBodyHtml(doc,'Town document',EXPORT_DEFAULT);
  for(const output of [html,collab]){
   for(const expected of ['Map annotation','What did you observe?','South route','Post a landmark','Look near the park.','North entrance','Walk east.','One-row table','Which place lends books?','Bakery','Read the street map.','Role A','Ask about the bus stop.','Ask a neighbour','Could you help me?','Indirect questions','Classroom game'])if(!output.includes(expected))throw Error('Missing '+expected);
   if(output.includes('secret-key'))throw Error('A learner copy exposed a private answer.');
  }
  const rendered = document.createElement('iframe');document.body.append(rendered);
  try {
    const d=rendered.contentDocument;d.open();d.write(html);d.close();
    for(let i=0;i<300&&!rendered.contentWindow.__laidOut;i++)await new Promise(resolve=>setTimeout(resolve,100));
    if(!rendered.contentWindow.__laidOut)throw Error('Sample did not paginate.');
    const columns=[...d.querySelectorAll('#pages .col')];
    if(columns.some(col=>col.scrollHeight>col.clientHeight+2))throw Error('Sample clipped an activity. '+JSON.stringify(columns.map(col=>({h:col.clientHeight,scroll:col.scrollHeight,children:[...col.querySelectorAll('.ex-body > *')].map(c=>[c.tagName,c.textContent.slice(0,45),Math.round(c.getBoundingClientRect().height)])}))));
    for(const expected of ['Map annotation','What did you observe?','South route','Post a landmark','Look near the park.','North entrance','Walk east.','One-row table','Which place lends books?','Bakery','Read the street map.','Ask a neighbour','Could you help me?']) {
      if(!columns.some(col=>col.textContent.includes(expected)))throw Error('Rendered sample lost '+expected);
    }
  }finally{rendered.remove();}
  const passage = 'Travel to the library. '.repeat(1200) + 'End of passage.';
  const rows = Array.from({length:95},(_,i)=>({type:'tableRow',content:[{type:'tableCell',content:[para(text('Printable row '+i))]}]}));
  const longTask = {...task,content:{type:'doc',content:[para(text(passage)),{type:'table',content:rows}]}};
  const frame = document.createElement('iframe');document.body.append(frame);
  try {
    const d=frame.contentDocument;d.open();d.write(worksheetHtml('Long worksheet',flattenWithSections([longTask]),opts));d.close();
    for(let i=0;i<300&&!frame.contentWindow.__laidOut;i++)await new Promise(resolve=>setTimeout(resolve,100));
    if(!frame.contentWindow.__laidOut)throw Error('Long worksheet did not paginate.');
    const columns=[...d.querySelectorAll('#pages .col')];
    if(columns.length<3||columns.some(col=>col.scrollHeight>col.clientHeight+2))throw Error('Long worksheet clipped content.');
    const printed=columns.map(col=>col.textContent).join('');
    if(!printed.includes('End of passage.')||!printed.includes('Printable row 94'))throw Error('Lost end of long worksheet.');
    if((printed.match(/Travel to the library/g)||[]).length<1190)throw Error('Lost passage text.');
  } finally {frame.remove();}
  function base64(bytes){let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(str);}
  return {games:base64(await worksheetPdf(qrHtml)),lesson:base64(await worksheetPdf(html)),collab:base64(await htmlToPdf(collab,null))};
   });
   break;
  }catch(error){
   if(attempt===2||!String(error).includes('Execution context was destroyed'))throw error;
  }
 }
 for(const [name,data] of Object.entries(results)){const bytes=Buffer.from(data,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await writeFile(out+'/'+name+'.pdf',bytes);}
 console.log('Lesson and Collab PDF files written to '+out);
}finally{await browser?.close();server.kill();}
