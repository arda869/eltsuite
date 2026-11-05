import {FieldPath} from 'firebase-admin/firestore';
import {loadLessonSource} from './coach-lesson-context.js';
const words=s=>[...new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(w=>!['the','and','for','this','that','with','what','how','can','lesson','lessons','please','help','teach','teaching','would','could','should','about','have','from','they','their'].includes(w));
export function lessonRelevance(prompt,text){return words(prompt).reduce((n,w)=>n+(String(text).toLowerCase().includes(w)?1:0),0);}
export function lessonScore(prompt,row,material=''){
 const normal=s=>' '+String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
 const named=words(row.title).length>0&&normal(prompt).includes(normal(row.title));
 return (named?1000000:0)+100*lessonRelevance(prompt,row.title)+10*lessonRelevance(prompt,row.className)+lessonRelevance(prompt,material);
}
async function mapLimited(rows,fn){const result=[];for(let i=0;i<rows.length;i+=6)result.push(...await Promise.all(rows.slice(i,i+6).map(fn)));return result;}
export async function findTeacherLessons(db,uid,prompt,selected,{games=true,learnerWork=true}={}){
 // Admin SDK access is deliberately narrowed to ownership/co-teaching, never organisation membership.
 const [owned,shared]=await Promise.all([db.collection('classes').where('teacherId','==',uid).limit(40).get(),db.collection('classes').where(new FieldPath('coTeachers',uid,'role'),'==','co').limit(40).get()]);
 const classes=[...new Map([...owned.docs,...shared.docs].map(c=>[c.id,c])).values()];
 let skipped=0;
 const groups=await mapLimited(classes,async c=>{try{const items=await c.ref.collection('items').limit(100).get();return items.docs.filter(i=>i.get('type')==='lesson'||!i.get('type')).map(i=>({classId:c.id,itemId:i.id,title:String(i.get('title')||'Untitled lesson').slice(0,160),className:String(c.get('name')||'').slice(0,100),at:i.get('updatedAt')?.toMillis?.()||i.get('createdAt')?.toMillis?.()||i.get('order')||0}));}catch{skipped++;return [];}});
 const catalog=groups.flat().filter(i=>i.classId!==selected?.classId||i.itemId!==selected?.itemId);
 catalog.sort((a,b)=>lessonScore(prompt,b)-lessonScore(prompt,a)||b.at-a.at);
 // On an attached activity, an ordinary question such as “What ICQs can I use here?”
 // needs only that activity. Keep cross-lesson search available when explicitly requested.
 const acrossLessons = /\b(?:other|previous|earlier|another|across|all|my)\s+(?:\w+\s+){0,2}lessons?\b|\bcompare\b.*\blessons?\b/i.test(prompt);
 const candidates=(selected && !acrossLessons ? catalog.filter(row=>lessonScore(prompt,row)>=1000000) : catalog).slice(0,8);
 if(selected && !candidates.length)return {lessons:[],scope:'Using the attached lesson or activity for this question.'};
 const read=(await mapLimited(candidates,async row=>{try{const lesson=await loadLessonSource(db,uid,{classId:row.classId,itemId:row.itemId},{games,learnerWork:false});return {...lesson,classId:row.classId,itemId:row.itemId,className:row.className,score:lessonScore(prompt,row,JSON.stringify(lesson.context.tasks))};}catch{skipped++;return null;}})).filter(Boolean);
 read.sort((a,b)=>b.score-a.score);
 const chosen=read.slice(0,3);
 const lessons=learnerWork?await Promise.all(chosen.map(async row=>{try{return {...await loadLessonSource(db,uid,{classId:row.classId,itemId:row.itemId},{games,learnerWork:true}),className:row.className};}catch{skipped++;return row;}})):chosen;
 return {lessons,scope:`Searched a bounded sample of ${catalog.length} lessons in ${classes.length} owned or co-taught classes (up to 40 owned classes, 40 co-taught classes and 100 items per class); read up to ${candidates.length} candidate lessons and supplied the three most relevant excerpts. This is not a claim to have read every lesson in full.${skipped?' Some material was unavailable and has not been read.':''}`};
}
