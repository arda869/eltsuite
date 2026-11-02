const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
export function idOf(value){if(typeof value!=='string'||!idPattern.test(value))throw Error('Choose a valid saved record.');return value;}
function text(value,max,required=false){if(value===undefined||value===null)value='';if(typeof value!=='string'||value.length>max||required&&!value.trim())throw Error(required?'Complete the required field.':'This field is too long.');return value.trim();}
export function observationInput(d={}){
 const title=text(d.title,160,true),focus=text(d.focus,2000),context=text(d.context,4000);
 const classId=d.classId?idOf(d.classId):'',itemId=d.itemId?idOf(d.itemId):'';
 if(itemId&&!classId)throw Error('Choose a class for this lesson.');
 return {schemaVersion:1,title,focus,context,classId,itemId,mode:'developmental',capture:'notes-only'};
}
export function noteInput(d={}){
 if(!['observed','interpretation'].includes(d.kind))throw Error('Choose observation or interpretation.');
 if(!Number.isInteger(d.offsetSeconds)||d.offsetSeconds<0||d.offsetSeconds>86400)throw Error('Use a lesson time between 00:00 and 24:00:00.');
 return {text:text(d.text,6000,true),kind:d.kind,offsetSeconds:d.offsetSeconds};
}
export function selection(value){
 if(!Array.isArray(value)||value.length<1||value.length>40)throw Error('Select between one and forty notes.');
 return [...new Set(value.map(idOf))];
}
export function versionOf(value){if(!Number.isInteger(value)||value<0)throw Error('Reopen the saved record before editing.');return value;}
export function sourcePacket(observation,notes,selected){
 const chosen=selection(selected).map(id=>{const note=notes.find(n=>n.id===id);if(!note||note.deleted)throw Error('A selected note was removed. Review your selection.');return {id:note.id,text:note.text,kind:note.kind,offsetSeconds:note.offsetSeconds,version:note.version,author:note.author};});
 return {observationId:observation.id,title:observation.title,focus:observation.focus,context:observation.context,startedAt:observation.startedAt,endedAt:observation.endedAt,version:observation.version,notes:chosen};
}
