// A checked imported task with missing source answers must not mark guesses wrong.
// Browser and Firebase are local stand-ins; this does not verify production.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {nativeTask} from '../functions/ai/activities.js';
import {questionIds,scoreQuestion} from '../functions/learning/question-core.js';
import {importElements,importTask} from './ai/import-types-fixture.mjs';

const base='http://localhost:5194';
let server=null;
if(!await fetch(base).then(r=>r.ok,()=>false)){
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5194'],{stdio:'ignore',detached:true});
 for(let i=0;i<80;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
}
const elements=[
 {...importElements.gap,data:{answers:[]}},
 importElements.shortAnswer,
 {...importElements.truefalse,data:{answer:''}},
 {...importElements.match,data:{pairs:[{left:'First place',right:''},{left:'Second place',right:'Library'}],extras:['Office']}},
 {...importElements['pq-matching'],data:{options:['A','B'],names:['Cafe','Library'],statements:[{text:'Unknown room?',answer:-1},{text:'Where is the library?',answer:1}]}}
];
const task=nativeTask(importTask(elements),0,'neutral_browser');
const ids=questionIds(task.content).map(q=>q.id);
const responses={
 [ids[0]]:'Tuesday',
 [ids[1]]:'Saturday',
 [ids[2]]:0,
 [ids[3]]:[0,task.key[ids[3]].map[1]],
 [ids[4]]:[0,1]
};
assert.deepEqual(ids.map(id=>scoreQuestion(task.key[id],responses[id]).max),[0,1,0,1,1]);
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(base+'/test/lesson-style-check.html');
 await page.waitForFunction(()=>typeof window.setFixture==='function');
 await page.evaluate(({content,key,responses})=>{window.setFixture(content);window.setTestResponses(responses);window.setCheckedKey(key);},{content:task.content,key:task.key,responses});
 await page.locator(`[data-qid="${ids[4]}"] .pq-mm-row`).nth(1).locator('.pq-mm-opt.right').waitFor();
 const unknownGap=page.locator(`[data-qid="${ids[0]}"] .ans`);
 const knownGap=page.locator(`[data-qid="${ids[1]}"] .ans`);
 assert.equal(await unknownGap.getAttribute('class'),'ans','unknown gap stays neutral');
 assert.equal(await knownGap.getAttribute('class'),'ans right','supplied key marks the correct answer');
 assert.equal(await page.locator(`[data-qid="${ids[2]}"] .opt.wrong`).count(),0,'unknown choice does not show a wrong state');
 assert.equal(await page.locator(`[data-qid="${ids[3]}"] .match-left li`).first().locator('.ans.wrong').count(),0,'unknown matching row stays neutral');
 assert.equal(await page.locator(`[data-qid="${ids[4]}"] .pq-mm-row`).first().locator('.pq-mm-opt.wrong').count(),0,'unknown statement stays neutral');
 assert.equal(await page.evaluate(({content,key,responses})=>{const qs=window.questionIds(content);return window.scoreTask(qs,key,responses).total;},{content:task.content,key:task.key,responses}),3);
 mkdirSync('outputs/pr282',{recursive:true});
 await page.screenshot({path:'outputs/pr282/import-neutral-feedback.png',fullPage:true});
 console.log('Imported task feedback: unknown answers remain neutral and known answers score. Local browser fixture.');
 await page.close();
}finally{
 await browser?.close();
 if(server)try{process.kill(-server.pid,'SIGTERM');}catch{/* stopped */}
}
