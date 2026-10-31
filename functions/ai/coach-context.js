export const contextDefaults = { profile: true, beliefs: true, reflections: true, inquiries: true };
export function contextPermissions(value = {}) {
  return Object.fromEntries(Object.keys(contextDefaults).map(key => [key, value?.[key] !== false]));
}
export function profileComplete(p) {
  return !!p && typeof p.qualifications === 'string' && p.qualifications.trim().length > 0 && p.qualifications.length <= 6000 && !p.qualifications.split(',').some(part => /^other:?\s*$/i.test(part.trim()))
    && ['0–2', '3–5', '6–10', '10+'].includes(p.experience)
    && Array.isArray(p.roles) && p.roles.length > 0 && p.roles.length <= 3
    && p.roles.every(role => ['Teacher', 'Teacher trainer', 'Academic manager'].includes(role))
    && typeof p.context === 'string' && p.context.trim().length >= 3 && p.context.length <= 6000;
}
// Rank only records already fetched from this teacher's private collection.
export function relevantWriting(rows, prompt, limit, preferredId = '') {
  const stop = new Set(['the','and','for','that','this','with','what','have','from','would','could','should','about','there','their','your','into','help','want','been']);
  const terms = [...new Set(prompt.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(t => !stop.has(t));
  return rows.map(row => {
    const text = Object.entries(row).filter(([key,value]) => key !== 'id' && typeof value === 'string').map(([,v]) => v).join(' ').toLowerCase();
    const score = (row.id === preferredId ? 10000 : 0) + terms.reduce((n,t) => n + (text.includes(t) ? 1 : 0), 0);
    return { row, score };
  }).sort((a,b) => b.score - a.score || (b.row.at ?? 0) - (a.row.at ?? 0)).slice(0,limit).map(({row}) => row);
}
export function writingExcerpt(row, kind) {
  const keys = kind === 'reflections' ? ['title','text','theme','intention','reality','next','readingTitle'] : ['title','baseline','intervention','evidence','ethics','observations','interpretation','limitations','next','sources'];
  return Object.fromEntries(keys.map(key => [key, typeof row[key] === 'string' ? row[key].slice(0,key === 'title' ? 200 : 1800) : '']));
}

export function beliefsComplete(p) {
 if(typeof p?.beliefs !== 'string' || p.beliefs.length>6000) return false;
 if(!p.beliefs.startsWith('01. ')) return p.beliefs.trim().length>=5;
 const answers=p.beliefs.split(/\n\n(?=\d{2}\. )/).slice(0,5);
 return answers.length===5 && answers.every(part=>part.slice(part.indexOf('\n')+1).trim().length>=3);
}
