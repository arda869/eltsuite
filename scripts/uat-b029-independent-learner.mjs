// Diagnostic-only production journey through a normal synthetic learner PIN.
// Temporarily reveals a private synthetic lesson and restores it in finally.
// Never print or screenshot the class code, learner name, PIN, token, script, or audio.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { chromium } = await import('playwright');

initializeApp({ projectId: 'lesson-lit' });
const db = getFirestore();
const classId = 'uJlrPEXiArJiZda43ZGr';
const itemId = 'Cto4kITllTmIGOTK93zi';
const taskId = 'tdQEJrry2Tn9MXt5sCr5';
const mediaId = 'TE0Hd68PLgfY1DLKHjWr';
const cls = db.doc(`classes/${classId}`);
const item = cls.collection('items').doc(itemId);
let browser;
let wasRevealed = false;

function assert(condition, message) {
  if (!condition) throw Error(message);
}

async function firestoreGet(path, token) {
  const url = `https://firestore.googleapis.com/v1/projects/lesson-lit/databases/(default)/documents/${path}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}

try {
  const [classSnap, itemSnap, taskSnap, mediaSnap, scriptSnap, learners] = await Promise.all([
    cls.get(), item.get(), item.collection('tasks').doc(taskId).get(), cls.collection('media').doc(mediaId).get(),
    cls.collection('mediaScripts').doc(mediaId).get(), cls.collection('learners').get(),
  ]);
  assert(classSnap.exists && itemSnap.exists && taskSnap.exists && mediaSnap.exists && scriptSnap.exists, 'B-029 fixture is incomplete.');
  assert(itemSnap.get('hidden') === true && itemSnap.get('locked') !== true, 'B-029 fixture is not safely Hidden and unlocked.');
  assert(taskSnap.get('hidden') === false && taskSnap.get('locked') === false, 'B-029 task is not available to a normal learner.');
  assert(scriptSnap.get('aiGenerated') === true && Array.isArray(scriptSnap.get('script')) && scriptSnap.get('script').length > 0, 'B-029 private AI script is missing.');
  assert(!Object.hasOwn(mediaSnap.data(), 'script'), 'B-029 public media contains a transcript.');
  assert(mediaSnap.get('public') === true && mediaSnap.get('kind') === 'audio', 'B-029 audio is not publicly playable.');
  const content = taskSnap.get('content');
  const modes = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (['media', 'inlineMedia'].includes(node.type) && node.attrs?.media === mediaId) modes.push(node.attrs.scriptMode ?? 'karaoke');
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(content);
  assert(modes.length > 0 && modes.every(mode => mode === 'none'), 'B-029 fixture is not a private-script placement.');
  const candidates = learners.docs.filter(doc => /privacy|uat|release|test/i.test(String(doc.get('displayName') || '')));
  let account;
  for (const learner of candidates) {
    const secret = await cls.collection('secrets').doc(learner.id).get();
    if (/^\d{4}$/.test(String(secret.get('pin') || '')) && learner.get('authUid')) {
      account = { id: learner.id, name: learner.get('displayName'), uid: learner.get('authUid'), pin: String(secret.get('pin')) };
      break;
    }
  }
  assert(account, 'No independent synthetic learner with a usable PIN is available.');
  const code = classSnap.get('classCode');
  assert(typeof code === 'string' && /^[A-Z]{3}-\d{3}$/.test(code), 'B-029 class code is invalid.');
  const config = await readFile(new URL('../src/lib/firebaseConfig.ts', import.meta.url), 'utf8');
  const publicApiKey = config.match(/apiKey:\s*"([^"]+)"/)?.[1];
  assert(publicApiKey, 'Firebase public web configuration is missing.');

  // Do not change visibility until the independent learner credentials and
  // browser are ready. A separate always() workflow step also restores Hidden.
  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('console', () => {}); // Intentionally suppress browser logs.
  await page.goto('https://learn.eltsuite.com/join', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('Join your class').waitFor({ timeout: 30000 });
  await item.update({ hidden: false });
  wasRevealed = true;
  assert((await item.get()).get('hidden') === false, 'Could not temporarily reveal B-029 fixture.');
  console.log('B-029: synthetic lesson temporarily shown for independent learner test.');

  await page.getByLabel('Class code').fill(code);
  await page.getByLabel('Your full name').fill(account.name);
  for (let i = 0; i < 4; i++) await page.getByLabel(`PIN digit ${i + 1}`).fill(account.pin[i]);
  await page.getByRole('button', { name: 'Join class' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/join'), { timeout: 45000 });
  assert(!(await page.getByRole('alert').filter({ hasText: /pin|code|connection|match/i }).count()), 'Normal PIN sign-in showed an error.');
  console.log('B-029: normal learner joined with class code, name and PIN.');

  await page.goto(`https://learn.eltsuite.com/learn/${itemId}?task=${taskId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const play = page.getByRole('button', { name: 'Play', exact: true }).first();
  await play.waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.mp .mp-play');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, null, { timeout: 45000 });
  assert(!(await page.locator('.mp-script-btn,.im-script,.kl').count()), 'Private script control or text is visible to learner before playback.');
  await play.click();
  await page.getByRole('button', { name: 'Pause', exact: true }).first().waitFor({ timeout: 10000 });
  const duration = Number(mediaSnap.get('duration'));
  assert(Number.isFinite(duration) && duration > 5 && duration < 300, 'B-029 fixture audio duration is invalid.');
  await page.waitForFunction(target => {
    const position = document.querySelector('.mp [role="slider"][aria-label="Position"]');
    return Number(position?.getAttribute('aria-valuenow') || 0) >= target;
  }, Math.max(3, Math.floor(duration) - 2), { timeout: Math.ceil(duration * 1000) + 20000 });
  assert(!(await page.locator('.mp-error,.mp-script-btn,.im-script,.kl').count()), 'Audio error or private script appeared during learner playback.');
  if (process.env.B029_SCREENSHOT) await page.screenshot({ path: process.env.B029_SCREENSHOT, fullPage: false });
  console.log('B-029: normal learner opened task and played existing AI audio to near completion; private script stayed hidden.');

  const email = `l_${account.id}@learners.lesson-lit.firebaseapp.com`;
  const password = `${code.toUpperCase()}#${account.pin}`;
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(publicApiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(30000),
  });
  assert(signIn.status === 200, `Independent learner token request failed (${signIn.status}).`);
  const token = await signIn.json();
  assert(token.localId === account.uid && typeof token.idToken === 'string', 'Independent learner token does not match the class member.');
  const [publicMedia, firstPart, privateScript] = await Promise.all([
    firestoreGet(`classes/${classId}/media/${mediaId}`, token.idToken),
    firestoreGet(`classes/${classId}/media/${mediaId}_p0`, token.idToken),
    firestoreGet(`classes/${classId}/mediaScripts/${mediaId}`, token.idToken),
  ]);
  assert(publicMedia.status === 200 && !Object.hasOwn(publicMedia.body.fields ?? {}, 'script'), 'Learner cannot read the public audio manifest safely.');
  assert(firstPart.status === 200 && !!firstPart.body.fields?.data, 'Learner cannot read a saved audio part.');
  assert(privateScript.status === 403, `Private script should be denied to learner (HTTP ${privateScript.status}).`);
  console.log('B-029: independent learner token read audio manifest/part; private transcript direct read was HTTP 403.');
  const callable = await fetch('https://us-central1-lesson-lit.cloudfunctions.net/mediaScriptAccess', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.idToken}` },
    body: JSON.stringify({ data: { classId, itemId, taskId, mediaId, action: 'read' } }), signal: AbortSignal.timeout(30000),
  });
  const result = await callable.json();
  assert(callable.status === 200 && result.result?.mode === 'none' && Array.isArray(result.result.script) && result.result.script.length === 0, 'Callable did not enforce the saved private-script mode.');
  console.log('B-029: deployed callable returned mode none and zero transcript lines to independent learner.');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (wasRevealed) {
    await item.update({ hidden: true });
    assert((await item.get()).get('hidden') === true, 'B-029 fixture remains visible; restore immediately.');
    console.log('B-029: synthetic lesson restored Hidden after live check.');
  }
}
