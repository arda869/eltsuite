// Shared by browse search and exact FAQ answers. Only reviewed catalogue text is returned.
export const normalise = s => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const stop = new Set('how do does i we you a an the can could would should my our me is are to for with in on of and or please'.split(' '));
export function exactArticles(articles, question) {
  const q=normalise(question);
  if(!q) return [];
  return articles.filter(a=>(a.questions??[]).some(s=>normalise(s)===q)).slice(0,2);
}
export function searchArticles(articles, query) {
  const q=normalise(query), words=[...new Set(q.split(' ').filter(w=>w&&!stop.has(w)))];
  if(!q) return articles;
  return articles.map((a,i)=>{
    const title=normalise(a.title), aliases=normalise((a.questions??[]).join(' ')), tags=normalise(`${a.keywords} ${a.category}`), body=normalise(`${a.summary} ${a.steps.join(' ')}`);
    const score=words.reduce((n,w)=>n+(title.includes(w)?5:0)+(aliases.includes(w)?3:0)+(tags.includes(w)?2:0)+(body.includes(w)?1:0),0)+(exactArticles([a],q).length?100:0);
    return {a,i,score};
  }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).map(r=>r.a);
}
