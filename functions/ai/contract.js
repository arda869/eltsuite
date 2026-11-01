import { sourceSchema } from './research.js';
// Shared, dependency-free validation for the pilot. Never trust model or browser output.
export const methods = ['Recommend', 'PPP', 'TTT', 'Task-based', 'Guided discovery', 'Text-based', 'Skills'];
const string = { type: 'string', minLength: 1, maxLength: 6000 };
const object = (properties) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const list = (items, minItems = 1, maxItems = 20) => ({ type: 'array', items, minItems, maxItems });
const minutes = { type: 'integer', minimum: 1, maximum: 180 };
export const outlineSchema = object({ title: string, outcomes: list(string), methodology: string, rationale: string,
  stages: list(object({ id: string, title: string, aim: string, minutes, interaction: string }), 1, 12) });
export const planSchema = object({ title: string, mainAim: string, subsidiaryAims: string, assumedKnowledge: string,
  materials: string, methodology: string, rationale: string, assessment: string, adaptations: string,
  languageAnalysis: string,
  stages: list(object({ id: string, title: string, aim: string, minutes, interaction: string, procedures: string,
    instructions: string, instructionChecks: string, monitoring: string, feedback: string, transition: string,
    anticipatedProblems: string, solutions: string, materialIds: list(string, 0) }), 1, 12),
  learnerMaterials: list(object({ id: string, title: string, instructions: string, task: string, answerKey: string,
    script: string, attribution: string, accessibleAlternative: string }), 0, 20) });
// Older saved plans remain readable; newly generated stages must explain the activity.
const activityDetails = {
  activityType: {type:'string',minLength:1,maxLength:160},
  learnerAction: {type:'string',minLength:1,maxLength:800},
  material: {type:'string',minLength:1,maxLength:500},
  outcome: {type:'string',minLength:1,maxLength:500},
};
for (const schema of [outlineSchema,planSchema]) Object.assign(schema.properties.stages.items.properties,activityDetails);
for(const schema of [outlineSchema,planSchema]) schema.properties.sourceEvidence=sourceSchema;
export function generationSchema(schema) {
  const copy=structuredClone(schema);
  delete copy.properties.sourceEvidence;
  const strict=node=>{if(node && typeof node==='object'){if(node.type==='object')node.required=Object.keys(node.properties);for(const value of Object.values(node))if(value&&typeof value==='object')strict(value);}};
  strict(copy);
  return copy;
}
export const reviewSchema = object({ checks: list(object({ criterion: string, score: { type: 'integer', minimum: 1, maximum: 5 }, evidence: string }), 11, 11),
  criticalErrors: list(string, 0), suggestions: list(string, 0) });
export function validate(schema, value, path = 'output', root = schema) {
  if(schema.anyOf) {
    const tagged=schema.anyOf.find(b=>b.properties?.kind?.enum?.includes(value?.kind));
    if(tagged)return validate(tagged,value,path,root);
    for(const branch of schema.anyOf){try{return validate(branch,value,path,root);}catch{}}
    throw Error(`${path} must use a supported inline task type.`);
  }
  if(schema.$ref) {
    const name=schema.$ref.startsWith('#/$defs/')?schema.$ref.slice(8):'';
    if(!name || !root.$defs?.[name]) throw Error('Unknown schema reference.');
    return validate(root.$defs[name],value,path,root);
  }
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${path} has an invalid choice.`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${path} must be an object.`);
    if (Object.keys(value).some(k => !Object.hasOwn(schema.properties, k))) throw Error(`${path} has unknown fields.`);
    for (const key of Object.keys(schema.properties)) if(schema.required.includes(key) || Object.hasOwn(value,key)) validate(schema.properties[key], value[key], `${path}.${key}`, root);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) throw Error(`${path} has an invalid number of entries.`);
    value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, root));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.trim().length < schema.minLength || value.length > schema.maxLength) throw Error(`${path} needs text within the length limit.`);
  } else if (schema.type === 'boolean') {
    if(typeof value!=='boolean')throw Error(`${path} must be true or false.`);
  } else if (schema.type === 'number') {
    if(typeof value!=='number'||!Number.isFinite(value)||value<schema.minimum||value>schema.maximum)throw Error(`${path} needs a number within the limit.`);
  } else if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) throw Error(`${path} needs a whole number within the limit.`);
  return value;
}
export function validateBrief(b, training = false) {
  if (!b || typeof b !== 'object') throw Error('Add a lesson brief.');
  for (const key of ['objectives', 'context']) if (typeof b[key] !== 'string' || b[key].length > 2000 || !b[key].trim()) throw Error(`Add ${key} (up to 2,000 characters).`);
  if (!(training ? ['Foundation','Developing','Experienced','Mixed experience'] : ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).includes(b.level) || !(training?['Recommend','Experiential input','Exam preparation','Reflective practice','Workshop']:methods).includes(b.methodology)) throw Error('Choose a level and approach.');
  if (!Number.isInteger(b.duration) || b.duration < 15 || b.duration > 180) throw Error('Choose 15–180 minutes.');
  if (b.topic !== undefined && (typeof b.topic !== 'string' || b.topic.length > 2000)) throw Error('Shorten the optional topic.');
  const additionalObjectives = b.additionalObjectives ?? [];
  if (!Array.isArray(additionalObjectives) || additionalObjectives.some(x => typeof x !== 'string' || x.length > 2000) || additionalObjectives.join('').length > 12000) throw Error('Keep additional objectives within 12,000 characters.');
  return { ...(additionalObjectives.length?{additionalObjectives: additionalObjectives.map(x=>x.trim()).filter(Boolean)}:{}), topic: b.topic || '', objectives: b.objectives, context: b.context, level: b.level, methodology: b.methodology, duration: b.duration };
}
export function checkSequence(value, duration) {
  if (value.stages.reduce((sum, s) => sum + s.minutes, 0) !== duration) throw Error('Stage timings must add up to the lesson duration.');
  if (new Set(value.stages.map(s => s.id)).size !== value.stages.length) throw Error('Stage IDs must be unique.');
  if (value.learnerMaterials) {
    const ids = value.learnerMaterials.map(m => m.id);
    if (new Set(ids).size !== ids.length) throw Error('Material IDs must be unique.');
    if (value.stages.some(s => s.materialIds.some(id => !ids.includes(id)))) throw Error('A stage refers to missing materials.');
  }
  return value;
}
export function canPlan(uid, profile, account, classData) {
  return profile?.role === 'teacher' && account?.suspended !== true && account?.over !== true &&
    (classData?.teacherId === uid || classData?.coTeachers?.[uid]?.role === 'co');
}
