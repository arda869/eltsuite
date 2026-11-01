import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const copy = JSON.parse(readFileSync(new URL('../scripts/invitation-copy.json', import.meta.url)));
const base = process.env.TEST_BASE || 'http://localhost:5189';
const browser = await chromium.launch({headless:true, executablePath:process.env.SMOKE_BROWSER_PATH || undefined});
mkdirSync('test-results/invitations',{recursive:true});
try {
  for (const width of [1280,390]) {
    const context = await browser.newContext({viewport:{width,height:900}});
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.evaluate(()=>localStorage.setItem('mockfs',JSON.stringify({
      'inviteCodes/ABCD-EF23':{code:'ABCD-EF23',email:'mina@example.test',name:'Mina Chan',byName:'Alex Lee',orgName:'Example Academy',maxUses:1,uses:0,expires:Date.now()+86400000},
      'orgInvites/new':{email:'mina@example.test',name:'Mina Chan',byName:'Alex Lee',orgName:'Example Academy',status:'pending',existing:false},
      'orgInvites/existing':{email:'mina@example.test',name:'Mina Chan',byName:'Alex Lee',orgName:'Example Academy',status:'pending',existing:true},
    })));
    for(const route of ['/?code=ABCD-EF23','/invite/new','/invite/existing']) {
      await page.goto(base+route);
      await page.locator('.inv-intro').waitFor();
      await page.waitForFunction(()=>document.querySelector('input[type=email]')?.value==='mina@example.test');
      const existing=route.endsWith('existing');
      assert.equal(await page.locator('.inv-intro h1').textContent(),existing?'Join your colleagues at Example Academy':copy.title);
      if(!existing) for(const benefit of copy.benefits) assert.ok((await page.locator('.inv-intro').innerText()).includes(benefit));
      assert.equal(await page.getByText('Ask for an invitation',{exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.locator('.inv-intro a').click();
      assert.ok(page.url().endsWith('#teacher-sign-in'));
      await page.screenshot({path:`test-results/invitations/${width}-${existing?'existing':route.includes('code')?'code':'new'}.png`,fullPage:true});
    }
    await page.goto(base+'/?code=INVALID');
    await page.getByRole('alert').waitFor();
    assert.ok(await page.locator('.inv-intro').isVisible());
    await page.goto(base+'/invite/missing');
    await page.getByText('This invitation isn’t there any more').waitFor();
    await page.goto(base);
    await page.getByText('Made for English teachers',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('Invitation landing checks passed: code, new/existing organisation, invalid/missing invitation, normal welcome, desktop/mobile.');
} finally { await browser.close(); }
