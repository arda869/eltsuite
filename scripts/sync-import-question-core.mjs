// Compile the exact editor privacy/splitting implementation for the Node functions runtime.
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const result=await build({stdin:{contents:"export { splitKey, mergeKey } from './src/lib/questions.ts';",resolveDir:process.cwd(),sourcefile:'import-question-core-entry.js'},bundle:true,platform:'neutral',format:'esm',target:'es2022',write:false,legalComments:'none'});
const content='// Generated from src/lib/questions.ts and src/lib/pack.ts. Run node scripts/sync-import-question-core.mjs.\n'+result.outputFiles[0].text;
const file='functions/ai/import-question-core.js';
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==content)throw Error('Import answer splitting is out of sync. Run node scripts/sync-import-question-core.mjs.');console.log('Import key splitting matches the editor.');}
else await writeFile(file,content);
