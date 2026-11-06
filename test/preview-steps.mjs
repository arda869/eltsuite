// Live quiz show: a full game with the real quiz service against the stand-ins. The editor, the big
// screen from lobby to podium, three guests on phones, the results, the lesson menu and Super Admin.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // The public homepage first (signed out, its own browser): close-ups and the enlarged picture.
  try {
    const pub = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
    const h = await pub.newPage();
    await h.goto(`${BASE}/?site=main`);
    await h.locator('.pub-all-list').waitFor({ timeout: 30000 });
    await h.locator('.pub-all-list').scrollIntoViewIfNeeded();
    await wait(2500);
    await shot('home-all-in-one-place', h.locator('.pub-all'));
    const song = h.locator('.pub-detail').filter({ has: h.locator('img[src*="song"]') });
    if (await song.count()) {
      await song.first().scrollIntoViewIfNeeded();
      await wait(1500);
      await shot('home-song-detail', h.locator('.pub-figure.pub-detail').last().locator('xpath=ancestor::section[1]'));
    }
    await h.locator('.pub-frame').first().click();
    await wait(1200);
    await shot('home-enlarged', h);
    await pub.close();
  } catch (e) {
    say('homepage shots failed', e.message);
  }
  const mockFs = '/@fs' + process.cwd() + '/test/mock/firestore.ts';
  // A saved quiz with every kind of question.
  const quizId = await p.evaluate(async (mockFs) => {
    const { newSharedDoc } = await import('/src/lib/sharedDocs.ts');
    const { setDoc, doc } = await import(mockFs);
    const db = {};
    const id = await newSharedDoc({ uid: 'teacher1', name: 'Arda' }, 'game', 'Places in town');
    const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
    await setDoc(doc(db, 'sharedDocs', id, 'game', 'main'), {
      version: 2,
      music: '',
      slides: [
        { id: 's1', kind: 'choice', seconds: 20, points: 1, content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'q1', prompt: 'Where do you go to borrow a book?', options: ['A bakery', 'A library', 'A bank', 'A garage'], correct: 1 } }] } },
        { id: 's2', kind: 'truefalse', seconds: 10, points: 2, content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'q2', prompt: 'You can buy stamps at a post office.', options: ['True', 'False'], correct: 0 } }] } },
        { id: 's3', kind: 'type', seconds: 30, points: 1, content: { type: 'doc', content: [para('Where do you see a doctor?'), { type: 'paragraph', content: [{ type: 'gap', attrs: { id: 'q3', answers: ['hospital', 'clinic'] } }] }] } },
        { id: 's4', kind: 'task', seconds: 45, points: 1, content: { type: 'doc', content: [para('Match the place to what you do there.'), { type: 'match', attrs: { id: 'q4', pairs: [{ left: 'cinema', right: 'watch a film' }, { left: 'gym', right: 'do exercise' }, { left: 'café', right: 'have a coffee' }], extras: [] } }] } },
        { id: 's5', kind: 'poll', seconds: 20, points: 0, content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'q5', prompt: 'Which place do you like most?', options: ['Park', 'Museum', 'Market'], correct: -1 } }] } },
      ],
    });
    return id;
  }, mockFs);
  say('quiz', quizId);
  await p.goto(`${BASE}/games`);
  await wait(1500);
  await shot('quiz-files');
  await p.goto(`${BASE}/doc/${quizId}`);
  await p.getByRole('button', { name: 'Host live' }).waitFor({ timeout: 20000 });
  await wait(800);
  await shot('editor-choice');
  await p.getByRole('button', { name: /Match the place/ }).click();
  await wait(1500);
  await shot('editor-any-class-question');
  await p.getByRole('button', { name: /Where do you see a doctor/ }).click();
  await wait(500);
  await shot('editor-type-answer');

  // Host it.
  await p.getByRole('button', { name: 'Host live' }).click();
  await p.waitForURL(/quiz-host/, { timeout: 20000 });
  await p.locator('.qz-code').waitFor();
  const code = (await p.locator('.qz-code').innerText()).replace(/\D/g, '');
  say('code', code);
  await wait(800);
  await shot('host-lobby-empty');

  // Three guests join on phones.
  const names = ['Mia', 'Leo', 'Sam'];
  const phones = [];
  for (const n of names) {
    const ph = await ctx.newPage();
    await ph.setViewportSize({ width: 390, height: 844 });
    ph.on('pageerror', (e) => say('PHONE CRASH', e.message));
    await ph.goto(`${BASE}/quiz`);
    await ph.locator('#qz-code').waitFor({ timeout: 20000 });
    if (n === 'Mia') await shot('phone-code', ph);
    await ph.fill('#qz-code', code);
    await ph.getByRole('button', { name: 'Next' }).click();
    await ph.fill('#qz-name', n);
    if (n === 'Mia') await shot('phone-nickname', ph);
    await ph.getByRole('button', { name: 'Join' }).click();
    await ph.getByText('You’re in.').waitFor({ timeout: 15000 });
    phones.push(ph);
  }
  await shot('phone-lobby', phones[0]);
  await wait(1200);
  await shot('host-lobby-players');

  const next = async () => {
    await p.locator('.qz-next').click();
    await wait(400);
  };
  // Question 1: multiple choice.
  await next();
  await wait(900);
  await shot('host-countdown');
  await p.locator('.qz-tiles').waitFor({ timeout: 10000 });
  await wait(1500);
  await shot('host-question');
  await phones[0].locator('.qz-answer-btn').first().waitFor({ timeout: 10000 });
  await shot('phone-answer-buttons', phones[0]);
  await phones[0].locator('.qz-answer-btn').nth(1).click();
  await wait(700);
  await shot('phone-answer-sent', phones[0]);
  await phones[1].locator('.qz-answer-btn').nth(1).click();
  await phones[2].locator('.qz-answer-btn').nth(2).click();
  await p.locator('.qz-bars').waitFor({ timeout: 15000 });
  await wait(1500);
  await shot('host-reveal-choice');
  await shot('phone-right', phones[0]);
  await shot('phone-wrong', phones[2]);
  await next();
  await wait(1600);
  await shot('host-leaderboard');
  await shot('phone-leaderboard', phones[1]);

  // Question 2: true or false, double points.
  await next();
  await phones[0].locator('.qz-answer-btn').first().waitFor({ timeout: 10000 });
  await wait(300);
  await shot('host-true-false');
  for (const ph of phones) await ph.locator('.qz-answer-btn').first().click();
  await p.locator('.qz-bars').waitFor({ timeout: 15000 });
  await wait(1200);
  await shot('phone-streak', phones[0]);
  await next();
  await wait(1200);
  await shot('host-leaderboard-2');

  // Question 3: type the answer.
  await next();
  await phones[0].locator('.qz-phone-task input').first().waitFor({ timeout: 10000 });
  await wait(300);
  await shot('host-type-answer');
  await phones[0].locator('.qz-phone-task input').first().fill('Hospital');
  await shot('phone-type-answer', phones[0]);
  await phones[0].getByRole('button', { name: 'Send answer' }).click();
  await phones[1].locator('.qz-phone-task input').first().fill('clinic');
  await phones[1].getByRole('button', { name: 'Send answer' }).click();
  await phones[2].locator('.qz-phone-task input').first().fill('school');
  await phones[2].getByRole('button', { name: 'Send answer' }).click();
  await p.locator('.qz-split').waitFor({ timeout: 15000 });
  await wait(1000);
  await shot('host-reveal-typed');
  await next();
  await wait(800);

  // Question 4: matching, a class question type.
  await next();
  await phones[0].locator('.qz-phone-task').waitFor({ timeout: 10000 });
  await wait(600);
  await shot('host-matching');
  await shot('phone-matching', phones[0]);
  for (const ph of phones) await ph.getByRole('button', { name: 'Send answer' }).click();
  await p.locator('.qz-split').waitFor({ timeout: 15000 });
  await wait(800);
  await shot('host-reveal-matching');
  await next();
  await wait(800);

  // Question 5: a poll.
  await next();
  await phones[0].locator('.qz-answer-btn').first().waitFor({ timeout: 10000 });
  for (const [i, ph] of phones.entries()) await ph.locator('.qz-answer-btn').nth(i % 3).click();
  await p.locator('.qz-bars').waitFor({ timeout: 15000 });
  await wait(1000);
  await shot('host-poll');
  await next(); // show the winners
  await wait(7000);
  await shot('host-podium');
  await shot('phone-final', phones[0]);
  await p.locator('.qz-next').click(); // end and see results
  await p.waitForURL(/quiz-results/, { timeout: 15000 });
  await p.locator('.qr-table').waitFor({ timeout: 15000 });
  await wait(600);
  await shot('results');
  for (const ph of phones) await ph.close();

  // In a class lesson: Activities → Live quiz.
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await wait(3000);
  const act = p.getByRole('button', { name: /Activities/ });
  if (await act.count()) {
    await act.first().click();
    await p.getByRole('menuitem', { name: /Live quiz/ }).click();
    await p.locator('.lq-dialog').waitFor({ timeout: 10000 });
    await wait(600);
    await shot('lesson-live-quiz');
  } else {
    say('No Activities button in the lesson editor; teach mode may be needed.');
    await shot('lesson');
  }

  // Super Admin → Sounds for everyone.
  await p.evaluate(async (mockFs) => {
    const { setDoc, doc } = await import(mockFs);
    await setDoc(doc({}, 'superAdmins', 'teacher@example.com'), { name: 'Preview' });
  }, mockFs);
  await p.goto(`${BASE}/admin?tab=defaults`);
  await wait(3000);
  await shot('super-admin-music');
}
