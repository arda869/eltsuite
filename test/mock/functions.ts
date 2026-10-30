import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
// Test-only callable stand-in. Production builds never import this module.
export const getFunctions = () => ({});
export const httpsCallable = (_app: unknown, name: string) => async (d: any) => {
  if (name !== 'lessonAssistant') throw Error('Unsupported test callable');
  const store = JSON.parse(localStorage.getItem('mockAiDrafts') || '{}');
  if (d.action === 'context') return {data:{classContext:{name:'Demo class',level:'B1',kind:'language',profile:null},evidence:{recent:[],skillLevels:{},counts:{items:0,submittedTasks:0,portfolioRecords:0},limitations:'No recorded evidence yet.'}}};
  if (d.action === 'profile') return {data:{profileSaved:true}};
  const stage = { id: 's1', title: 'Compare options', aim: 'Agree on a choice using reasons', minutes: d.brief.duration, interaction: 'Pairs' };
  if (d.action === 'outline') return { data: { outline: { title: 'Choose a trip', outcomes: ['Give reasons for a choice'], methodology: 'Task-based', rationale: 'Learners use English to reach a shared decision.', stages: [stage] } } };
  if (d.action === 'plan') return { data: { plan: { title: 'Choose a trip', mainAim: 'Agree on a trip and explain why', subsidiaryAims: 'Ask for a reason', assumedKnowledge: 'Basic comparatives', materials: 'Option cards', methodology: 'Task-based', rationale: 'A decision gives the task a purpose', assessment: 'Partners explain their decision', adaptations: 'Offer sentence starters', languageAnalysis: 'We could go by train. Modal could + base verb; weak form of could.', stages: [{ ...stage, procedures: 'Compare the two options. Agree on one. Report reasons.', instructions: 'Choose one trip together. Give two reasons.', instructionChecks: 'Do you choose one or both?', monitoring: 'Listen for reasons and shared decisions', feedback: 'Compare choices, then discuss useful language', transition: 'Share the decision', anticipatedProblems: 'One partner dominates', solutions: 'Assign each partner one option to explain', materialIds: ['m1'] }], learnerMaterials: [{ id: 'm1', title: 'Trip options', instructions: 'Compare these trips. Choose one and give reasons.', task: 'Train: £20, 40 minutes. Bus: £10, 70 minutes.', answerKey: 'Either option is acceptable with justified reasons.', script: 'Not applicable — speaking task', attribution: 'Original task', accessibleAlternative: 'Read the options aloud.' }] }, review: { checks: [{ criterion: 'Timing', score: 3, evidence: 'Test fixture only, not a model evaluation.' }], criticalErrors: [], suggestions: ['Check timing with the class.'] } } };
  if(d.action==='activities') { const activities={title:d.plan.title,rationale:'A complete decision task.',differentiation:'No recorded evidence: offer optional support.',recycling:'No history.',tasks:[{stageId:'s1',title:'Choose and explain',format:'writing',minutes:d.brief.duration,instructions:'Choose a trip and explain.',input:'Train: £20. Bus: £10.',questions:[{prompt:'Which trip?',options:[],answer:'Either with reasons.',explanation:'Assess the reasons.'}],teacherNotes:'Monitor reasons.',support:'I prefer… because…',challenge:'Compare environmental impact.'}]};localStorage.setItem('mockAiActivities',JSON.stringify({activities,type:d.creationType}));return {data:{activities}}; }
  if(d.action==='create') {const {activities,type}=JSON.parse(localStorage.getItem('mockAiActivities')!);const id='ai-test';await setDoc(doc(db,'classes',d.classId,'items',id),{type,title:activities.title,topicId:null,order:10,hidden:true,locked:false,taskCount:1});await setDoc(doc(db,'classes',d.classId,'items',id,'tasks','a1'),{kind:'task',title:'Choose and explain',instructions:'Choose a trip and explain.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Train: £20. Bus: £10.'}]}]},order:0,hidden:false,locked:false});return {data:{createdItemId:id}};}
  if (d.action === 'save') {
    if ((store[d.draftId]?.version ?? 0) !== d.version) throw Error('This plan changed in another window.');
    store[d.draftId] = { brief: d.brief, plan: d.plan, version: d.version + 1 };
    localStorage.setItem('mockAiDrafts', JSON.stringify(store));
    return { data: { version: d.version + 1 } };
  }
  if (d.action === 'list') return { data: { drafts: Object.entries(store).map(([id, v]: [string, any]) => ({ id, title: v.plan.title, version: v.version })) } };
  if (d.action === 'load') return { data: { draft: store[d.draftId] } };
  if (d.action === 'delete') { delete store[d.draftId]; localStorage.setItem('mockAiDrafts', JSON.stringify(store)); return { data: {} }; }
  throw Error('Unknown action');
};
