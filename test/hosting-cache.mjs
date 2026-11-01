// Check real HTTP responses, including routes rewritten to index.html.
import assert from 'node:assert/strict';
const base=process.env.HOSTING_CACHE_TEST_BASE||'http://127.0.0.1:5197';
let entry;
for(const path of ['/','/admin?tab=ai','/recordings','/studio/video/new']){
 const r=await fetch(base+path,{cache:'no-store'}),html=await r.text();
 assert.equal(r.status,200,path);
 assert.match(r.headers.get('cache-control')??'',/no-cache/,path+' must revalidate its app entry');
 assert.ok(!/max-age=3600(?:,|$)/.test(r.headers.get('cache-control')??''),path+' must not retain old HTML for an hour');
 entry??=html.match(/\/assets\/index-[^" ]+\.js/)?.[0];
}
assert.ok(entry,'Hashed application entry exists');
const asset=await fetch(base+entry);assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control')??'',/immutable/,'Content-addressed assets keep their cache');
const version=await fetch(base+'/version.json');assert.match(version.headers.get('cache-control')??'',/no-store/);
const worker=await fetch(base+'/sw.js');assert.match(worker.headers.get('cache-control')??'',/no-cache/);
console.log('PASS: app routes revalidate, hashed assets remain immutable, version never caches, service worker revalidates.');
