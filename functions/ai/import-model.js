// A compact, shallow generation schema. Saved/recovered imports use the compatible
// editor-facing shape; the model never needs the unrelated lesson/version schema.
import { activitySchema } from './activities.js';
import { IMPORT_TYPES } from './import-types.js';
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const array=(items,minItems=0,maxItems=60)=>({type:'array',items,minItems,maxItems});
const text=(minLength=0,maxLength=5000)=>({type:'string',minLength,maxLength});
const ref=name=>({$ref:'#/$defs/'+name});
export function importModelSchema(training){
 const original=activitySchema.properties.tasks.items.properties;
 const elements={anyOf:IMPORT_TYPES.filter(t=>training||!t.kind.startsWith('tt-')).map(t=>{
  const details=Object.fromEntries(Object.entries(t.dataSchema.properties).map(([key,s])=>[key==='prompt'?'oralPrompt':key,t.kind==='picture'&&key==='asset'?{type:'string',enum:['']}:s]));
  return obj({kind:{type:'string',enum:[t.kind]},prompt:ref('text'),selectionReason:ref('reason'),feedback:ref('short'),example:{type:'boolean'},needs:ref('needs'),...details});
 })};
 const body={instructions:text(1),input:text(),blocks:original.blocks,definitions:original.definitions,visuals:original.visuals,inlineElements:array(ref('importElement'))};
 return {...obj({title:text(1),rationale:text(1),differentiation:text(1),recycling:text(1),warnings:array(text(1,1000),0,30),tasks:array(obj({stageId:text(1),title:text(1),minutes:{type:'integer',minimum:1,maximum:180},layout:{type:'string',enum:['stacked','columns']},...body,subTasks:array(obj(body),0,6),teacherOnlyInput:text(0,2500),teacherNotes:text(1),support:text(0,2500),challenge:text(0,2500)}),1,12)}),$defs:{text:text(),short:text(0,1000),reason:text(1,600),needs:array({type:'string',enum:['picture','recording','transcript','classroomSetup']},0,4),importElement:elements}};
}
export function fromImportModel(value){
 const element=e=>{const type=IMPORT_TYPES.find(t=>t.kind===e.kind);if(!type)throw Error('Unsupported inline task type.');return {kind:e.kind,prompt:e.prompt,reason:e.selectionReason,feedback:e.feedback,example:e.example,needs:e.needs,data:Object.fromEntries(Object.keys(type.dataSchema.properties).map(k=>[k,e[k==='prompt'?'oralPrompt':k]]))};};
 const body=b=>({...b,inlineElements:b.inlineElements.map(element),questions:[]});
 return {...value,tasks:value.tasks.map(t=>({...body(t),subTasks:t.subTasks.map(body),format:'reading',imageLayout:'row',mediaPlan:[],roles:[],versions:[]}))};
}
