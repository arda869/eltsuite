// Games: the editor, a live game with cards, balloons and moles on two phones, the results, a game
// inside a lesson task, and a learner playing it at their own pace inside the lesson.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mockFs = '/@fs' + process.cwd() + '/test/mock/firestore.ts';
  const part = async (name, f) => {
    try {
      await f();
    } catch (e) {
      say('PART FAILED', name, e.message.split('\n')[0]);
      await shot('failed-' + name).catch(() => {});
    }
  };
  const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
  const slides = [
    { id: 's1', kind: 'choice', seconds: 20, points: 1, skin: 'cards', content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'q1', prompt: 'Where do you go to borrow a book?', options: ['A bakery', 'A library', 'A bank', 'A garage'], correct: 1 } }] } },
    { id: 's2', kind: 'truefalse', seconds: 20, points: 2, skin: 'balloons', content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'q2', prompt: 'You can buy stamps at a post office.', options: ['True', 'False'], correct: 0 } }] } },
    { id: 's3', kind: 'choice', seconds: 30, points: 1, skin: 'moles', content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'q3', prompt: 'Where do you see a doctor?', options: ['A clinic', 'A cinema', 'A café', 'A gym'], correct: 0 } }] } },
    { id: 's4', kind: 'task', seconds: 45, points: 1, content: { type: 'doc', content: [para('Match the place to what you do there.'), { type: 'match', attrs: { id: 'q4', pairs: [{ left: 'cinema', right: 'watch a film' }, { left: 'gym', right: 'do exercise' }, { left: 'café', right: 'have a coffee' }], extras: [] } }] } },
  ];
  let quizId = '';
  await part('seed', async () => {
    quizId = await p.evaluate(
      async ({ mockFs, slides }) => {
        const { newSharedDoc } = await import('/src/lib/sharedDocs.ts');
        const { setDoc, doc } = await import(mockFs);
        const id = await newSharedDoc({ uid: 'teacher1', name: 'Arda' }, 'game', 'Places in town');
        await setDoc(doc({}, 'sharedDocs', id, 'game', 'main'), { version: 2, music: '', slides });
        return id;
      },
      { mockFs, slides },
    );
  });

  await part('editor', async () => {
    await p.goto(`${BASE}/games`);
    await wait(1500);
    await shot('games-files');
    await p.goto(`${BASE}/doc/${quizId}`);
    await p.getByRole('button', { name: 'Play live' }).waitFor({ timeout: 20000 });
    await p.getByRole('button', { name: /Where do you see a doctor/ }).click();
    await wait(1800);
    await shot('editor-whack-a-mole');
  });

  // Live, with two guests.
  let code = '';
  const phones = [];
  await part('live-lobby', async () => {
    await p.getByRole('button', { name: 'Play live' }).click();
    await p.waitForURL(/game-host/, { timeout: 20000 });
    await p.locator('.qz-code').waitFor();
    code = (await p.locator('.qz-code').innerText()).replace(/\D/g, '');
    for (const n of ['Mia', 'Leo']) {
      const ph = await ctx.newPage();
      await ph.setViewportSize({ width: 390, height: 844 });
      ph.on('pageerror', (e) => say('PHONE CRASH', e.message));
      await ph.goto(`${BASE}/game/${code}`);
      await ph.fill('#qz-name', n);
      await ph.getByRole('button', { name: 'Join' }).click();
      await ph.getByText('You’re in.').waitFor({ timeout: 15000 });
      phones.push(ph);
    }
    await wait(1000);
    await shot('host-lobby');
    await shot('phone-lobby', phones[0]);
  });
  const next = async () => (await p.locator('.qz-next').click(), await wait(400));
  const reveal = async () => (await p.locator('.qz-bars, .qz-split').first().waitFor({ timeout: 40000 }), await wait(1200));
  await part('q1-cards', async () => {
    await next();
    await phones[0].locator('.qz-card').first().waitFor({ timeout: 10000 });
    await wait(800);
    await shot('host-question-cards');
    await shot('phone-question-cards', phones[0]);
    await phones[0].locator('button.qz-card').nth(1).click();
    await phones[1].locator('button.qz-card').nth(2).click();
    await reveal();
    await shot('host-reveal');
    await shot('phone-reveal-right', phones[0]);
    await shot('phone-reveal-wrong', phones[1]);
    await next();
    await wait(1200);
    await shot('phone-leaderboard', phones[1]);
  });
  await part('q2-balloons', async () => {
    await next();
    await phones[0].locator('.qz-balloon').first().waitFor({ timeout: 10000 });
    await wait(1500);
    await shot('host-balloons');
    await shot('phone-balloons', phones[0]);
    for (const ph of phones) await ph.locator('.qz-balloon').first().click({ force: true });
    await reveal();
    await next();
    await wait(600);
  });
  await part('q3-moles', async () => {
    await next();
    await phones[0].locator('.qz-mole').first().waitFor({ state: 'attached', timeout: 10000 });
    await wait(1600);
    await shot('host-moles');
    await shot('phone-moles', phones[0]);
    for (const ph of phones) {
      await ph.locator('.qz-mole.up').first().waitFor({ timeout: 10000 });
      await ph.locator('.qz-mole.up').first().click({ force: true });
    }
    await reveal();
    await next();
    await wait(600);
  });
  await part('q4-task', async () => {
    await next();
    await phones[0].getByRole('button', { name: 'Send answer' }).waitFor({ timeout: 10000 });
    await wait(600);
    await shot('phone-task', phones[0]);
    for (const ph of phones) await ph.getByRole('button', { name: 'Send answer' }).click();
    await reveal();
    await shot('phone-task-reveal', phones[0]);
    await next(); // the winners
    await wait(7000);
    await shot('host-podium');
    await shot('phone-final', phones[0]);
    await p.locator('.qz-next').click();
    await p.waitForURL(/game-results/, { timeout: 15000 });
    await wait(1500);
    await shot('results');
  });
  for (const ph of phones) await ph.close().catch(() => {});

  // A game inside a lesson task.
  await part('lesson-block', async () => {
    await p.evaluate(
      async ({ mockFs, slides, demo }) => {
        const { setDoc, doc } = await import(mockFs);
        const { splitKey } = await import('/src/lib/questions.ts');
        const { blockFromQuiz } = await import('/src/quiz/model.ts');
        const block = blockFromQuiz({ version: 2, slides: slides.slice(0, 3), music: '' }, 'Places quick game', 'gblock1');
        const { content, key } = splitKey({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read about the town, then play the game.' }] }, block] });
        const base = ['classes', demo.classId, 'items', demo.itemId, 'tasks', 'gametask'];
        await setDoc(doc({}, ...base), { kind: 'task', title: 'Town game', instructions: 'Play the game.', content, order: -1, hidden: false, locked: false });
        await setDoc(doc({}, ...base, 'private', 'key'), key);
      },
      { mockFs, slides, demo },
    );
    await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
    await wait(2500);
    const t = p.getByText('Town game').first();
    if (await t.count()) await t.click();
    await p.locator('.ig-editor').first().waitFor({ timeout: 15000 });
    await wait(800);
    await shot('lesson-game-block', p.locator('.ig-editor').first());
    await p.getByRole('button', { name: 'Edit the game' }).click();
    await p.locator('.qe-dialog').waitFor({ timeout: 10000 });
    await wait(800);
    await shot('lesson-game-editor');
    await p.getByRole('button', { name: 'Cancel' }).click();
    await p.getByRole('button', { name: 'Let learners play at their own pace' }).first().click();
    await p.locator('.ig-running').first().waitFor({ timeout: 15000 });
    await wait(500);
    await shot('lesson-game-running', p.locator('.ig-editor').first());
  });

  // A learner plays it at their own pace, inside the lesson.
  await part('learner-own-pace', async () => {
    const l = await ctx.newPage();
    await l.setViewportSize({ width: 430, height: 900 });
    l.on('pageerror', (e) => say('LEARNER CRASH', e.message));
    await l.goto(`${BASE}/dev.html?as=Mia`);
    await wait(2500);
    await l.goto(`${BASE}/learn/${demo.itemId}`);
    await wait(3000);
    const t = l.getByText('Town game').first();
    if (await t.count()) await t.click();
    await l.getByRole('button', { name: 'Join the game' }).waitFor({ timeout: 15000 });
    await shot('learner-lesson-join', l);
    await l.getByRole('button', { name: 'Join the game' }).click();
    await l.locator('button.qz-card').first().waitFor({ timeout: 15000 });
    await wait(500);
    await shot('learner-own-pace-question', l);
    await l.locator('button.qz-card').nth(1).click();
    await l.locator('.qz-banner').waitFor({ timeout: 10000 });
    await wait(600);
    await shot('learner-own-pace-result', l);
    await l.getByRole('button', { name: 'Next question' }).click();
    await l.locator('.qz-balloon').first().waitFor({ timeout: 10000 });
    await wait(1800);
    await shot('learner-own-pace-balloons', l);
    await l.locator('.qz-balloon').first().click({ force: true });
    await l.locator('.qz-banner').waitFor({ timeout: 10000 });
    await l.getByRole('button', { name: 'Next question' }).click();
    await l.locator('.qz-mole.up').first().waitFor({ timeout: 10000 });
    await l.locator('.qz-mole.up').first().click({ force: true });
    await l.locator('.qz-banner').waitFor({ timeout: 10000 });
    await l.getByRole('button', { name: 'See how you did' }).click();
    await wait(1500);
    await shot('learner-own-pace-done', l);
    await l.close();
    // The teacher's view of progress.
    const href = await p.locator('.ig-editor a').first().getAttribute('href');
    if (href) {
      await p.goto(BASE + href);
      await wait(2000);
      await shot('host-own-pace-progress');
    }
  });
}
