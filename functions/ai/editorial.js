import { GenerationError } from './errors.js';

export const editorialStandard = `Act as a demanding materials editor, not a supportive commentator. Judge the actual learner experience, not promises in the rationale.
INTEREST: Identify the concrete hook and payoff of every receptive text. Adult A1 learners are intelligent adults; simplify linguistic load, not the ideas. At B2 require genuine complexity, inference, stance or trade-offs. Reject interchangeable fictional profiles, trivial comprehension and paraphrase matching when pictures or contextual inference would serve better.
COMMUNICATION: Every speaking task needs a genuine information, opinion or experience gap, a reason to listen, and a visible outcome. Personal sharing must allow an invented or non-personal alternative. Information gaps require separate complete role cards with no disclosure in shared content. Check that the listener must use what they hear.
COHERENCE: Reuse meaningful source language for guided discovery; ask learners to highlight, sort or compare before explaining. Do not duplicate decontextualised sentences when the source can remain visible. Distinguish gist, detail, inference and response. A long integrated lesson needs substantial listening as well as reading unless the brief explicitly narrows the skill.
PRESENTATION: Use clear titles, short instructions, native lists, tables and relevant pictures. Avoid walls of text, cosmetic pictures and invented missing assets. Do not count a break as a learner activity. Scaffolds must remove a specific barrier within the learner task.
REALITY: Prefer verified real-world material for adults. Use only supplied verified source evidence for factual details about real people, quotations, figures and routines. Never invent URLs, imply a search happened when it did not, or treat model memory as verification. Adapt sources in original wording, keep a concise attribution and never reproduce a complete copyrighted article. Do not add unnecessary fictional-person disclaimers. If evidence is absent, do not present invented biographical facts as reality.
CHECKS: Solve every closed task independently. Check accepted alternatives, distractors, linguistic accuracy, role privacy, instructions, alignment and timing. A referenced image or recording must have an appropriate planned asset. A plan specification is not proof that the finished media is correct. Identify exactly which task has a defect and how to repair it. Score below 4 when a criterion needs substantive work; never inflate scores to pass. Critical errors include weak or missing communicative purpose, unusable source material, unsupported real-world claims, wrong keys, answer leakage and missing task dependencies.`;

export function needsEditorialRepair(review) {
  return review.criticalErrors.length>0 || review.checks.some(c=>c.score<4);
}

// Each paid operation is reserved first. Do not expose failed drafts as completed
// lessons or replace the caller's last accepted content when repair cannot pass.
export async function editUntilReady({value,review,repair,check,reserve,deadline,maxRepairs=2,now=Date.now}) {
  const usage=[];
  for(let round=0;round<=maxRepairs;round++) {
    if(deadline-now()<15000) throw new GenerationError('editorial');
    await reserve('review');
    const checked=await review(value,deadline-now()); usage.push(checked.usage);
    if(!needsEditorialRepair(checked.value)) return {value,review:checked.value,usage,repairs:round};
    if(round===maxRepairs || deadline-now()<30000) throw new GenerationError('editorial');
    await reserve('repair');
    const revised=await repair(value,checked.value,deadline-now());usage.push(revised.usage);
    check(revised.value);value=revised.value;
  }
  throw new GenerationError('editorial');
}
