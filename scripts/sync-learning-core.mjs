import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const result=await build({stdin:{contents:"export { questionIds, scoreQuestion, isAnswered } from './src/lib/questions.ts';",resolveDir:process.cwd(),sourcefile:'learning-core-entry.js'},bundle:true,platform:'neutral',format:'esm',target:'es2022',write:false,legalComments:'none'});
const content='// Generated from the learner renderer scoring implementation. Run node scripts/sync-learning-core.mjs.\n'+result.outputFiles[0].text;
const file='functions/learning/question-core.js';
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==content)throw Error('Learning evidence scoring is out of sync.');}else await writeFile(file,content);
