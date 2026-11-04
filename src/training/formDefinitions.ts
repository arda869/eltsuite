import { tr } from '../lib/terms';
export type TTKind = 'analysis' | 'plan' | 'observe' | 'loop' | 'rehearsal' | 'exam' | 'reflection' | 'custom';
// An organisation's own form: its fields, in order. A copy goes into each form placed in a lesson,
// so it stays as it was even if the admins change the form later.
export type TTField = { id: string; label: string; kind: 'short' | 'long' | 'rating' | 'check'; hint?: string };
export type TTFormDef = { id: string; name: string; about?: string; fields: TTField[] };
export const TT_KINDS: { k: TTKind; label: string; about: string }[] = [
  { k: 'analysis', label: 'Language analysis', about: tr('Meaning, form and pronunciation, concept-checking questions, and problems learners may have with solutions') },
  { k: 'plan', label: 'Lesson plan', about: 'Aims, assumptions and the stages with aims, procedure, interaction and timing' },
  { k: 'observe', label: 'Observation form', about: tr('Strengths and action points against criteria for planning, language, teaching and learners') },
  { k:'rehearsal',label:'Microteaching rehearsal',about:'Plan a short teaching move, rehearse it, collect evidence and try again' },
  { k:'exam',label:'Exam practice debrief',about:'Analyse task demands, timing, evidence and the next practice target' },
  { k:'reflection',label:'Reflective inquiry',about:'Connect classroom evidence to a specific change and a follow-up check' },
  { k: 'loop', label: 'Loop input: step back', about: 'After you model a technique, trainees open this to see what you did and why' },
];

export const CRITERIA: { g: string; items: { id: string; t: string }[] }[] = [
  { g: 'Planning', items: [{ id: 'p1', t: 'Clear, achievable aims' }, { id: 'p2', t: 'Stages that build towards the aim' }, { id: 'p3', t: 'Realistic timing' }] },
  { g: 'Language', items: [{ id: 'l1', t: 'Accurate analysis of the target language' }, { id: 'l2', t: 'Meaning checked clearly (concept questions, timelines)' }, { id: 'l3', t: 'Pronunciation modelled and drilled' }] },
  { g: 'Teaching', items: [{ id: 't1', t: 'Clear instructions, checked' }, { id: 't2', t: 'Monitoring and support during tasks' }, { id: 't3', t: 'Useful feedback and error correction' }] },
  { g: 'Learners', items: [{ id: 's1', t: tr('Participation and teacher input serve the lesson aims') }, { id: 's2', t: 'Interaction patterns fit the task and include everyone' }, { id: 's3', t: tr('Rapport, and every learner included') }] },
];
export const RATINGS = ['Not yet', 'Achieved', 'Strong'];

export const DEVELOPMENT_FORMS: Partial<Record<TTKind, TTFormDef>> = {
 rehearsal:{id:'rehearsal',name:'Microteaching rehearsal',fields:[
  {id:'focus',label:'Teaching move and intended learner outcome',kind:'long'},
  {id:'script',label:'Your instructions, model and checking questions',kind:'long'},
  {id:'criteria',label:'What will your observer look for?',kind:'long'},
  {id:'evidence',label:'What actually happened? Record words or actions',kind:'long'},
  {id:'feedback',label:'Peer feedback: evidence and its effect',kind:'long'},
  {id:'retry',label:'What will you change in the second rehearsal?',kind:'long'}]},
 exam:{id:'exam',name:'Exam practice debrief',fields:[
  {id:'demand',label:'What did the task require?',kind:'long'},
  {id:'timing',label:'Time planned, time used and pacing decision',kind:'short'},
  {id:'evidence',label:'Evidence supporting your answer',kind:'long'},
  {id:'review',label:'Compare with the key or criteria: what explains the difference?',kind:'long'},
  {id:'strategy',label:'Separate a knowledge gap from an exam-technique issue',kind:'long'},
  {id:'next',label:'Your next focused practice task',kind:'long'}]},
 reflection:{id:'reflection',name:'Reflective inquiry',fields:[
  {id:'question',label:'A focused question about your practice',kind:'long'},
  {id:'evidence',label:'Observed evidence, including a counter-example if available',kind:'long'},
  {id:'interpretation',label:'Possible explanations and what remains uncertain',kind:'long'},
  {id:'change',label:'One feasible change and your rationale',kind:'long'},
  {id:'check',label:'How and when will you check its effect?',kind:'long'},
  {id:'followup',label:'Follow-up evidence and next decision',kind:'long'}]},
};
