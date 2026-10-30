const short = (v, n=500) => typeof v === 'string' ? v.slice(0,n) : '';
export const courseTypes = ['General English','Business English','Academic English','Exam preparation','English for specific purposes'];
export const ageGroups = ['Adults','Young learners','Teenagers','Mixed ages'];
export function classProfile(value) {
  const v = value ?? {};
  if (!courseTypes.includes(v.courseType) || !ageGroups.includes(v.ageGroup)) throw Error('Choose a course type and age group.');
  for (const k of ['goals','needs']) if (typeof v[k] !== 'string' || v[k].length > 1500) throw Error('Keep class goals and needs within 1,500 characters.');
  return {courseType:v.courseType,ageGroup:v.ageGroup,goals:v.goals,needs:v.needs};
}
// Bounded, class-scoped evidence. Names, contacts, raw free-text answers and attachments never go to the model.
export async function collectEvidence(db, classId) {
  const base = db.collection('classes').doc(classId);
  const [items,answers,portfolio] = await Promise.all([
    base.collection('items').orderBy('createdAt','desc').limit(12).get(),
    base.collection('answers').orderBy('submittedAt','desc').limit(200).get(),
    base.collection('portfolio').limit(200).get(),
  ]);
  const skillLevels = {};
  portfolio.docs.forEach(d => Object.entries(d.get('skills') ?? {}).forEach(([skill,level]) => {
    if (!['Speaking','Listening','Reading','Writing','Grammar','Vocabulary','Pronunciation'].includes(skill) || !['A1','A2','B1','B2','C1','C2'].includes(level)) return;
    const k = `${skill} · ${level}`; skillLevels[k] = (skillLevels[k] ?? 0)+1;
  }));
  const results = new Map();
  answers.docs.forEach(d => {
    const a=d.data(); if (!a.checked || !Number.isFinite(a.total) || a.total <= 0 || !Number.isFinite(a.score)) return;
    const x=results.get(a.itemId) ?? {attempts:0,score:0,total:0};
    x.attempts++;x.score+=a.score;x.total+=a.total;results.set(a.itemId,x);
  });
  const recent = await Promise.all(items.docs.map(async d => {
    const tasks = await d.ref.collection('tasks').orderBy('order').limit(8).get();
    const questionEvidence=await Promise.all(tasks.docs.slice(0,4).map(async t=>{
      const key=(await t.ref.collection('private').doc('key').get()).data() ?? {};
      const submissions=answers.docs.map(x=>x.data()).filter(a=>a.checked && a.taskId===t.id);
      const norm=v=>String(v??'').trim().toLowerCase().replace(/[.!?]+$/,'');
      const questions=Object.entries(key).slice(0,12).map(([id,k])=>{
        const attempts=submissions.filter(a=>Object.hasOwn(a.responses??{},id));
        const scored=attempts.map(a=>{const r=a.responses[id];if(k.kind==='mcq')return r===k.correct;if(k.kind==='gap')return (k.answers??[]).some(x=>norm(x)===norm(r));if(k.kind==='order'||k.kind==='drop')return norm(r)===norm(k.answer);return null;}).filter(x=>x!==null);
        return {format:k.kind,attempts:scored.length,correct:scored.filter(Boolean).length};
      }).filter(q=>q.attempts>0);
      return {task:short(t.get('title'),120),questions};
    }));
    return { questionEvidence, title:short(d.get('title'),160), type:d.get('type'), tasks:tasks.docs.map(t=>short(t.get('title'),120)), result:results.get(d.id) ?? null };
  }));
  return { recent, skillLevels, counts:{items:items.size,submittedTasks:answers.size,portfolioRecords:portfolio.size},
    limitations:'Bounded sample of this class only. Task scores are aggregated; missing work is not evidence of low ability. Portfolio evidence includes recorded skill levels only, not private narrative or files. Prior titles indicate topics, not proof of mastery. No individual learner assignment is automatic.' };
}
