// Real React navigation and storage reload; AI/Firebase are simulated.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const base='http://127.0.0.1:5221';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5221','--host','127.0.0.1'],{stdio:'ignore',detached:true});let browser,p;
try{
 for(let i=0;i<180;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 // Finish the shared editor prebundle before the seed page can trigger a reload.
 for(let i=0;i<120;i++){
  const editor=await fetch(base+'/test/document-tools-check.ts').then(r=>r.ok?r.text():'',()=> '');
  if(editor.includes('@tiptap_core.js'))break;
  await new Promise(r=>setTimeout(r,500));
 }
 browser=await chromium.launch({executablePath:process.env.SMOKE_BROWSER_PATH||undefined});p=await browser.newPage({viewport:{width:1400,height:960}});p.setDefaultTimeout(45000);p.setDefaultNavigationTimeout(180000);
 await p.goto(base+'/dev.html?seed&as=teacher');await p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return !!localStorage.getItem('mockdemo');},null,{timeout:180000});await p.waitForLoadState('networkidle');
 const demo=await p.evaluate(()=>JSON.parse(localStorage.getItem('mockdemo')));
 const url=base+'/development?section=coach&classId='+demo.classId+'&itemId='+demo.itemId;
 await p.goto(url);const question='How can I make instructions clearer?';
 await p.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill(question);await p.getByRole('button',{name:'Send',exact:true}).click();
 await p.getByText('What did you notice about learners’ responses? What other explanation might fit what happened?',{exact:true}).waitFor();
 const sourceLinks=p.locator('.coach-chat-sources');await sourceLinks.waitFor();assert.equal(await sourceLinks.locator('ul,li').count(),0,'Sources must not appear as a bulleted list');await sourceLinks.locator('summary').click();await sourceLinks.getByRole('link',{name:'Selected activity'}).waitFor();
 assert.equal(await p.getByText('This activity is attached.').count(),0,'The lesson-context notice must stay hidden');
 await p.reload();await p.getByText(question,{exact:true}).waitFor();
 await p.getByRole('button',{name:'Pin chat',exact:true}).click();const panel=p.getByRole('complementary',{name:'Pinned Teacher’s Companion'});await panel.getByText(question,{exact:true}).waitFor();
 await p.goto(base+'/classes');await panel.getByText(question,{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Minimise Teacher’s Companion'}).click();assert.equal(await panel.getByRole('textbox',{name:'Message Teacher’s Companion'}).isVisible(),false);
 await p.reload();await panel.getByRole('button',{name:'Expand Teacher’s Companion'}).click();await panel.getByText(question,{exact:true}).waitFor();
 await panel.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill('Would a short demonstration help?');await panel.getByRole('button',{name:'Send',exact:true}).click();await panel.getByRole('log').getByText('Would a short demonstration help?',{exact:true}).waitFor();await panel.getByRole('button',{name:'New chat',exact:true}).waitFor({state:'visible'});
 const log=panel.getByRole('log');await log.evaluate(el=>{el.style.flex='0 0 110px';el.style.height='110px';el.style.minHeight='110px';el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
 await panel.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill('Reading earlier messages');await p.waitForTimeout(100);
 assert.equal(await log.evaluate(el=>el.scrollTop),0,'Typing while reading earlier messages must not jump to the bottom');
 await panel.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill('');
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('mockCoachLastRequest')).history.length===2);
 await panel.getByRole('button',{name:'New chat',exact:true}).click();await panel.getByRole('log').getByText(question,{exact:true}).waitFor({state:'hidden'});
 await panel.getByRole('button',{name:'History',exact:true}).click();await panel.getByRole('navigation',{name:'Saved coaching conversations'}).locator('.coach-history-open').filter({hasText:question}).click();await panel.getByRole('log').getByText('Would a short demonstration help?',{exact:true}).waitFor();await panel.getByRole('button',{name:'New chat',exact:true}).waitFor({state:'visible'});
 await panel.getByRole('button',{name:'Unpin Teacher’s Companion'}).click();assert.equal(await panel.count(),0);
 await p.evaluate(async demo=>{(await import('/src/components/ChatDock.tsx')).dockOpen('teaching-coach',false,{lessonContext:{classId:demo.classId,itemId:demo.itemId}});},demo);
 const dock=p.locator('.dock-win[data-win="teaching-coach"]');await dock.waitFor();
 await dock.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill('Can you help with this lesson?');await dock.getByRole('button',{name:'Send',exact:true}).click();
 await dock.getByRole('log').getByText('What did you notice about learners’ responses? What other explanation might fit what happened?',{exact:true}).waitFor();
 await dock.getByRole('button',{name:'New chat',exact:true}).waitFor({state:'visible'});
 await dock.getByRole('button',{name:'New chat',exact:true}).click();assert.equal(await panel.count(),0,'New chat in Messages must not open the pinned panel');assert.equal(await dock.count(),1,'New chat must remain in the same Messages window');
 await dock.getByRole('log').getByText('Can you help with this lesson?',{exact:true}).waitFor({state:'hidden'});
 await dock.getByRole('button',{name:'Close',exact:true}).click();await dock.waitFor({state:'detached'});
 await p.goto(url);await p.getByText(question,{exact:true}).waitFor();
 await p.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill('Draft stays when pinned');await p.getByRole('button',{name:'Pin chat',exact:true}).click();assert.equal(await panel.getByRole('textbox',{name:'Message Teacher’s Companion'}).inputValue(),'Draft stays when pinned');await panel.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill('Shared draft from the small panel');await p.waitForFunction(()=>[...document.querySelectorAll('textarea[aria-label="Message Teacher’s Companion"]')].every(t=>t.value==='Shared draft from the small panel')); 
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:'/tmp/coach-history-mobile.png'});await p.setViewportSize({width:1400,height:960});await p.screenshot({path:'/tmp/coach-history-desktop.png'});
 console.log('PASS saved conversation reload; recent context; pinned panel navigation, minimise/reload, full history, new chat retention, draft handoff and mobile fit. AI/Firebase simulated.');
}catch(e){console.log(await p?.locator('body').innerText());throw e;}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}
