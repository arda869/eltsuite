import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {separateSong} from '../../functions/songs/separate.js';
const input=process.argv[2];assert.ok(input,'Supply a local MP3 fixture');console.time('separate');
const result=await separateSong(await fs.readFile(input),p=>console.log('progress',Math.round(p*100)));console.timeEnd('separate');
assert.ok(result.vocals.length>10000);assert.ok(result.instrumental.length>10000);assert.notDeepEqual(result.vocals,result.instrumental);
await fs.mkdir('outputs/stems',{recursive:true});for(const stem of ['vocals','instrumental'])await fs.writeFile('outputs/stems/'+stem+'.mp3',result[stem]);
console.log(JSON.stringify({duration:result.duration,vocalsBytes:result.vocals.length,instrumentalBytes:result.instrumental.length,memory:process.memoryUsage().rss}));
