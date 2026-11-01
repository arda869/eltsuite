// Pure helpers shared by validation, preview and the server save path.
export const importBodies=task=>[task,...(task.subTasks??[])];
export const importPicturePlans=rebuilt=>rebuilt.tasks.flatMap(t=>importBodies(t).flatMap(b=>(b.inlineElements??[]).filter(e=>e.kind==='picture').map(e=>e.data)));
export function checkImportPictures(rebuilt){
 const plans=importPicturePlans(rebuilt),refs=new Set(plans.map(p=>p.ref));
 if(plans.length>4||refs.size!==plans.length)throw Error('Use up to four source illustrations, each with a distinct reference.');
 for(const t of rebuilt.tasks)for(const b of importBodies(t))for(const e of b.inlineElements??[]){
  const images=e.kind==='pq-label'?[e.data.image]:e.kind==='pq-speaking'?e.data.images:[];
  for(const image of images)if(image.startsWith('picture:')&&!refs.has(image.slice(8)))throw Error('A task refers to a source illustration that is not included.');
 }
 return plans;
}
export function taskPictureIds(task,plans){
 const refs=Object.fromEntries(plans.map(p=>[p.ref,p.asset])),ids=new Set();
 for(const b of importBodies(task))for(const e of b.inlineElements??[]){
  if(e.kind==='picture')ids.add(e.data.asset||'missing:'+e.data.ref);
  for(const image of e.kind==='pq-label'?[e.data.image]:e.kind==='pq-speaking'?e.data.images:[])if(image.startsWith('picture:'))ids.add(refs[image.slice(8)]||'missing:'+image.slice(8));
 }
 return [...ids];
}
export function resolveImportPictures(node,plans,assetUrls){
 const refs=Object.fromEntries(plans.map(p=>[p.ref,assetUrls[p.asset]??'']));
 const url=s=>s?.startsWith('import-picture:')?(assetUrls[s.slice(15)]??''):s?.startsWith('picture:')?(refs[s.slice(8)]??''):s;
 const attrs=node.attrs?{...node.attrs}:undefined;
 if(attrs){if(typeof attrs.src==='string')attrs.src=url(attrs.src);if(attrs.data){attrs.data={...attrs.data};if(typeof attrs.data.image==='string')attrs.data.image=url(attrs.data.image);if(Array.isArray(attrs.data.images))attrs.data.images=attrs.data.images.map(url);}}
 return {...node,...(attrs?{attrs}:{}),...(node.content?{content:node.content.map(n=>resolveImportPictures(n,plans,assetUrls))}:{})};
}
