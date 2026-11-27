import test from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { suiteScriptRawAssetPath } from '../src/lib/suiteScriptAssetScan.ts';
import { suiteScriptChecksum, suiteScriptId, validSuiteScriptId } from '../functions/suitescript/id.js';

const bundled = await build({ entryPoints: ['src/lib/suiteScriptDraft.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const testBundle = new URL('./.suite-script-draft-test-bundle.mjs', import.meta.url);
await writeFile(testBundle, bundled.outputFiles[0].text);
const { createSuiteScriptDraft } = await import(testBundle.href);
await unlink(testBundle);
const bundleBuilt = await build({ entryPoints: ['src/lib/suiteScriptBundle.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const bundleUrl = new URL('./.suite-script-bundle-test-bundle.mjs', import.meta.url);
await writeFile(bundleUrl, bundleBuilt.outputFiles[0].text);
const { parseSuiteScriptBundle, toSuiteScriptBundle } = await import(bundleUrl.href);
await unlink(bundleUrl);
const keyBuilt = await build({ entryPoints: ['src/lib/questions.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const keyUrl = new URL('./.suite-script-key-test-bundle.mjs', import.meta.url);
await writeFile(keyUrl, keyBuilt.outputFiles[0].text);
const { splitKey } = await import(keyUrl.href);
await unlink(keyUrl);
const hubBuilt = await build({ entryPoints: ['src/resourceHub/suiteScriptHubApply.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const hubUrl = new URL('./.suite-script-hub-test-bundle.mjs', import.meta.url);
await writeFile(hubUrl, hubBuilt.outputFiles[0].text);
const { applySuiteScriptBundleToHubDraft, hubSectionToSuiteScriptTask } = await import(hubUrl.href);
await unlink(hubUrl);
const parserBundle = await build({ entryPoints: ['src/lib/suiteScript.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const parserFile = new URL('./.suite-script-parser-test-bundle.mjs', import.meta.url);
await writeFile(parserFile, parserBundle.outputFiles[0].text);
const { parseSuiteScript, toSuiteScript, suiteScriptMessageSafe, SUITE_SCRIPT_MAX_CHARS } = await import(parserFile.href);
await unlink(parserFile);

const labels = { gap: 'Gap fill', 'choice:radio': 'Multiple choice, as a list', 'choice:dropdown': 'Multiple choice in line' };
const fixture = `SuiteScript v1
@heading("At reception")

Listen for the @bold("room number"). Then compare your answer with a partner.

@question(
  type: "Multiple choice, as a list",
  prompt: "Which room is ready now?",
  options: ["Room 14", "Room 40", "Neither room"],
  teacherOnly: { answer: "Room 40" }
)

@heading("Check what you heard")

Say @stress("four", "teen", stressed: 2) and @stress("for", "ty", stressed: 1).

@numbered(
  "Choose what matters most.",
  "Discuss both rooms.",
  "Agree on a room."
)`;

test('Friday fixture parses prose, marks, native question, private answer and one-based stress', () => {
  const parsed = parseSuiteScript(fixture, labels);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.content[0].type, 'heading');
  const sentence = parsed.content.find(node => node.content?.some(child => child.marks?.some(mark => mark.type === 'bold')));
  assert.equal(sentence.content.find(child => child.marks?.some(mark => mark.type === 'bold')).text, 'room number');
  const question = parsed.content.flatMap(node => node.content ?? []).find(node => node.type === 'choice');
  assert.equal(question.attrs.options[1], 'Room 40');
  assert.equal(question.attrs.correct, 1);
  const stress = parsed.content.flatMap(node => node.content ?? []).filter(node => node.type === 'stress');
  assert.deepEqual(stress.map(node => node.attrs.stressed), [1, 0]);
  assert.equal(parsed.content.at(-1).type, 'orderedList');
  assert.equal(parsed.content.at(-1).content.length, 3);
});
test('plain-text intermediary round-trips rich marks, answers and Unicode; ordinary notation remains literal', () => {
  const original = [
    { type: 'paragraph', content: [
      { type: 'text', text: '你好 **literal** #1 | IPA /ə/ @mentor ' },
      { type: 'text', text: 'room number', marks: [{ type: 'bold' }] },
      { type: 'choice', attrs: { id: 'original', display: 'radio', options: ['Paris', 'Rome'], correct: 1 } },
    ] },
    { type: 'paragraph', content: [{ type: 'stress', attrs: { syllables: ['for', 'ty'], stressed: 0, style: 'box' } }] },
  ];
  const plain = toSuiteScript(original, labels);
  assert.match(plain, /^SuiteScript v1\n/);
  assert.match(plain, /@@mentor/);
  const cloned = String(plain); // no HTML clipboard data
  const parsed = parseSuiteScript(cloned, labels);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.content, original);
});

test('multiline timeline creates stable internal IDs and round-trips every mark kind without exposing IDs', () => {
  const source = `SuiteScript v1
@timeline(
  title: "A timeline",
  sentence: "We lived there for years.",
  now: 625,
  showNow: false,
  ends: false,
  marks: [
    {kind: "event", x: 120, label: "arrived"},
    {kind: "point", x: 170, side: "below", color: "#3d6fb6"},
    {kind: "wave", x: 200, x2: 350, label: "living"},
    {kind: "period", x: 360, x2: 480, side: "below"},
    {kind: "repeat", x: 490, x2: 570, count: 7, label: "often"},
    {kind: "arrow", x: 650, x2: 750, color: "accent"},
    {kind: "question", x: 820, label: "maybe"}
  ]
)`;
  const first = parseSuiteScript(source, labels);
  assert.deepEqual(first.errors, []);
  assert.equal(first.content[0].type, 'timeline');
  assert.deepEqual(first.content[0].attrs.items.map(item => item.kind), ['event', 'point', 'wave', 'period', 'repeat', 'arrow', 'question']);
  assert.equal(first.content[0].attrs.items[4].count, 7);
  const internalIds = [first.content[0].attrs.id, ...first.content[0].attrs.items.map(item => item.id)];
  assert.equal(new Set(internalIds).size, 8);
  assert.ok(internalIds.every(id => /^suiteScript-\d+$/.test(id)));
  assert.deepEqual(first.content, parseSuiteScript(source, labels).content, 'generated IDs must be deterministic');
  const copied = toSuiteScript(first.content, labels);
  assert.match(copied, /@timeline\(\n  title:/);
  assert.doesNotMatch(copied, /\bid\s*:/);
  assert.doesNotMatch(copied, /suiteScript-\d+/);
  assert.deepEqual(parseSuiteScript(copied, labels), first);
});

test('timeline keeps multiple named events and a named period through copy and paste', () => {
  const source = `SuiteScript v1
@timeline(
  title: "Past perfect",
  sentence: "The film had started when we arrived.",
  marks: [
    {kind: "event", x: 220, label: "had started"},
    {kind: "event", x: 400, label: "we arrived", side: "below"},
    {kind: "period", x: 220, x2: 400, label: "before we arrived"}
  ]
)`;
  const parsed = parseSuiteScript(source, labels);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.content[0].attrs.items.map(item => item.label), ['had started', 'we arrived', 'before we arrived']);
  assert.deepEqual(parsed.content[0].attrs.items.map(item => item.kind), ['event', 'event', 'period']);
  const copy = toSuiteScript(parsed.content, labels);
  assert.doesNotMatch(copy, /\bid\s*:/);
  assert.deepEqual(parseSuiteScript(copy, labels), parsed);

  const manyMarks = Array.from({ length: 101 }, (_, index) => `{kind: "event", x: ${30 + index * 9}, label: "Event ${index + 1}"}`).join(', ');
  const crowded = parseSuiteScript(`SuiteScript v1\n@timeline(marks: [${manyMarks}])`, labels);
  assert.deepEqual(crowded.errors, []);
  assert.equal(crowded.content[0].attrs.items.length, 101);
});

test('checked file commands never serialize raw class media IDs or document keys', () => {
  const cases = [
    [{ type: 'media', attrs: { media: 'private-audio', archiveId: 'private-archive', kind: 'audio', suiteRef: 'ELTSUITE-0001-0002-0003-0006' } }, '@audio'],
    [{ type: 'pdfBlock', attrs: { src: 'file:private-pdf', from: 'private-pdf', suiteRef: 'ELTSUITE-0001-0002-0003-0006' } }, '@pdf'],
    [{ type: 'collab', attrs: { id: 'private-id', docKey: 'private-doc', fileDoc: 'private-file', suiteRef: 'ELTSUITE-0001-0002-0003-0006' } }, '@collab'],
    [{ type: 'paragraph', content: [{ type: 'picture', attrs: { src: 'media:private-picture', alt: 'A landscape', suiteRef: 'ELTSUITE-0001-0002-0003-0006' } }] }, '@image'],
  ];
  for (const [node, command] of cases) {
    const source = toSuiteScript([node], labels);
    assert.ok(source.includes(command), command);
    assert.doesNotMatch(source, /private-(?:audio|archive|pdf|doc|file|picture|id)/);
  }
});

test('checked media keeps safe presentation settings and picture captions', () => {
  const ref = 'ELTSUITE-6042-9173-8562-3460';
  const original = [
    { type: 'media', attrs: { suiteRef: ref, media: 'private-audio', archiveId: 'private-archive', kind: 'audio', title: 'Listen closely', scriptMode: 'karaoke', plays: 2, size: 'm' } },
    { type: 'paragraph', content: [{ type: 'picture', attrs: { suiteRef: ref, src: 'media:private-image', alt: 'A station', size: 'l', crop: '.1 .2 .7 .6', filter: 'warm', w: 340 }, content: [{ type: 'text', text: 'At the station' }] }] },
    { type: 'pdfBlock', attrs: { suiteRef: ref, src: 'file:private-pdf', from: 'private-pdf', title: 'Worksheet', pages: [{ w: 595, h: 842 }], first: 1 } },
  ];
  const source = toSuiteScript(original, labels);
  assert.doesNotMatch(source, /private-(?:audio|archive|image|pdf)/);
  const parsed = parseSuiteScript(source, labels);
  assert.deepEqual(parsed.errors, []);
  const [sound, pictureBlock, pdf] = parsed.content;
  assert.equal(sound.attrs.title, 'Listen closely');
  assert.equal(sound.attrs.scriptMode, 'karaoke');
  assert.equal(sound.attrs.plays, 2);
  const picture = pictureBlock.content[0];
  assert.equal(picture.attrs.alt, 'A station');
  assert.equal(picture.attrs.crop, '.1 .2 .7 .6');
  assert.equal(picture.attrs.size, 'l');
  assert.equal(picture.attrs.w, 340);
  assert.equal(picture.content[0].text, 'At the station');
  assert.equal(pdf.attrs.title, 'Worksheet');
  assert.deepEqual(pdf.attrs.pages, [{ w: 595, h: 842 }]);
});

test('checked inline audio and video stay inline after a source roundtrip', () => {
  const ref = 'ELTSUITE-6042-9173-8562-3460';
  for (const kind of ['audio', 'video']) {
    const original = [{ type: 'paragraph', content: [
      { type: 'text', text: 'Play this: ' },
      { type: 'inlineMedia', attrs: { suiteRef: ref, media: 'private-media', archiveId: 'private-archive', kind, title: 'Clip', plays: 2 } },
      { type: 'text', text: ' then discuss.' },
    ] }];
    const source = toSuiteScript(original, labels);
    assert.match(source, new RegExp(`@${kind}\\([^\\n]+inline: true`));
    assert.doesNotMatch(source, /private-(?:media|archive)/);
    const parsed = parseSuiteScript(source, labels);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.content[0].content[1].type, 'inlineMedia');
    assert.equal(parsed.content[0].content[1].attrs.title, 'Clip');
    assert.equal(parsed.content[0].content[1].attrs.plays, 2);
    assert.equal(parsed.content[0].content[1].attrs.kind, kind);
  }
});

test('nested picture and audio fields cannot bypass SuiteScript asset validation', () => {
  const cases = [
    [{ type: 'pickCard', attrs: { picture: { src: 'media:private-image' } } }, 'attrs.picture.src'],
    [{ type: 'communicativeActivity', attrs: { settings: { versions: [{ picture: { src: 'media:private-image' } }] } } }, 'attrs.settings.versions[0].picture.src'],
    [{ type: 'pq', attrs: { data: { images: ['https://example.org/private.png'] } } }, 'attrs.data.images[0]'],
    [{ type: 'dictCut', attrs: { data: { image: 'data:image/png;base64,AAA' } } }, 'attrs.data.image'],
    [{ type: 'ipa', attrs: { audioId: 'class-owned-recording' } }, 'attrs.audioId'],
    [{ type: 'text', text: 'A word', marks: [{ type: 'definition', attrs: { image: 'media:private-definition' } }] }, 'marks[0].attrs.image'],
  ];
  for (const [node, path] of cases) assert.equal(suiteScriptRawAssetPath(node), path);
  assert.equal(suiteScriptRawAssetPath({ type: 'linkCard', attrs: { url: 'https://example.org/public-page' } }), null);
});

test('timeline syntax rejects invalid marks and values without partially applying a draft', () => {
  const bad = [
    ['kind', 'marks: [{kind: "dragon", x: 300}]', /valid kind/],
    ['position', 'marks: [{kind: "event", x: 1001}]', /between 30 and 970/],
    ['span', 'marks: [{kind: "period", x: 300}]', /needs an x2/],
    ['repeat count', 'marks: [{kind: "repeat", x: 300, x2: 500, count: 13}]', /count must be 2–12/],
    ['hidden id', 'marks: [{id: "external", kind: "point", x: 300}]', /unknown field: id/],
    ['boolean', 'showNow: "false", marks: []', /true or false/],
    ['now', 'now: -1, marks: []', /between 30 and 970/],
  ];
  for (const [name, args, expected] of bad) {
    const parsed = parseSuiteScript(`SuiteScript v1\nA valid opening line.\n@timeline(${args})`, labels);
    assert.deepEqual(parsed.content, [], name);
    assert.match(parsed.errors[0], /Line 3:/, name);
    assert.match(parsed.errors[0], expected, name);
  }
});

test('malformed commands and invalid stress leave no partial parsed content', () => {
  const wrong = parseSuiteScript('SuiteScript v1\nFine text.\n@stress("for", "ty", stressed: 3)', labels);
  assert.equal(wrong.content.length, 0);
  assert.match(wrong.errors[0], /Line 3/);
  assert.equal(parseSuiteScript('Plain text @bold("word")', labels).content.length, 0);
});

test('unknown @ notation and teaching symbols stay literal; hostile and oversized drafts do not execute', () => {
  globalThis.__suiteScriptRan = false;
  const unknown = parseSuiteScript('SuiteScript v1\n@mentor(John) **bold** #tag [x] | /ʃ/ @@bold("visible")', labels);
  assert.deepEqual(unknown.errors, []);
  assert.equal(unknown.content[0].content[0].text, '@mentor(John) **bold** #tag [x] | /ʃ/ @bold("visible")');
  const hostile = parseSuiteScript('SuiteScript v1\n@element(data: { type: "paragraph", content: [{ type: "text", text: "<script>globalThis.__suiteScriptRan=true</script>" }] })', labels);
  assert.deepEqual(hostile.errors, []);
  assert.equal(globalThis.__suiteScriptRan, false);
  assert.equal(parseSuiteScript('SuiteScript v1\n' + 'x'.repeat(SUITE_SCRIPT_MAX_CHARS), labels).content.length, 0);
});

test('learner-visible message projection removes private keys and opaque content', () => {
  const parsed = parseSuiteScript(fixture, labels);
  const safe = suiteScriptMessageSafe(parsed.content);
  assert.doesNotMatch(JSON.stringify(safe), /correct|teacherOnly|Room 40.*correct/);
  assert.match(JSON.stringify(safe), /Room 14 \/ Room 40/);
  const opaque = suiteScriptMessageSafe([{ type: 'teacherNote', content: [{ type: 'text', text: 'PRIVATE ANSWER' }] }]);
  assert.doesNotMatch(JSON.stringify(opaque), /PRIVATE ANSWER/);
});

test('SuiteScript question answer is stored in the private key, not learner task content', () => {
  const parsed = parseSuiteScript(fixture, labels);
  const stored = splitKey({ type: 'doc', content: parsed.content });
  assert.equal(stored.key['suiteScript-1'].correct, 1);
  assert.equal(JSON.stringify(stored.content).includes('"correct":1'), false);
  assert.equal(JSON.stringify(stored.content).includes('"teacherOnly"'), false);
});

test('12 digit checksum detects single digit and adjacent swaps, preserving leading zeroes', () => {
  const id = suiteScriptId('000100020003');
  assert.equal(id, `ELTSUITE-0001-0002-0003-${suiteScriptChecksum('000100020003')}`);
  assert.equal(validSuiteScriptId(id), true);
  assert.equal(validSuiteScriptId(id.replace('0002', '0003')), false);
  assert.equal(validSuiteScriptId(id.replace('0002', '0020')), false);
});

test('scoped SuiteScript draft validates preview and applies atomically only to its original version', () => {
  const schema = new Schema({
    nodes: { doc: { content: 'block+' }, paragraph: { group: 'block', content: 'inline*' }, text: { group: 'inline' } },
    marks: { bold: {}, italic: {}, underline: {}, strike: {} },
  });
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] }) });
  const editor = { schema, get state() { return state; }, getJSON: () => state.doc.toJSON(), view: { dispatch(tr) { state = state.apply(tr); } } };
  const draft = createSuiteScriptDraft(editor, {}, 'field');
  assert.deepEqual(draft.preview('SuiteScript v1\nNew @bold("text")').errors, []);
  const applied = draft.apply('SuiteScript v1\nNew @bold("text")');
  assert.equal(applied.applied, true, applied.errors.join('; '));
  assert.equal(state.doc.textContent, 'New text');
  assert.equal(draft.apply('SuiteScript v1\nOverwritten').applied, false);
  assert.equal(state.doc.textContent, 'New text');
});

test('explicit whole-task and whole-activity drafts preserve instructions, private notes and question keys', () => {
  const task = {
    title: 'Welcome exchange',
    kind: 'task',
    layout: 'two',
    afterCheck: 'retry',
    showScore: true,
    hidden: false,
    locked: true,
    colScroll: 'together',
    paper: { gap: 'medium', lines: 3, show: 'both', icon: 'none' },
    anchor: 'welcome',
    identity: { id: 'opening', name: 'Activation', colour: '#a74d37', icon: 'spark' },
    instructions: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ask your partner.' }] }],
    content: parseSuiteScript(fixture, labels).content,
    teacherNotes: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lead in with real names.' }] }],
    paperInstructions: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write the answer.' }] }],
  };
  const single = parseSuiteScriptBundle(toSuiteScriptBundle({ kind: 'task', task }, labels), labels);
  assert.deepEqual(single.errors, []);
  assert.deepEqual(single.bundle, { kind: 'task', task });
  const activity = { title: 'Meeting people', level: 'A2', aim: 'Ask about places', minutes: 30, summary: 'A pair exchange', focus: 'Questions', tasks: [task, { ...task, title: 'Follow-up' }] };
  const parsed = parseSuiteScriptBundle(toSuiteScriptBundle({ kind: 'activity', activity }, labels), labels);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.bundle, { kind: 'activity', activity });
  assert.equal(parseSuiteScriptBundle('SuiteScript v1\n@task("A", learnerVersion: "B")\n@endtask()', labels).bundle, null);
  assert.match(parseSuiteScriptBundle('SuiteScript v1\n@task("A")\n@content()\nHello', labels).errors[0], /Missing @endtask/);
});

test('whole Hub activity carries metadata and teacher notes; selected A edit preserves B and version metadata', () => {
  const task = { title: 'A', kind: 'task', layout: 'two', hidden: true, locked: true, paper: { gap: 'medium', lines: 3, show: 'both', icon: 'none' }, anchor: 'step-one', identity: { id: 'new', name: 'New', colour: '#bb5533', icon: 'spark' }, instructions: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ask.' }] }], content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A answer' }] }], teacherNotes: [{ type: 'paragraph', content: [{ type: 'text', text: 'Private lead in' }] }], paperInstructions: [] };
  const draft = { title: 'Old', level: 'B1', summary: 'Old summary', focus: 'Old focus', minutes: 20, sections: [
    { id: 'a', title: 'Old A', audience: 'learner', kind: 'task', identity: { id: 'original', name: 'Original', colour: '#333333', icon: 'check' }, versionGroup: 'pair', versionLabel: 'Learner A', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
    { id: 'b', title: 'B', audience: 'learner', kind: 'task', versionGroup: 'pair', versionLabel: 'Learner B', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B remains' }] }] } },
  ] };
  const changed = applySuiteScriptBundleToHubDraft(draft, { kind: 'task', task }, 'a');
  assert.equal(changed.sections[0].versionGroup, 'pair');
  assert.equal(changed.sections[0].versionLabel, 'Learner A');
  assert.deepEqual(changed.sections[0].identity, draft.sections[0].identity);
  assert.equal(changed.sections[0].suiteScriptTaskMeta.layout, 'two');
  assert.deepEqual(hubSectionToSuiteScriptTask(changed.sections[0], changed.sections).paper, task.paper);
  assert.equal(hubSectionToSuiteScriptTask(changed.sections[0], changed.sections).hidden, true);
  assert.deepEqual(changed.sections.at(-1), draft.sections[1]);
  assert.equal(changed.sections[1].audience, 'teacher');
  assert.equal(changed.sections[1].content.content[0].content[0].text, 'Private lead in');
  assert.equal(draft.sections.length, 2);
  const activity = { title: 'Meeting people', level: 'A2', aim: 'Talk', minutes: 30, summary: 'Welcome', focus: 'Countries', tasks: [task] };
  const whole = applySuiteScriptBundleToHubDraft(draft, { kind: 'activity', activity });
  assert.equal(whole.title, activity.title);
  assert.equal(whole.level, activity.level);
  assert.equal(whole.summary, activity.summary);
  assert.equal(whole.focus, activity.focus);
  assert.equal(whole.aim, activity.aim);
  assert.equal(whole.minutes, activity.minutes);
  assert.equal(whole.sections.length, 2);
  assert.deepEqual(draft.sections[1], changed.sections.at(-1));
  assert.throws(() => applySuiteScriptBundleToHubDraft(draft, { kind: 'task', task: { ...task, kind: 'section' } }, 'a'), /no section-heading/);
});
