import { HttpsError } from 'firebase-functions/v2/https';
import { responseText } from '../ai/memories.js';
const short=(x,n)=>typeof x==='string'?x.slice(0,n):'';
export function lessonReference(value){
  if(value==null)return null;
  if(typeof value!=='object'||['classId','itemId'].some(k=>typeof value[k]!=='string'||!/^[\w-]{1,150}$/.test(value[k])))throw Error('Choose a lesson from Classroom.');
  return {classId:value.classId,itemId:value.itemId};
}
export async function songLessonContext(db,uid,value){
  const reference=lessonReference(value);if(!reference)return null;
  const cls=await db.doc(`classes/${reference.classId}`).get(),c=cls.data();
  if(!c||c.status==='deleted'||(c.teacherId!==uid&&c.coTeachers?.[uid]?.role!=='co'))throw new HttpsError('permission-denied','Choose a lesson from a classroom you teach.');
  const lesson=await cls.ref.collection('items').doc(reference.itemId).get();
  if(!lesson.exists||lesson.get('type')!=='lesson')throw new HttpsError('not-found','This lesson is no longer available. Choose another lesson.');
  const tasks=await lesson.ref.collection('tasks').orderBy('order').limit(6).get();
  return {reference,title:short(lesson.get('title'),160),className:short(c.name,120),level:short(c.level,20),audience:short(c.learningProfile?.ageGroup,40),focus:short(lesson.get('speakingFocus'),1000),tasks:tasks.docs.filter(t=>t.get('kind')!=='section').map(t=>({title:short(t.get('title'),120),instructions:short(t.get('instructions'),500),text:responseText(t.get('content'))})),};
}
