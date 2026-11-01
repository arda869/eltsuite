import { newImportElement } from '../../functions/ai/import-types.js';
import { rebuilt } from './material-fixture.mjs';
const data={
 picture:{ref:'source_illustration',sourceImage:1,x:10,y:10,width:80,height:60,alt:'A cat beside a car.',recreationPrompt:'Retain exactly one cat on the left and one car on the right.',asset:''},
 text:{text:'Read the source passage. Keep every instruction.'},gap:{answers:['went']},shortAnswer:{answers:['Saturday']},lettergap:{answers:['elephant'],firstLetter:false},wordform:{stem:'SUCCESS',answers:['successful']},
 radio:{options:['went','goes','gone'],answer:'went'},dropdown:{options:['went','goes','gone'],answer:'went'},multi:{options:['red','blue','dog'],answers:['red','blue']},truefalse:{answer:'True'},notgiven:{answer:'Not given'},
 match:{pairs:[{left:'cat',right:'an animal'},{left:'car',right:'a vehicle'}],extras:['a colour']},drop:{answer:'went'},bank:{extras:['going']},order:{sentence:'We went to school yesterday.'},
 writing:{model:'A model letter.',minWords:100,maxWords:140,genre:'letter',rubric:'none',criteria:[]},
 reflect:{title:'How did I do?',items:[{type:'scale',prompt:'I can give reasons.',options:[],points:5,low:'Not yet',high:'Confident'}]},peer:{title:'Peer feedback',items:[{type:'text',prompt:'Give one useful suggestion.',options:[],points:5,low:'',high:''}]},
 upload:{kinds:['documents','pictures'],maxFiles:1,maxMB:5,note:'Upload your poster.'},board:{replies:true,reactions:true,anonymous:false},postits:{replies:false,reactions:true,anonymous:false},drawboard:{},collab:{title:'Our story',start:'Write a story together.',scope:'class'},
 'pq-fix':{sentence:'She go to school.',wrong:'go',fixes:['goes']},'pq-categorise':{cats:[{name:'Animals',items:['cat','dog']},{name:'Transport',items:['car','bus']}]},
 'pq-transform':{first:'I last saw her in May.',keyWord:'SINCE',before:'I have not seen her',after:'May.',answers:['since'],min:1,max:3},
 'pq-highlight':{instruction:'Select the adjectives.',text:'The {{red}} bus is {{big}}.',penalty:true},'pq-sentences':{items:['First, wake up.','Next, eat breakfast.','Finally, go to school.']},
 'pq-label':{image:'https://example.com/picture.jpg',points:[{x:25,y:50,label:'window'},{x:70,y:65,label:'door'}],extras:[]},
 'pq-odd':{words:['cat','dog','horse','bus'],odd:3,reason:false},'pq-gapped':{text:'We arrived. {{1}} Then we went home. {{2}}',removed:['It was sunny.','We were tired.'],extras:['She bought a car.']},
 'pq-matching':{options:['A','B'],names:['Alex','Sam'],statements:[{text:'Who likes swimming?',answer:0},{text:'Who prefers cycling?',answer:1}]},
 'pq-speaking':{prompt:'Compare the two travel plans.',images:[],questions:['Which would you choose?'],timer:60,pairs:true},'pq-dictation':{sentence:'The red bus is late.',replays:2,accent:'RP'},
 'pq-pairs':{items:[{say:'ship',options:['ship','sheep']},{say:'live',options:['live','leave']}],accent:'RP'},
 'pq-crossword':{words:[{word:'CAT',clue:'A small pet that says meow.'},{word:'CAR',clue:'A vehicle with four wheels.'},{word:'TRAIN',clue:'It travels on rails.'}],from:''},
 'pq-wordsearch':{words:[{word:'ELEPHANT',clue:'A large animal with a trunk.'},{word:'CROCODILE',clue:'An animal with sharp teeth.'},{word:'BUTTERFLY',clue:'An insect with colourful wings.'}],from:''},
 survey:{title:'Class feedback',anonymous:true,questions:[{type:'single',prompt:'Choose a topic.',options:['Travel','Food'],max:5,low:'',high:''}]},
 drawcard:{repeat:false,cards:[{title:'A',text:'Describe a favourite place.'},{title:'B',text:'Describe a favourite meal.'}]},wheel:{repeat:false,cards:[{title:'A',text:'Talk about travel.'},{title:'B',text:'Talk about food.'}]},boxes:{repeat:false,cards:[{title:'A',text:'Describe a friend.'},{title:'B',text:'Describe a pet.'}]},
 speaking:{title:'Make a plan',scenario:'You and a friend choose an afternoon activity.',focus:'Ask for clarification.',learnerRole:'A friend making plans',partnerRole:'A friend with another idea',level:'A2',seconds:120},
 'tt-custom':{title:'Observation notes',fields:[{label:'Evidence observed',kind:'long',hint:'Record what happened, not an interpretation.',value:''}]}
};
for(const kind of ['analysis','plan','observe','loop','rehearsal','exam','reflection'])data['tt-'+kind]={title:'Teacher development',mode:'complete',fields:[]};
export const importElements=Object.fromEntries(Object.entries(data).map(([kind,value])=>[kind,{...newImportElement(kind),prompt:['gap','lettergap','wordform','drop','dropdown'].includes(kind)?'Yesterday, we ___ to school.':'Complete the source activity.',reason:'Matches the response requested in the source.',data:value}]));
export function importTask(elements=Object.values(importElements)){
 return {...structuredClone(rebuilt.tasks[0]),title:'Native task types',input:'',blocks:[],definitions:[],visuals:[],questions:[],inlineElements:structuredClone(elements),subTasks:[]};
}
export function importLesson(elements=Object.values(importElements)){
 return {...structuredClone(rebuilt),title:'Native import verification',warnings:[],tasks:[importTask(elements)]};
}
// Test provider responses obey the compact model schema, not the saved compatibility shape.
export function asImportModel(value){
 const convert=e=>({kind:e.kind,prompt:e.prompt,selectionReason:e.reason,feedback:e.feedback,example:e.example,needs:e.needs??[],...Object.fromEntries(Object.entries(e.data).map(([k,v])=>[k==='prompt'?'oralPrompt':k,v]))});
 const body=b=>({instructions:b.instructions,input:b.input,blocks:b.blocks??[],definitions:b.definitions??[],visuals:b.visuals??[],inlineElements:(b.inlineElements?.length?b.inlineElements:(b.questions??[]).map(q=>({...newImportElement('shortAnswer'),prompt:q.prompt,reason:'A short source answer.',feedback:q.explanation,data:{answers:[q.answer,...q.acceptedAnswers]}}))).map(convert)});
 return {title:value.title,rationale:value.rationale,differentiation:value.differentiation,recycling:value.recycling,warnings:value.warnings,tasks:value.tasks.map(t=>({stageId:t.stageId,title:t.title,minutes:t.minutes,layout:t.layout,...body(t),subTasks:(t.subTasks??[]).map(body),teacherOnlyInput:t.teacherOnlyInput,teacherNotes:t.teacherNotes,support:t.support,challenge:t.challenge}))};
}
