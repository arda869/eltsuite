// Summaries describe observed responses, never inferred ability or mental states.
export function responseChanges(before={},after={}) {
 const ids=new Set([...Object.keys(before),...Object.keys(after)]);
 return [...ids].filter(id=>JSON.stringify(before[id]??null)!==JSON.stringify(after[id]??null));
}
export function observedRevision(before,after) {
 const changes=responseChanges(before?.responses,after?.responses);
 const revisionIds=changes.filter(id=>before?.responses?.[id]!==undefined);
 const submitted=Number(after?.attempts??0)>Number(before?.attempts??0);
 const resubmitted=Object.keys(after?.corrections??{}).filter(id=>after.corrections[id]?.status==='resubmitted'&&(before?.corrections?.[id]?.status!=='resubmitted'||before.corrections[id]?.at!==after.corrections[id]?.at));
 return {changedIds:changes,revisionIds,submitted,resubmitted};
}
export function summariseEvidence(records) {
 const checked=records.filter(r=>r.checked&&Number.isFinite(r.score)&&Number.isFinite(r.total)&&r.total>0);
 const lessons=new Set(records.map(r=>r.itemId));
 return {responseRecords:records.length,lessonCount:lessons.size,checkedTasks:checked.length,correct:checked.reduce((n,r)=>n+r.score,0),possible:checked.reduce((n,r)=>n+r.total,0),sufficientHistory:lessons.size>=2&&checked.length>=3,limitations:['Scores describe submitted responses, not overall ability.','Missing responses are not incorrect answers.','Timing measures active interaction only; reading, thinking and offline work may be missing.','Saved revisions are not evidence of indecision.']};
}
