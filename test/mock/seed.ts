const PACK = "# Pack test\n\n## Task 1: Pack\n[[fix]]\nShe have been to Paris twice. = has\n[[/fix]]\n\n[[categorise]]\nCountable: apple, chair, idea\nUncountable: water, advice, furniture\n[[/categorise]]\n\n[[transform words=2-5 key=NEVER]]\nThis is my first time in Hong Kong.\nI {{have never been|'ve never been}} to Hong Kong before.\n[[/transform]]\n\nWord formation:  The {{decision|^DECIDE}} was difficult.\n\n[[highlight]]\nTap every past participle: I have {{seen}} the film and she has {{read}} the book.\n[[/highlight]]\n\n[[sentences]]\nFirst, I booked the flight.\nThen I found a hotel.\nFinally, I packed my bag.\n[[/sentences]]\n\n[[label image=https://picsum.photos/600/400]]\nkitchen @ 20%,35%\nbedroom @ 70%,30%\n[[/label]]\n\n[[odd reason=yes]]\nhappy, sad, angry, *table\n[[/odd]]\n\n[[gapped extra=G]]\nText with gaps {{1}} and {{2}}.\n1 = The first removed sentence.\n2 = The second removed sentence.\nG = An extra sentence that does not fit.\n[[/gapped]]\n\n[[matching options=A,B,C,D]]\nWhich person mentions moving abroad? = B\nWhich person regrets a decision? = D\n[[/matching]]\n\n[[speaking timer=60]]\nCompare the two photos and say why people choose these holidays.\nimage: https://x.com/1.jpg\nimage: https://x.com/2.jpg\n[[/speaking]]\n\n[[survey anonymous=yes title=\"Feedback\"]]\nHow confident are you?\nscale: 1-5 | Not at all | Very confident\nWhich skills?\nmulti: Speaking | Listening\nHow do you feel?\nemoji\nAnything else?\n[[/survey]]\n\n[[long words=140-190 genre=essay rubric=cambridge]]\nWrite an essay.\n[[/long]]\n";
import { mockSignInTeacher } from './auth';
// ?seed  : fresh demo data, signed in as the teacher
// ?as=teacher | ?as=Mia : sign in as the teacher or a learner (first name)
const p = new URLSearchParams(location.search);
(window as unknown as { __mockReady: Promise<void> }).__mockReady = (async () => {
 try {
  if (p.has('seed')) {
    localStorage.clear();
    sessionStorage.clear();
    mockSignInTeacher();
    const { setDoc, doc } = await import('./firestore');
    await setDoc(doc({}, 'users', 'teacher1'), { role: 'teacher', displayName: 'Arda', email: 'teacher@example.com' });
    if(p.has('aiUsage')) {await setDoc(doc({},'superAdmins','teacher@example.com'),{name:'Preview admin'});await setDoc(doc({},'users','allowance-user'),{role:'learner',displayName:'Allowance learner',email:'allowance@example.test'});}
    const { createDemoClass } = await import('/src/lib/demo.ts');
    const r = await createDemoClass('teacher1');
    if(p.has('editorial')) await setDoc(doc({},'aiPilot','teacher1'),{enabled:true});
    localStorage.setItem('mockdemo', JSON.stringify(r));
    const { updateDoc } = await import('./firestore');
    await updateDoc(doc({}, 'classes', r.classId, 'items', r.itemId), { hidden: false });
    const { importLesson } = await import('/src/lib/textformat.ts');
    const { createLessonFromImport } = await import('/src/lib/transfer.ts');
    const pk = importLesson(PACK);
    const packId = await createLessonFromImport(r.classId, null, pk.title, pk.tasks);
    await updateDoc(doc({}, 'classes', r.classId, 'items', packId), { hidden: false });
    localStorage.setItem('mockdemo', JSON.stringify({ ...r, packId }));
    // back to the teacher (adding learners signs in a second app only)
    sessionStorage.setItem('mockuid', 'teacher1');
  }
  // ?colleagues : an organisation, colleagues with profiles, who is around, things shared (test/mock/colleagues.ts)
  if (p.has('colleagues')) await (await import('./colleagues')).seedColleagues();
  if (p.has('friday')) await (await import('./friday')).seedFriday();
  if (p.has('friday-brand')) await (await import('./friday')).seedFridayBrand();
  const as = p.get('as');
  if (as === 'teacher') sessionStorage.setItem('mockuid', 'teacher1');
  else if (as) {
    const fs = JSON.parse(localStorage.getItem('mockfs') || '{}');
    const hit = Object.entries(fs).find(([k, v]: [string, any]) => k.startsWith('users/') && v.role === 'learner' && String(v.displayName).startsWith(as));
    if (hit) sessionStorage.setItem('mockuid', hit[0].split('/')[1]);
  }
 } catch (e) { console.error('SEED FAILED', e); }
 console.log('seed done', sessionStorage.getItem('mockuid'));
})();
