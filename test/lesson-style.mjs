// Run against the Firebase stand-ins: start Vite with test/vite.config.ts first.
// Optional SMOKE_BROWSER_PATH selects an existing Chromium installation.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const BASE = process.env.STYLE_BASE || 'http://localhost:5184';
const OUT = process.env.STYLE_OUTPUT || 'work/lesson-style';
await mkdir(OUT, {recursive:true});
const b = await chromium.launch({executablePath:process.env.SMOKE_BROWSER_PATH || undefined});
const p = await b.newPage({viewport:{width:1300,height:900}});
p.setDefaultTimeout(180000);
const errors=[];p.on('pageerror',e=>errors.push(e.message));
const results=[];
const ok = name => {results.push(name);console.log('PASS',name);};
try {
  if (process.env.STYLE_ONLY !== 'fixtures') {
  await p.goto(`${BASE}/dev.html?seed&as=teacher`);
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('mockdemo') || '{}').packId,null,{timeout:120000});
  const demo=await p.evaluate(()=>JSON.parse(localStorage.getItem('mockdemo')));
  await p.goto(`${BASE}/class/${demo.classId}`);
  await p.getByRole('button',{name:'Class actions',exact:true}).waitFor();
  const protectedData=()=>p.evaluate(cid=>Object.fromEntries(Object.entries(JSON.parse(localStorage.mockfs)).filter(([k])=>k.startsWith(`classes/${cid}/`))),demo.classId);
  await p.evaluate(cid=>{
    const fs=JSON.parse(localStorage.mockfs);delete fs[`classes/${cid}`].lessonStyle;
    fs[`classes/${cid}/answers/presentation-regression`] = {taskId:'nested-task',learnerUid:'fixture',responses:{'nested.gap':'Monday',choice:0,writing:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Saved answer',marks:[{type:'bold'}]}]}]}},checked:true,score:2,marks:{writing:{score:5,comment:'Saved feedback'}},submissions:[{at:123,body:'Original'}],revealed:['nested.gap']};
    localStorage.setItem('mockfs',JSON.stringify(fs));
  },demo.classId);
  await p.reload();
  await p.getByRole('button',{name:'Class actions',exact:true}).click();
  await p.getByRole('menuitem',{name:'Class settings',exact:true}).click();
  assert.equal(await p.getByLabel('Lesson style').inputValue(),'adult');
  await p.getByRole('button',{name:'Cancel',exact:true}).click();
  ok('Existing class without preference defaults to Adult');
  const before=await protectedData();
  async function settings(style) {
    await p.getByRole('button',{name:'Class actions',exact:true}).click();
    await p.getByRole('menuitem',{name:'Class settings',exact:true}).click();
    await p.getByLabel('Lesson style',{exact:false}).selectOption(style);
    await p.getByRole('button',{name:'Save changes',exact:true}).click();
    await p.getByRole('dialog',{name:'Class settings'}).waitFor({state:'hidden'});
    await p.reload();
    assert.equal(await p.evaluate(cid=>JSON.parse(localStorage.mockfs)[`classes/${cid}`].lessonStyle,demo.classId),style);
  }
  await settings('young'); assert.deepEqual(await protectedData(),before);ok('Settings save and reload Adult → Young; all lesson and progress documents unchanged');
  await settings('adult'); assert.deepEqual(await protectedData(),before);ok('Settings save and reload Young → Adult; all lesson and progress documents unchanged');
  await p.goto(`${BASE}/classes`);
  await p.getByRole('button',{name:/New class|Make a class/}).first().click();
  await p.getByLabel('Class name',{exact:true}).fill('Young learner persistence fixture');
  await p.getByLabel('Lesson style').selectOption('young');
  await p.getByRole('button',{name:'Make class',exact:true}).click();
  await p.waitForFunction(()=>Object.values(JSON.parse(localStorage.mockfs)).some(v=>v.name==='Young learner persistence fixture'&&v.lessonStyle==='young'));
  ok('New class stores Young learner preference');
  }
  if (process.env.STYLE_ONLY === 'classes') { console.log('Class persistence checks complete'); } else {

  await p.goto(`${BASE}/test/lesson-style-check.html`);
  await p.waitForFunction(()=>!!window.fixture && !!document.querySelector('.ProseMirror')?.editor);
  await p.evaluate(()=>document.fonts.ready);
  const baseline=await p.evaluate(()=>JSON.stringify(window.fixture));
  const outside=await p.locator('#outside').evaluate(el=>[getComputedStyle(el).fontFamily,getComputedStyle(el).backgroundColor]);
  await p.locator('[data-qid="email-gap"] input').fill('Monday');
  await p.locator('[data-qid="nested-choice"] [role="radio"]').first().click();
  await p.getByRole('button',{name:'Read the hint',exact:true}).click();
  const responses=await p.evaluate(()=>window.responses);
  const score=await p.evaluate(()=>{const {content,key}=window.splitKey(window.fixture);return window.scoreTask(window.questionIds(content),key,window.responses)});
  for(const style of ['adult','young','adult','young']) {
    await p.getByLabel('Fixture style').selectOption(style);
    assert.equal(await p.evaluate(()=>JSON.stringify(window.fixture)),baseline);
    assert.deepEqual(await p.evaluate(()=>window.responses),responses);
    assert.deepEqual(await p.evaluate(()=>{const {content,key}=window.splitKey(window.fixture);return window.scoreTask(window.questionIds(content),key,window.responses)}),score);
    assert(await p.getByText('Start with the day.',{exact:true}).isVisible());
    assert.deepEqual(await p.locator('#outside').evaluate(el=>[getComputedStyle(el).fontFamily,getComputedStyle(el).backgroundColor]),outside);
  }
  ok('Nested answers survive repeated presentation toggles; content and outside typography unchanged');
  const tails=await p.locator('.tbox.s-speech .bubble').evaluateAll(els=>els.map(el=>({height:el.clientHeight,bottom:getComputedStyle(el,'::after').bottom,position:getComputedStyle(el,'::after').position})));
  assert(tails.every(t=>t.position==='absolute'&&t.bottom==='-7px'));assert(tails[1].height>tails[0].height);
  ok('Left/right speech tails stay anchored with wrapped and long text');
  await p.locator('.task-frame').screenshot({path:`${OUT}/screen-desktop.png`});
  await p.setViewportSize({width:390,height:844});
  await p.locator('.task-frame').screenshot({path:`${OUT}/screen-narrow.png`});
  assert(await p.locator('.task-frame').evaluate(el=>el.scrollWidth<=el.clientWidth+2));ok('390px lesson frame has no horizontal overflow');
  await p.setViewportSize({width:1300,height:900});

  // Exercise the actual insertion catalogue and renderer, not a hand-picked handful of nodes.
  const catalogue=await p.evaluate(()=>{
    const e=document.querySelector('.ProseMirror').editor;const docs=[],skipped=[];
    const interactive=new Set(['image','media','pdf','storyboard','linkcard','tt-org']);
    for(const c of window.COMMANDS) {
      if(interactive.has(c.key)){skipped.push({key:c.key,reason:'requires a file or external picker'});continue;}
      try {e.commands.setContent({type:'doc',content:[{type:'paragraph'}]});c.run(e);const doc=e.getJSON();
        if(JSON.stringify(doc)==='{"type":"doc","content":[{"type":"paragraph"}]}')skipped.push({key:c.key,reason:'selection or external action required'});
        else docs.push({key:c.key,doc});
      }catch(err){skipped.push({key:c.key,reason:String(err)});}
    }
    return {docs,skipped,total:window.COMMANDS.length};
  });
  const rendered=[];
  for(const {key,doc} of catalogue.docs) {
    await p.evaluate(doc=>window.setFixture(window.splitKey(doc).content),doc);await p.waitForTimeout(150);
    assert(await p.locator('.task-body').count(),key);rendered.push(key);
  }
  await writeFile(`${OUT}/catalogue.json`,JSON.stringify({total:catalogue.total,rendered,skipped:catalogue.skipped},null,2));
  assert(rendered.length>50);ok(`Actual insertion catalogue: ${rendered.length}/${catalogue.total} commands rendered; skips recorded explicitly`);
  await p.evaluate(()=>window.setFixture(window.fixture));
  const projections=await p.evaluate(()=>{
    const original=JSON.stringify(window.exportFixture);
    const adult=window.flattenTask(window.exportFixture);
    const explicit=window.flattenTask(window.exportFixture,'adult');
    const young=window.flattenTask(window.exportFixture,'young');
    return {adult,explicit,young,unchanged:original===JSON.stringify(window.exportFixture)};
  });
  assert.deepEqual(projections.adult,projections.explicit);assert.deepEqual(projections.adult.answers,projections.young.answers);assert.equal(projections.adult.marks,projections.young.marks);assert(projections.unchanged);
  ok('Adult default projection identical; Young projection preserves answers, marks and source JSON');
  for(const {paper,clear,columns,size,label} of [{paper:'A4',label:'A4'},{paper:'Letter',label:'Letter'},{paper:'A5',label:'A5'},{paper:'A4',clear:true,columns:2,size:'large',label:'A4-clear-large-two-columns'}]) {
    const html=await p.evaluate(async ({paper,clear,columns,size})=>window.worksheetHtml('Planning a visit',[{kind:'task',task:window.flattenTask(window.exportFixture,'young')}],{lessonStyle:'young',header:true,key:true,notes:true,paper,clear,size,columns:columns||1,accent:'#338399',className:'Teal class',origin:location.origin,sounds:await window.soundFixture()}),{paper,clear,columns,size});
    const print=await b.newPage();await print.setContent(html);await print.waitForFunction(()=>window.__laidOut===true);await print.evaluate(()=>document.fonts.ready);
    assert(await print.locator('.key-page').count()>0);assert((await print.locator('.key-page').innerText()).includes('Ask learners'));
    if(clear){assert((await print.locator('.tbox.s-sticky .tbox-body').first().evaluate(el=>getComputedStyle(el).fontFamily)).includes('Atkinson'));assert((await print.locator('.ipa').first().evaluate(el=>getComputedStyle(el).fontFamily)).includes('Lesson IPA'));}
    assert(await print.locator('.cut-page').count()>0);assert(await print.locator('.qr-code svg').count()>0);assert(await print.locator('.pic img').count()>0);
    const pages=await print.locator('.page').count();
    for(let i=0;i<pages;i++) await print.locator('.page').nth(i).screenshot({path:`${OUT}/print-${label}-${i+1}.png`});
    assert.equal(await print.locator('.page:not(.cut-page)').evaluateAll(els=>els.filter(el=>!el.querySelector('.unit')).length),0,'No blank print pages');
    const overflow=await print.locator('.col').evaluateAll(els=>els.map(el=>({w:el.scrollWidth-el.clientWidth,h:el.scrollHeight-el.clientHeight})).filter(x=>x.w>2||x.h>2));
    assert.deepEqual(overflow,[],`${paper} print overflow`);
    await print.close();ok(`${label} pagination, key and notes; no clipped print columns`);
  }
  const pdf=await p.evaluate(async()=>Array.from(await window.worksheetPdf(window.worksheetHtml('Planning a visit',[{kind:'task',task:window.flattenTask(window.exportFixture,'young')}],{lessonStyle:'young',header:true,key:true,notes:true,paper:'A5',columns:1,accent:'#338399',className:'Teal class',level:'A2',origin:location.origin,sounds:await window.soundFixture()}),'A5')));
  await writeFile(`${OUT}/young-learner-A5.pdf`,Buffer.from(pdf));ok('Actual worksheetPdf export produced for A5');
  assert.deepEqual(errors,[]);ok('No browser crashes');
  }
} catch (err) {
  await p.screenshot({path:`${OUT}/failure.png`,fullPage:true}).catch(()=>{});
  console.log('FAIL PAGE',p.url(),(await p.locator('body').innerText()).slice(0,1200));
  throw err;
} finally {
  await writeFile(`${OUT}/results.json`,JSON.stringify({passed:results,errors},null,2));
  await b.close();
}
