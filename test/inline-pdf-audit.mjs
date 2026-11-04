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
 const results=await page.evaluate(async()=>{
  const {flattenWithSections}=await import('/src/lib/worksheet.ts');
  const {worksheetHtml}=await import('/src/lib/worksheetHtml.ts');
  const {worksheetPdf}=await import('/src/lib/pdfMake.ts');
  const {docBodyHtml,prepareDocumentPrint,EXPORT_DEFAULT}=await import('/src/collab/export.ts');
  const {htmlToPdf}=await import('/src/lib/folderExport.ts');
  const text=text=>({type:'text',text}),para=(...content)=>({type:'paragraph',content});
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
  const {sheetPictures}=await import('/src/lib/sheetMedia.ts');
  const media=await sheetPictures('audit',items);
  if(!media['pdf-page:1:file:audit-source']?.data.startsWith('data:image/jpeg')) throw Error('Lost the original attachment page.');
  const html=worksheetHtml('Town lesson',items,{...opts,media});
  await prepareDocumentPrint(doc,'audit');const collab=docBodyHtml(doc,'Town document',EXPORT_DEFAULT);
  for(const output of [html,collab]){
   for(const expected of ['Map annotation','What did you observe?','South route','Post a landmark','Look near the park.','North entrance','Walk east.','One-row table','Which place lends books?','Bakery','Read the street map.','Role A','Ask about the bus stop.','Ask a neighbour','Could you help me?','Indirect questions','Classroom game'])if(!output.includes(expected))throw Error('Missing '+expected);
   if(output.includes('secret-key'))throw Error('A learner copy exposed a private answer.');
  }
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
  return {lesson:base64(await worksheetPdf(html)),collab:base64(await htmlToPdf(collab,null))};
 });
 for(const [name,data] of Object.entries(results)){const bytes=Buffer.from(data,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await writeFile(out+'/'+name+'.pdf',bytes);}
 console.log('Lesson and Collab PDF files written to '+out);
}finally{await browser?.close();server.kill();}
