export function validGame(g){
 if(!g||g.version!==1||!['shark','taxi','drive','blocks','show','targets','pinball','maze','hangman','search','slice','moles','wager','auction','pairs'].includes(g.type)||!['wood','paper','arcade','garden','space'].includes(g.theme))return false;
 if(g.roundSeconds!==undefined&&![20,30,60,120].includes(g.roundSeconds))return false;
 if(!Array.isArray(g.rounds)||!g.rounds.length||g.rounds.length>60)return false;
 if(g.type==='search'&&g.rounds.length>16||g.type==='pairs'&&(g.rounds.length<2||g.rounds.length>12))return false;
 const ids=new Set(),words=new Set(),clues=new Set();const norm=v=>v.trim().toLowerCase();
 for(const r of g.rounds){
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.prompt!=='string'||typeof r.answer!=='string'||!Array.isArray(r.choices)||r.choices.some(s=>typeof s!=='string'))return false;ids.add(r.id);
  if((!r.prompt.trim()||!r.answer.trim())&&!r.content)return false;
  if(['search','hangman'].includes(g.type)&&(!/^[a-z]{2,16}$/i.test(r.answer)||words.has(norm(r.answer))))return false;
  if(g.type==='pairs'&&(words.has(norm(r.answer))||clues.has(norm(r.prompt))))return false;
  words.add(norm(r.answer));clues.add(norm(r.prompt));
  if(['targets','pinball','maze','slice','moles','shark','taxi','drive','blocks'].includes(g.type)&&new Set([r.answer,...r.choices].map(norm).filter(Boolean)).size<2)return false;
  if(g.type==='auction'&&!['correct','incorrect'].includes(norm(r.answer)))return false;
 }
 return JSON.stringify(g).length<300000;
}
