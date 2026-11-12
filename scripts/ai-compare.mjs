// Side-by-side test of two text models on real AI requests, for choosing each job's model in
// functions/ai/models.js. Run from the functions folder so firebase-admin resolves:
//
//   cd functions && OPENAI_API_KEY=… GOOGLE_APPLICATION_CREDENTIALS=… \
//     node ../scripts/ai-compare.mjs --jobs importKinds,task_ideas --per-job 20 --a gpt-6.1-sol --b gpt-6.1-terra
//
// It reads requests copied by functions/ai/capture.js (aiCaptures, only while ELT_AI_CAPTURE=on),
// sends each one, unchanged apart from the model, to both models, and writes ai-compare.html:
// a blind page where the owner rates each pair without knowing which model wrote which. Rate on the
// page, then "Download ratings". Summarise with:
//
//   node ../scripts/ai-compare.mjs --summarise ratings.json
//
// A job can move to model B when B is rated no worse in at least 90% of pairs, has no answer
// marked wrong that A got right, and is faster. Nothing here changes the live app.
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

if (arg('summarise')) {
  const rows = JSON.parse(fs.readFileSync(arg('summarise'), 'utf8'));
  const by = {};
  for (const r of rows) {
    const j = (by[r.job] ??= { pairs: 0, bNoWorse: 0, bWrongOnly: 0, msA: [], msB: [] });
    j.pairs++;
    if (r.verdict !== 'a') j.bNoWorse++;
    if (r.wrong === 'b') j.bWrongOnly++;
    j.msA.push(r.msA); j.msB.push(r.msB);
  }
  const median = (xs) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)] ?? 0;
  console.log('job · pairs · B no worse · B wrong where A right · median seconds A → B · verdict');
  for (const [job, j] of Object.entries(by)) {
    const ok = j.bNoWorse / j.pairs >= 0.9 && j.bWrongOnly === 0 && median(j.msB) < median(j.msA);
    console.log(`${job} · ${j.pairs} · ${Math.round((100 * j.bNoWorse) / j.pairs)}% · ${j.bWrongOnly} · ${(median(j.msA) / 1000).toFixed(1)} → ${(median(j.msB) / 1000).toFixed(1)} · ${ok ? 'move to B' : 'keep A'}`);
  }
  process.exit(0);
}

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const db = getFirestore(initializeApp());
const key = process.env.OPENAI_API_KEY;
if (!key) throw Error('Set OPENAI_API_KEY.');
const jobs = String(arg('jobs', '')).split(',').filter(Boolean);
const perJob = Number(arg('per-job', '20'));
const A = arg('a', 'gpt-6.1-sol'), B = arg('b', 'gpt-6.1-terra');

async function send(body, model) {
  const started = Date.now();
  const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, model, store: false }), signal: AbortSignal.timeout(300000) });
  const json = await res.json().catch(() => ({}));
  const text = (json.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* shown as not valid */ }
  return { ms: Date.now() - started, ok: res.ok && json.status === 'completed' && !!parsed, output: parsed ?? (json.error?.message || text || 'No answer'), usage: json.usage ?? null };
}

const pairs = [];
for (const job of jobs) {
  const snap = await db.collection('aiCaptures').where('name', '==', job).limit(perJob).get();
  for (const doc of snap.docs) {
    const c = doc.data();
    const body = JSON.parse(c.body);
    if (c.images) {
      const imgs = (await doc.ref.collection('aiCaptureImages').get()).docs.sort((x, y) => Number(x.id) - Number(y.id)).map((d) => d.data().data);
      body.input = [{ role: 'user', content: [{ type: 'input_text', text: body.input }, ...imgs.map((image_url) => ({ type: 'input_image', image_url, detail: 'high' }))] }];
    }
    const [a, b] = await Promise.all([send(body, A), send(body, B)]);
    pairs.push({ id: doc.id, job, request: String(body.input?.[0]?.content?.[0]?.text ?? body.input).slice(0, 4000), images: c.images, a, b, flip: Math.random() < 0.5 });
    console.log(job, doc.id, `${A} ${(a.ms / 1000).toFixed(1)}s`, `${B} ${(b.ms / 1000).toFixed(1)}s`);
  }
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const show = (r) => `<pre>${esc(typeof r.output === 'string' ? r.output : JSON.stringify(r.output, null, 2))}</pre>${r.ok ? '' : '<p class="bad">Not a valid answer</p>'}`;
const html = `<!doctype html><meta charset="utf-8"><title>Model comparison</title>
<style>body{font:15px/1.5 system-ui;margin:24px;max-width:1300px}section{border:1px solid #ddd;border-radius:12px;padding:16px;margin:16px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}pre{white-space:pre-wrap;max-height:420px;overflow:auto;background:#f7f6f3;padding:10px;border-radius:8px;font-size:12.5px}.bad{color:#a33}details pre{max-height:200px}label{margin-right:14px}</style>
<h1>Which answer is better?</h1><p>Each pair answers the same real request. You aren't told which model wrote which. Pick the better one, or "Same", and tick if an answer is wrong. Ratings are kept in this browser until you download them.</p>
<button id="dl">Download ratings</button>
${pairs.map((p, i) => { const [L, R] = p.flip ? [p.b, p.a] : [p.a, p.b]; return `<section data-i="${i}"><b>${esc(p.job)}</b> · ${i + 1} of ${pairs.length}<details><summary>The request</summary><pre>${esc(p.request)}</pre></details><div class="two"><div><h3>Answer 1</h3>${show(L)}</div><div><h3>Answer 2</h3>${show(R)}</div></div><p><label><input type="radio" name="v${i}" value="1"> 1 is better</label><label><input type="radio" name="v${i}" value="same"> Same</label><label><input type="radio" name="v${i}" value="2"> 2 is better</label> · <label><input type="checkbox" data-w="1"> 1 is wrong</label><label><input type="checkbox" data-w="2"> 2 is wrong</label></p></section>`; }).join('')}
<script>
const META=${JSON.stringify(pairs.map((p) => ({ job: p.job, flip: p.flip, msA: p.a.ms, msB: p.b.ms })))};
const KEY='ai-compare-ratings';let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
document.querySelectorAll('section').forEach(s=>{const i=s.dataset.i,r=saved[i]||{};if(r.v)s.querySelector('input[value="'+r.v+'"]').checked=true;s.querySelectorAll('[data-w]').forEach(c=>c.checked=!!(r.w||{})[c.dataset.w]);s.addEventListener('change',()=>{const v=s.querySelector('input[type=radio]:checked')?.value,w={};s.querySelectorAll('[data-w]').forEach(c=>w[c.dataset.w]=c.checked);saved[i]={v,w};try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}});});
document.getElementById('dl').onclick=()=>{const rows=META.map((m,i)=>{const r=saved[i];if(!r||!r.v)return null;const side=x=>x==='same'?'same':((x==='1')!==m.flip?'a':'b');const wa=m.flip?r.w['2']:r.w['1'],wb=m.flip?r.w['1']:r.w['2'];return {job:m.job,verdict:side(r.v),wrong:wb&&!wa?'b':wa&&!wb?'a':wa&&wb?'both':'',msA:m.msA,msB:m.msB};}).filter(Boolean);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,1)],{type:'application/json'}));a.download='ratings.json';a.click();};
</script>`;
fs.writeFileSync('ai-compare.html', html);
console.log(`Wrote ai-compare.html with ${pairs.length} pairs.`);
