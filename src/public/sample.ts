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
