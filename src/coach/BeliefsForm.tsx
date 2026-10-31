import { AutoTextarea } from '../ai/AutoTextarea';
const questions = [
 ['How do learners learn best?', 'When do independent work, collaboration and teacher guidance help your learners? What makes you think so?'],
 ['What is your role in the classroom?', 'How do you decide when to explain, model, ask a question or step back?'],
 ['How should feedback support learning?', 'When would you respond to an error immediately, and when would you wait? What might change your choice?'],
 ['What makes learning meaningful and inclusive?', 'How do learners’ goals, languages, identities and confidence shape your teaching decisions?'],
 ['How do you know learning is happening?', 'What evidence do you trust? Which belief would you like to question or explore in your classroom?'],
];
function decode(value:string) {
 const answers=questions.map(()=> ''); let extra=value;
 if(value.startsWith('01. ')) { const parts=value.split(/\n\n(?=\d{2}\. )/); for(const part of parts){const index=Number(part.slice(0,2))-1;if(index>=0&&index<questions.length)answers[index]=part.slice(part.indexOf('\n')+1);}extra=parts[5]?.slice(parts[5].indexOf('\n')+1)??''; }
 return {answers,extra};
}
export function BeliefsForm({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
 const {answers,extra}=decode(value);
 function write(index:number,text:string){const next=[...answers];next[index]=text;onChange(next.map((answer,i)=>`${String(i+1).padStart(2,'0')}. ${questions[i][0]}\n${answer}`).join('\n\n')+(extra?`\n\n06. Additional beliefs\n${extra}`:''));}
 return <div className="coach-beliefs-form"><p className="hint">There are no right answers. Use examples from your teaching, and leave room for “it depends” or “I’m not sure yet”.</p>{questions.map(([question,hint],i)=><section className="coach-belief-question" key={question}><span aria-hidden="true">{String(i+1).padStart(2,'0')}</span><label>{question}<small>{hint}</small><AutoTextarea aria-label={question} value={answers[i]} disabled={disabled} maxLength={900} placeholder="Your thinking…" onChange={e=>write(i,e.target.value)}/></label></section>)}{extra&&<label>Your previously recorded beliefs<AutoTextarea value={extra} disabled={disabled} maxLength={1000} onChange={e=>onChange(e.target.value)}/></label>}</div>;
}
