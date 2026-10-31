// Optional live-model evaluation. Run only with a deliberately supplied test key and model.
// Uses synthetic fixtures and the production provider and coaching instructions.
import { writeFile } from 'node:fs/promises';
import { generate } from './provider.js';
import { coachInstructions, dialogueFramework } from './coach-contract.js';
import { coachCases } from './coach-cases.js';
if (process.env.COACH_EVAL_LIVE !== '1' || !process.env.OPENAI_API_KEY || !process.env.ELT_AI_MODEL) {
  console.log(`Prepared ${coachCases.length} synthetic coaching cases. Live evaluation is off. Set COACH_EVAL_LIVE=1, OPENAI_API_KEY and ELT_AI_MODEL deliberately to run it.`);
  process.exit(0);
}
const output = process.env.COACH_EVAL_OUTPUT;
if (!output) throw Error('Choose COACH_EVAL_OUTPUT for the review report.');
const schema = { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string', minLength: 1, maxLength: 6000 } } };
const rows = [];
for (const scenario of coachCases) {
  const generated = await generate({ apiKey: process.env.OPENAI_API_KEY, model: process.env.ELT_AI_MODEL, schema, name: 'teaching_coach', instructions: coachInstructions + '\n' + dialogueFramework, input: { mode: scenario.mode, prompt: scenario.prompt, context: scenario.context, history: [] } });
  rows.push({ ...scenario, reply: generated.value.reply, usage: generated.usage, review: 'Human review required against every criterion. Do not treat generation as a passing evaluation.' });
  console.log(`Prepared response for ${scenario.id}.`);
}
await writeFile(output, JSON.stringify({ model: process.env.ELT_AI_MODEL, at: new Date().toISOString(), scenarios: rows }, null, 2));
console.log('Review every response. A report alone does not certify coaching quality.');
