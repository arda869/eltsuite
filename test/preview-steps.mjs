// Check by eye: the public pages in the workspace's look, the logo, Settings at full width, the
// Games top bar, inline studio forms beside other document elements, every game and skin, and a
// young learners' lesson.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const safe = async (name, fn) => { try { await fn(); } catch (e) { say('FAILED', name, e.message.split('\n')[0]); } };

  // Signed out.
  const guest = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
  const g = await guest.newPage();
  for (const [path, name, w] of [['/', 'public-home', 1440], ['/explore', 'public-explore', 1440], ['/pricing', 'public-pricing', 1440], ['/signin', 'public-signin', 1440], ['/', 'public-home-phone', 390]]) {
    await safe(name, async () => {
      await g.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await g.goto(BASE + path); await g.waitForTimeout(2500);
      say('LOGO', name, await g.evaluate(() => { const e = document.querySelector('.wm-name'); return e ? getComputedStyle(e).font : 'none'; }));
      await shot(name, g);
    });
  }
  await guest.close();

  // Signed in.
  const cls = demo.classId, item = demo.itemId;
  for (const [path, name] of [['/settings', 'settings'], ['/games', 'games'], ['/', 'home']]) {
    await safe(name, async () => {
      await p.goto(BASE + path); await p.waitForTimeout(2500);
      say('TOPBAR', name, await p.locator('.suite-mark').first().innerText().catch(() => '?'));
      await shot(name);
    });
  }

  // A Collab document with a callout, a question and studio forms.
  await safe('collab', async () => {
    await p.goto(BASE + '/archive'); await p.waitForTimeout(2000);
    await p.click('text=+ New');
    const [tab] = await Promise.all([ctx.waitForEvent('page'), p.click('[role=menuitem]:has-text("Collab document")')]);
    await tab.waitForLoadState(); await tab.setViewportSize({ width: 1440, height: 900 });
    const ed = tab.getByRole('textbox', { name: 'Document text', exact: true });
    await ed.waitFor();
    await ed.click(); await tab.keyboard.type('Week 3 reflection');
    for (const key of ['callout', 'studio-reflection', 'studio-plan', 'studio-language']) {
      await ed.press('ControlOrMeta+End'); await ed.press('Enter');
      await tab.keyboard.type('/' + key); await tab.waitForTimeout(400);
      await tab.getByRole('option').first().click(); await tab.waitForTimeout(500);
      if (key === 'callout') await tab.keyboard.type('Bring the observation notes to Thursday’s meeting.');
    }
    await tab.waitForTimeout(800);
    say('TEXTAREAS', JSON.stringify(await tab.evaluate(() => [...document.querySelectorAll('.studio-form textarea')].slice(0, 4).map((t) => `${t.rows}r ${Math.round(t.getBoundingClientRect().height)}px`))));
    await tab.evaluate(() => window.scrollTo(0, 0));
    await shot('collab-top', tab);
    await tab.locator('[data-studio-kind="reflection"]').scrollIntoViewIfNeeded();
    await shot('collab-forms', tab);
    await tab.locator('[data-studio-kind="language"]').scrollIntoViewIfNeeded();
    await shot('collab-forms-2', tab);
    await tab.close();
  });

  // Young learners: switch the demo class to the young learners' style and open a lesson.
  await safe('young', async () => {
    await p.evaluate(async (id) => {
      const { getClass, updateClass } = await import('/src/lib/classes.ts');
      const c = await getClass(id);
      if (c) await updateClass(c, { lessonStyle: 'young' });
      else { const fs = await import('/test/mock/firestore.ts'); await fs.setDoc(fs.doc({}, 'classes', id), { lessonStyle: 'young' }, { merge: true }); }
    }, cls);
    await p.goto(`${BASE}/class/${cls}/lesson/${item}`); await p.waitForTimeout(3000);
    await shot('young-editor');
    await p.goto(`${BASE}/dev.html?as=Mia`); await p.waitForTimeout(2500);
    await p.goto(`${BASE}/learn/${item}`); await p.waitForTimeout(3500);
    await shot('young-learner');
    await p.mouse.wheel(0, 700); await p.waitForTimeout(600);
    await shot('young-learner-2');
  });

  // Every game in the wooden skin, then one game in every skin.
  const types = ['shark', 'taxi', 'drive', 'blocks', 'show', 'targets', 'pinball', 'maze', 'hangman', 'search', 'slice', 'moles', 'wager', 'auction', 'pairs', 'cloud'];
  await p.setViewportSize({ width: 1280, height: 860 });
  for (const t of types) {
    await safe('game ' + t, async () => {
      await p.goto(`${BASE}/test/games-gallery.html?type=${t}&theme=wood`); await p.waitForTimeout(1500);
      await shot('game-' + t);
    });
  }
  for (const th of ['arcade', 'garden', 'space', 'paper']) {
    await safe('theme ' + th, async () => {
      await p.goto(`${BASE}/test/games-gallery.html?type=show&theme=${th}`); await p.waitForTimeout(1500);
      await shot('theme-' + th);
    });
  }
  // Answering: what a right and a wrong answer look like.
  await safe('answer', async () => {
    await p.goto(`${BASE}/test/games-gallery.html?type=show&theme=garden`); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'library', exact: false }).first().click();
    await p.waitForTimeout(250); await shot('answer-right');
    await p.waitForTimeout(1200); await shot('answer-right-settled');
    await p.getByRole('button', { name: 'Next round' }).click(); await p.waitForTimeout(400);
    await p.getByRole('button', { name: /museum/ }).first().click();
    await p.waitForTimeout(200); await shot('answer-wrong');
    await p.goto(`${BASE}/test/games-gallery.html?type=cloud&theme=space`); await p.waitForTimeout(1500); await shot('cloud-space');
    await p.goto(`${BASE}/test/games-gallery.html?type=show&theme=arcade`); await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1500); await shot('show-phone');
  });
}
