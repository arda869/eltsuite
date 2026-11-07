// The add menus (task editor gallery, Questions dropdown, Collab gallery) and the young learner
// lesson, as teachers and learners see them.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mockFs = '/@fs' + process.cwd() + '/test/mock/firestore.ts';
  const safe = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      say('STEP', name, 'failed:', e.message.split('\n')[0]);
    }
  };

  // ---- Task editor: the full gallery, every group, then a search ------------------------------------
  await safe('gallery', async () => {
    await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
    await p.getByRole('button', { name: 'Everything you can add, with pictures' }).first().waitFor({ timeout: 30000 });
    await p.getByRole('button', { name: 'Everything you can add, with pictures' }).first().click();
    await p.locator('.gallery').waitFor();
    await wait(600);
    const groups = await p.locator('.gallery-nav button').allInnerTexts();
    say('groups', JSON.stringify(groups));
    for (let i = 0; i < groups.length; i++) {
      await p.locator('.gallery-nav button').nth(i).click();
      await wait(350);
      await shot('gallery-' + String(i).padStart(2, '0'), p.locator('.gallery'));
    }
    await p.fill('.gallery-head input', 'match');
    await wait(400);
    await shot('gallery-search-match', p.locator('.gallery'));
    await p.fill('.gallery-head input', 'listen');
    await wait(400);
    await shot('gallery-search-listen', p.locator('.gallery'));
    await p.keyboard.press('Escape');
  });

  // ---- Task editor: the Questions dropdown --------------------------------------------------------------
  await safe('questions', async () => {
    await p.getByRole('button', { name: 'Questions' }).first().click();
    await p.locator('.question-pop').waitFor();
    await wait(500);
    await shot('questions-top', p);
    await p.locator('.question-pop-list').evaluate((el) => (el.scrollTop = 600));
    await wait(300);
    await shot('questions-scrolled', p);
    await p.fill('.question-pop input', 'gap');
    await wait(300);
    await shot('questions-search', p);
    await p.keyboard.press('Escape');
  });

  // ---- Collab: the gallery ---------------------------------------------------------------------------
  await safe('collab', async () => {
    const id = await p.evaluate(async () => {
      const { newSharedDoc } = await import('/src/lib/sharedDocs.ts');
      return newSharedDoc({ uid: 'teacher1', name: 'Arda' }, 'doc', 'Notes');
    });
    await p.goto(`${BASE}/doc/${id}`);
    await wait(4000);
    const insert = p.getByRole('button', { name: /Insert/ }).first();
    await insert.click();
    await p.locator('.gallery').waitFor({ timeout: 10000 });
    await wait(500);
    const groups = await p.locator('.gallery-nav button').allInnerTexts();
    say('collab groups', JSON.stringify(groups));
    for (let i = 0; i < groups.length; i++) {
      await p.locator('.gallery-nav button').nth(i).click();
      await wait(350);
      await shot('collab-' + String(i).padStart(2, '0'), p.locator('.gallery'));
    }
    await p.fill('.gallery-head input', 'table');
    await wait(400);
    await shot('collab-search', p.locator('.gallery'));
  });

  // ---- Young learners: the teacher's editor and a learner's lesson ------------------------------------
  await safe('young', async () => {
    await p.evaluate(async ([mockFs, classId]) => {
      const { updateDoc, doc } = await import(mockFs);
      await updateDoc(doc({}, 'classes', classId), { lessonStyle: 'young' });
    }, [mockFs, demo.classId]);
    await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
    await wait(3500);
    await shot('young-editor', p);
    // The task icon: open the picker, choose Listen.
    await p.locator('.yl-pick-btn').first().click();
    await wait(500);
    await shot('young-icon-picker', p);
    await p.locator('.yl-pick-opt', { hasText: 'Listen' }).first().click();
    await wait(1500);
    await shot('young-icon-listen', p.locator('.frame-head').first());
    await p.locator('.yl-pick-btn').first().click();
    await p.locator('.yl-pick-opt', { hasText: 'No icon' }).first().click();
    await wait(1200);
    await shot('young-icon-none', p.locator('.frame-head').first());
    await p.locator('.yl-pick-btn').first().click();
    await p.locator('.yl-pick-opt', { hasText: 'Choose for me' }).first().click();
    await wait(800);
    const learner = await ctx.newPage();
    await learner.goto(`${BASE}/learn/${demo.itemId}?as=Mia`);
    await wait(4000);
    await shot('young-learner', learner);
    // A task with questions: the owl and the progress, then checking.
    const practice = learner.locator('.task-pick', { hasText: 'Practice' }).first();
    if (await practice.count()) {
      await practice.click();
      await wait(1500);
      await shot('young-learner-practice', learner);
      const opt = learner.locator('.task-body .opt, .task-body .c-opt').first();
      if (await opt.count()) {
        await opt.click();
        await wait(600);
      }
      const check = learner.getByRole('button', { name: /Check/ }).first();
      if (await check.count()) {
        await check.click();
        await wait(1500);
        await shot('young-learner-checked', learner);
      }
    }
    await learner.setViewportSize({ width: 820, height: 1180 });
    await wait(800);
    await shot('young-learner-tablet', learner);
  });
}
