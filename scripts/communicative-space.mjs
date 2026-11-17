// Match the existing recount's JSON footprint convention. Never log document content.
const jsonBytes=value=>JSON.stringify(value).length;
export async function privateTaskBytes(taskRef){
  const docs=await taskRef.collection('private').get();
  return docs.docs.reduce((bytes,snap)=>bytes+jsonBytes(snap.data()),0);
}
export async function taskCollectionBytes(tasks){
  let bytes=0;
  for(const ref of await tasks.listDocuments()){
    const task=await ref.get();
    bytes+=(task.exists?jsonBytes(task.data()):0)+await privateTaskBytes(ref);
  }
  return bytes;
}
export async function personalTaskBytes(userRef){return taskCollectionBytes(userRef.collection('libTasks'));}
export async function privatePictureBytes(ownerRef){
  let bytes=0;
  // listDocuments includes a deleted manifest with remaining chunk subcollections.
  for(const ref of await ownerRef.collection('activityMedia').listDocuments()){
    const manifest=await ref.get();if(manifest.exists)bytes+=jsonBytes(manifest.data());
    for(const projected of (await ref.collection('chunks').select('bytes').get()).docs){
      let size=projected.get('bytes');
      if(!Number.isSafeInteger(size)||size<0){
        // Older chunks predate rules-validated lengths. Read and backfill once;
        // subsequent recounts fetch only the small, validated scalar.
        const legacy=await projected.ref.get(),data=legacy.get('data');
        if(typeof data!=='string')continue;
        size=data.length;await projected.ref.set({bytes:size},{merge:true});
      }
      bytes+=size+jsonBytes({data:'',bytes:size});
    }
  }
  return bytes;
}
export async function liveActivityBytes(classRef){
  let bytes=0;
  for(const name of ['activities','comparisons']){
    // Missing parents can still have rooms/views after an interrupted cleanup.
    for(const ref of await classRef.collection(name).listDocuments()){
      const parent=await ref.get();if(parent.exists)bytes+=jsonBytes(parent.data());
      for(const child of name==='activities'?['rooms','views']:['views']){
        for(const snap of (await ref.collection(child).get()).docs)bytes+=jsonBytes(snap.data());
      }
    }
  }
  return bytes;
}
