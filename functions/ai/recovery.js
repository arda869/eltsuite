import { GenerationError } from './errors.js';

// Exactly one repair of structurally complete content. Never retry billing,
// transport, refusal or schema failures, whose usage may be unknown.
export async function generateChecked({generate, args, decode, check, reserveRepair, deadline, repairTimeoutMs=90000}) {
  const first=await generate(args), usage=[first.usage];
  let value;
  try {value=decode(first.value);check(value);return {value,usage};} catch (issue) {
    const remaining=deadline?deadline-Date.now():repairTimeoutMs;
    if(remaining<1000)throw new GenerationError('timeout');
    await reserveRepair();
    // The complete generated activities already contain their source material.
    // Avoid duplicating the full teaching plan in the bounded repair request.
    const repairInput={...args.input};
    if(repairInput.approvedPlan) repairInput.approvedPlan={title:repairInput.approvedPlan.title,stages:repairInput.approvedStageSlots};
    const repaired=await generate({...args,timeoutMs:Math.min(repairTimeoutMs,remaining),input:{...repairInput,repair:{issue:issue.message,output:first.value}},instructions:args.instructions+' Repair the supplied output to satisfy the reported validation issue. Preserve the approved stages and all otherwise valid content. Return the complete corrected output.'});
    usage.push(repaired.usage);
    try {value=decode(repaired.value);check(value);} catch {throw new GenerationError('content');}
    return {value,usage};
  }
}
