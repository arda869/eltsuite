// Public, fictional fixtures only. Never replace these with production class records.
export const stages = [
  { title: 'A place for everyone', kind: 'Discuss · pairs', minutes: 8, aim: 'Compare places that make a neighbourhood feel welcoming.', prompt: 'Think of a place near you where people come together. What makes you want to stay?' },
  { title: 'One space. Two priorities.', kind: 'Information gap · pairs', minutes: 18, aim: 'Ask for missing information, weigh alternatives and reach a shared decision.', prompt: 'Your neighbourhood has one empty shop. Choose a new use together. You each have information your partner needs.' },
  { title: 'Make your case', kind: 'Speaking · small groups', minutes: 14, aim: 'Give reasons, respond to a different view and agree on a proposal.', prompt: 'Pitch your proposal to another pair. What would make them change their minds?' },
  { title: 'Notice the language', kind: 'Language focus · pairs', minutes: 10, aim: 'Compare ways to agree, disagree politely and build on an idea.', prompt: 'Compare “That won’t work” and “I see your point, but what about…?” How does each invite a response?' },
  { title: 'A second conversation', kind: 'Speaking & reflection', minutes: 10, aim: 'Try the discussion again with a new constraint, then notice what improved.', prompt: 'The budget has been halved. Revisit your choice. Which phrase helped you keep the discussion moving?' },
];
export const roleCards = {
 A: { name: 'The neighbourhood view', facts: ['Many older neighbours want a quiet place to meet.', 'The nearest library is a 25-minute bus ride away.', 'A local artist can run a free workshop every Saturday.'], question: 'Ask your partner about costs and opening hours.' },
 B: { name: 'The practical view', facts: ['The space is free to use after 4 pm and at weekends.', 'A café needs equipment costing £8,000. Your budget is £5,000.', 'A reading room or workshop space costs £3,000 to set up.'], question: 'Ask your partner what the neighbourhood needs.' },
};
export const practice = { type:'doc', content:[{type:'paragraph',content:[{type:'text',text:'“I see your '},{type:'gap',attrs:{id:'demo-point',answers:['point'],width:8}},{type:'text',text:', but what about the cost?”'}]}] };
export const history = [
 {title:'Getting to know our class',aim:'Ask follow-up questions about interests.',note:'Pairs found shared interests; follow-up questions needed modelling.'},
 {title:'Places that matter',aim:'Describe a place and explain its importance.',note:'All eight learners contributed a place. Six gave a clear reason.'},
 {title:'Making suggestions',aim:'Suggest options for an afternoon together.',note:'Learners used “Why don’t we…?”; alternatives were sometimes limited.'},
 {title:'Comparing options',aim:'Compare cost, convenience and interest.',note:'Six learners compared two options; two needed more preparation time.'},
 {title:'Asking for clarification',aim:'Check information before deciding.',note:'Six of eight asked for clarification during the information gap.'},
 {title:'Agreeing and disagreeing',aim:'Acknowledge another view before responding.',note:'Pairs used model phrases; transferring them to a new context needs practice.'},
 {title:'A neighbourhood decision',aim:'Express an opinion and support it with a reason.',note:'Six asked for missing information; four gave a reason when disagreeing. Two need further observation.'},
];
export const learners = [
 {name:'Maya',submission:'I think a reading room is better because the library is far away.',feedback:'Your reason makes the connection clear. Ask your partner what they think next.',evidence:'Lesson 07: opinion and reason observed.'},
 {name:'Omar',submission:'I prefer the café. It is good.',feedback:'You made your preference clear. What would the café offer that the other options would not?',evidence:'Lesson 07: preference observed; reason needs development.'},
 {name:'Lina',submission:'I see your point, but a workshop can bring people together because they can make things.',feedback:'You acknowledged the other idea and gave a reason. Check whether your partner agrees.',evidence:'Lesson 07: acknowledging a view and giving a reason observed.'},
 {name:'Theo',submission:'How much does the café cost? I think the reading room is cheaper, so more people can use it.',feedback:'Your question helped the decision. Make the link between lower cost and wider access clearer.',evidence:'Lesson 07: clarification and reason observed.'},
 {name:'Ana',submission:'A workshop is better for me because I want to learn something new.',feedback:'Your personal reason is clear. Now consider a reason for the wider neighbourhood.',evidence:'Lesson 07: personal preference and reason observed.'},
 {name:'Jun',submission:'What time does it open? I prefer a reading room.',feedback:'Your question was useful. Add one reason after your preference.',evidence:'Lesson 07: information request observed; no supporting reason recorded.'},
 {name:'Leila',submission:'No submission recorded for this task.',feedback:'Check what happened before drawing a conclusion. Invite a short follow-up conversation.',evidence:'Missing evidence, not evidence of low ability.'},
 {name:'Ben',submission:'No submission recorded for this task.',feedback:'Offer another opportunity to demonstrate the skill.',evidence:'Missing evidence, not a score of zero.'},
];
