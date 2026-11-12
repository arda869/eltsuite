// Shared catalog for the model, import review and server validation. No arbitrary editor JSON.
const text=(min=0,max=5000)=>({type:'string',minLength:min,maxLength:max});
const str=text(),required=text(1),short=text(0,1000),word=text(1,200);
const number=(minimum=0,maximum=100)=>({type:'number',minimum,maximum});
const integer=(minimum=0,maximum=100)=>({type:'integer',minimum,maximum});
const bool={type:'boolean'};
const list=(items,minItems=0,maxItems=30)=>({type:'array',items,minItems,maxItems});
const choice=(...values)=>({type:'string',enum:values});
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
// A listening worksheet can be imported before its recording or answer key is supplied.
// Empty answers remain private, editable gaps for the teacher to complete later.
const answers=list(text(0,200),0,8),extras=list(word,0,20),options=list(word,2,12);
const records=list(obj({name:word,value:str}),0,30);
const entries=[
 ['text','Text or reading','Keep a passage or instruction in its original place.',{text:required}],
 ['boxedText','Boxed text','Preserve a visibly bordered or shaded group of source text as an editable box, including its instructions and bullets.',{style:choice('box','info'),tone:choice('grey','mist','sand','sage','sky','rose'),label:short,text:required}],
 ['dialogue','Dialogue','Keep speaker turns together in the native Dialogue element. Use ___ for each answer gap and give its answer in the same turn, in order.',{layout:choice('stacked','side'),turns:list(obj({speaker:text(1,60),text:text(1,1000),answers:list(text(0,200),0,12)}),2,30)}],
 ['picture','Source illustration','Recreate only the illustration region from a supplied page, retaining every answer-critical detail.',{ref:text(1,60),sourceImage:integer(1,6),x:number(),y:number(),width:number(1,100),height:number(1,100),alt:text(1,300),recreationPrompt:text(1,1200),asset:text(0,64)}],
 ['gap','Text gap','Complete one blank with a word or phrase.',{answers}],
 ['shortAnswer','Short answer','Answer a question with a word, number or short phrase.',{answers}],
 ['lettergap','Letter gaps','A gap with one line per missing letter.',{answers,firstLetter:bool}],
 ['wordform','Word formation','Complete a gap using the supplied stem word.',{stem:word,answers}],
 ['radio','Multiple choice, as a list','Choose one of the supplied options displayed as a list.',{options,answer:text(0,200)}],
 ['dropdown','Multiple choice in line','Choose an option inside a sentence, at ___.',{options,answer:text(0,200)}],
 ['multi','Multiple selection','Select every correct option, not just one.',{options,answers:list(word,0,12)}],
 ['truefalse','True or false','Judge the statement against the source.',{answer:choice('','True','False')}],
 ['notgiven','True, false or not given','Distinguish contradiction from information not supplied.',{answer:choice('','True','False','Not given')}],
 ['match','Matching','Match genuine left/right pairs, retaining extra distractors.',{pairs:list(obj({left:required,right:required}),2,20),extras}],
 ['drop','Drag-and-drop gap','Complete a ___ from the shared word bank.',{answer:word}],
 ['bank','Word bank','One shared bank for drag-and-drop gaps; extras are distractors.',{extras}],
 ['order','Word order','Rearrange all words into a complete sentence.',{sentence:required}],
 ['writing','Written response','Teacher-reviewed open writing or extended composition. Preserve word count, genre and marking criteria when supplied; use zero limits when none are stated.',{model:str,minWords:integer(0,5000),maxWords:integer(0,10000),genre:short,rubric:choice('none','cambridge','custom'),criteria:list(obj({name:word,max:integer(1,100)}),0,12)}],
 ['reflect','Self-reflection','Learners rate or reflect on their own performance.',{title:short,items:list(obj({type:choice('stars','scale','faces','choice','checklist','text'),prompt:required,options:extras,points:integer(2,10),low:short,high:short}),1,20)}],
 ['peer','Peer feedback','Learners choose a classmate and give feedback.',{title:short,items:list(obj({type:choice('stars','scale','faces','choice','checklist','text'),prompt:required,options:extras,points:integer(2,10),low:short,high:short}),1,20)}],
 ['upload','File upload','Submit a document, picture, sound or video; do not create an upload for an ordinary short answer.',{kinds:list(choice('documents','pictures','audio','video'),1,4),maxFiles:integer(1,10),maxMB:integer(1,20),note:short}],
 ['board','Message board','A classroom discussion where posts are shared.',{replies:bool,reactions:bool,anonymous:bool}],
 ['postits','Post-it wall','Collect short ideas on a shared wall.',{replies:bool,reactions:bool,anonymous:bool}],
 ['drawboard','Drawing board','Draw, annotate or sketch a response.',{}],
 ['collab','Shared document','Collaboratively write a shared text.',{title:short,start:str,scope:choice('class','group','solo')}],
 ['pq-fix','Find and fix the mistake','Select the wrong word(s), then supply a correction.',{sentence:required,wrong:word,fixes:answers}],
 ['pq-categorise','Categorise','Sort items into named categories.',{cats:list(obj({name:word,items:list(word,1,30)}),2,10)}],
 ['pq-transform','Key word transformation','Rewrite using a keyword, with before/after text and accepted gap answers.',{first:required,keyWord:word,before:short,after:short,answers,min:integer(0,50),max:integer(0,50)}],
 ['pq-highlight','Highlight','Highlight words or phrases in text or a dialogue. Keep dialogue turns on separate lines as Name: speech. Mark target words with {{double braces}}; learners select words, not type an essay.',{instruction:required,text:required,penalty:bool}],
 ['pq-sentences','Order sentences','Sentences/paragraphs supplied in the correct order, then shuffled for learners.',{items:list(required,2,20)}],
 ['pq-label','Label the image','Labels and percentage coordinates. Leave image empty and flag attachment if the source picture is unavailable.',{image:short,points:list(obj({x:number(),y:number(),label:word}),1,20),extras}],
 ['pq-odd','Odd one out','Choose the item that does not belong.',{words:options,odd:integer(0,11),reason:bool}],
 ['pq-gapped','Gapped text','Put removed sentences into {{1}}, {{2}}, etc. removed is in gap order; extras are distractors.',{text:required,removed:list(required,1,20),extras:list(required,0,10)}],
 ['pq-matching','Multiple matching','Match statements to labelled texts/options. Retain every source text in shared reading blocks.',{options:list(word,2,12),names:extras,statements:list(obj({text:required,answer:integer(0,11)}),1,30)}],
 ['pq-speaking','Speaking prompt','Oral discussion or photo comparison, with a timer. No written answer box.',{prompt:required,images:list(short,0,4),questions:list(required,0,12),timer:integer(0,600),pairs:bool}],
 ['pq-dictation','Dictation','The native speech tool reads supplied text; do not invent a missing recording transcript.',{sentence:required,replays:integer(1,10),accent:choice('RP','GA')}],
 ['pq-pairs','Minimal pairs','Hear a supplied target word and choose between similar-sounding words.',{items:list(obj({say:word,options}),1,20),accent:choice('RP','GA')}],
 ['pq-crossword','Crossword','Recreate a crossword from its answer words and clues.',{words:list(obj({word,clue:required}),2,30),from:short}],
 ['pq-wordsearch','Word search','Recreate a word search from its target words and clues.',{words:list(obj({word,clue:required}),2,30),from:short}],
 ['survey','Survey','Ratings, emoji, thumbs, single/multiple choices, ranking and open survey responses.',{title:short,anonymous:bool,questions:list(obj({type:choice('scale','emoji','thumbs','single','multi','rank','text'),prompt:required,options:extras,max:integer(2,10),low:short,high:short}),1,20)}],
 ...['drawcard','wheel','boxes'].map((kind,i)=>[kind,['Draw a card','Spin the wheel','Open a box'][i],'Randomly reveal supplied discussion prompts or role cards. Do not replace scored questions with plain cards.',{repeat:bool,cards:list(obj({title:short,text:required}),2,30)}]),
 ['speaking','AI conversation','A roleplay with a defined learner role, partner role and speaking focus; teacher setup is required before learners can start.',{title:text(1,120),scenario:text(1,1500),focus:text(1,1000),learnerRole:text(1,200),partnerRole:text(1,200),level:choice('Pre-A1','A1','A2','B1','B2','C1','C2'),seconds:{...integer(60,300),enum:[60,120,180,240,300]}}],
 ...['analysis','plan','observe','loop','rehearsal','exam','reflection'].map((kind,i)=>['tt-'+kind,['Language analysis','Lesson plan','Observation form','Loop input','Microteaching rehearsal','Exam practice debrief','Reflective inquiry'][i],'Teacher-training form only, not a language learner writing box. Preserve source prompts and use known native field names.',{title:required,mode:choice('model','complete'),fields:records}]),
 ['heading','Heading','A short heading inside the task, where the source has one between parts.',{text:text(1,200)}],
 ['list','List','A bulleted or numbered list that is not a set of questions. Keep the source order and numbering start.',{ordered:bool,start:integer(1,100),items:list(required,1,40)}],
 ['quote','Quote','A quotation or passage set apart from the main text.',{text:required}],
 ['reveal','Reveal box','Content hidden until the learner opens it: a hint, a model answer, a tip.',{label:text(1,80),text:required}],
 ['table','Table','A table with a header row. Put ___ in a cell for each answer gap and list the answers in reading order, left to right, top to bottom. Use an empty answers list when there are no gaps.',{headers:list(text(0,300),1,8),rows:list(list(text(0,500),1,8),1,30),answers:list(text(0,200),0,60)}],
 ['ipa','Phonemic transcription','A word or phrase with its phonemic transcription between slashes in the source.',{word:text(0,200),transcription:text(1,200),accent:choice('RP','GA')}],
 ['stress','Word stress','A word divided into syllables with its stressed syllable marked (index from 0).',{syllables:list(text(1,30),1,8),stressed:integer(0,7)}],
 ['subst','Substitution slot','Words that can each fill one place in a model sentence, shown stacked at ___ in the prompt.',{options:list(word,2,12)}],
 ['phonchart','Phonemic chart','The interactive phonemic chart, or one part of it.',{accent:choice('RP','GA'),part:choice('all','vowels','diphs','cons')}],
 ['phoncard','Sound card','One sound in IPA, with examples (sound) or how it is made (how).',{sound:text(1,8),accent:choice('RP','GA'),show:choice('sound','how')}],
 ['dictcut','Definition card','A word or phrase with a learner-level meaning, part of speech, example and pronunciation.',{word,pos:short,meaning:required,example:short,ipa:short}],
 ['linkcard','Link card','A YouTube video, audio file or web page whose full HTTPS address is printed in the source. Never invent an address.',{url:text(1,1000),title:text(1,200),note:short}],
 ['investigation','Language investigation','A language investigation block (corpus, discourse, language awareness, pragmatics, learner development or research). The teacher chooses or makes the investigation in the editor.',{family:choice('corpus','discourse','language-awareness','pragmatics','learner-development','research')}],
 ['tt-custom','Custom training form','Preserve an uploaded teacher-training form with its actual labelled fields.',{title:required,fields:list(obj({label:required,kind:choice('short','long','rating','check'),hint:short,value:str}),1,30)}]
];
export const IMPORT_TYPES=entries.map(([kind,label,hint,fields])=>({kind,label,hint,dataSchema:obj(fields)}));
export const IMPORT_ELEMENT_SCHEMA={anyOf:IMPORT_TYPES.map(t=>obj({kind:choice(t.kind),prompt:str,reason:text(1,600),feedback:short,example:bool,needs:list(choice('picture','recording','transcript','classroomSetup'),0,4),data:t.dataSchema}))};
export const IMPORT_TYPE_BY_KIND=new Map(IMPORT_TYPES.map(t=>[t.kind,t]));
export function defaultSchemaValue(schema){
 if(schema.enum)return schema.enum[0];
 if(schema.type==='string')return '';
 if(schema.type==='boolean')return false;
 if(['number','integer'].includes(schema.type))return schema.minimum??0;
 if(schema.type==='array')return Array.from({length:schema.minItems??0},()=>defaultSchemaValue(schema.items));
 return Object.fromEntries(Object.entries(schema.properties??{}).map(([k,v])=>[k,defaultSchemaValue(v)]));
}
export function newImportElement(kind,prompt=''){
 const t=IMPORT_TYPE_BY_KIND.get(kind);if(!t)throw Error('Choose a supported inline task type.');
 return {kind,prompt,reason:'Selected during teacher review.',feedback:'',example:false,needs:[],data:defaultSchemaValue(t.dataSchema)};
}
