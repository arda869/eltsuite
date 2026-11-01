// Reuse identical schema branches without changing any field or constraint.
// Keep this transport-only: stored contracts and validation stay unchanged.
export function compactSchema(schema) {
 const counts=new Map();
 const scan=node=>{if(!node||typeof node!=='object')return;if(node.type&&JSON.stringify(node).length>250){const key=JSON.stringify(node);counts.set(key,(counts.get(key)??0)+1);}for(const value of Object.values(node))scan(value);};
 scan(schema);
 const defs={...schema.$defs}, names=new Map();let next=0;
 const visit=(node,root=false)=>{
  if(!node||typeof node!=='object')return node;
  const key=JSON.stringify(node);
  if(!root&&node.type&&(counts.get(key)??0)>1){
   if(!names.has(key)){let name;do{name=`shared_${++next}`;}while(Object.hasOwn(defs,name));names.set(key,name);defs[name]=visit(node,true);}
   return {$ref:`#/$defs/${names.get(key)}`};
  }
  return Array.isArray(node)?node.map(x=>visit(x)):Object.fromEntries(Object.entries(node).filter(([k])=>!root||k!=='$defs').map(([k,v])=>[k,visit(v)]));
 };
 const result=visit(schema,true);
 for(const [name,value] of Object.entries(schema.$defs??{}))defs[name]=visit(value,true);
 if(Object.keys(defs).length)result.$defs=defs;
 return result;
}
