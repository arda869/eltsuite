// Which model does each AI job. One place to change, so a job can move to a faster or cheaper model
// once it has passed the side-by-side test (scripts/ai-compare.mjs). Every text job goes through
// generate() in provider.js, which looks its model up here by the job's name.
//
// Prices are per million tokens, from https://developers.openai.com/api/docs/pricing. Check them
// before adding a model; budget.js charges every job at the dearest price, to stay on the safe side.
export const TEXT_MODELS = {
  'gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10, note: 'Strongest. Slower. For planning, checking and anything a teacher relies on being right.' },
  'gpt-6.1-terra': { input: 1, cachedInput: 0.05, output: 5, note: 'Faster and half the price. For short, well-defined jobs.' },
};
export const DEFAULT_TEXT_MODEL = 'gpt-6.1-sol';

// Job name → model. A job left out uses the model its caller asks for.
// Keep on Sol: work where a mistake reaches learners or the teacher relies on it being right.
// Candidates for Terra are marked; move one only when its side-by-side result says so.
export const JOB_MODEL = {
  // Making lessons and tasks
  outline: 'gpt-6.1-sol',
  plan: 'gpt-6.1-sol',
  activities: 'gpt-6.1-sol',
  lesson_revision: 'gpt-6.1-sol',
  review: 'gpt-6.1-sol',
  editorial_repair: 'gpt-6.1-sol',
  research: 'gpt-6.1-sol',
  research_review: 'gpt-6.1-sol',
  task_keys: 'gpt-6.1-sol',
  // Importing
  rebuild: 'gpt-6.1-sol',
  importRepair: 'gpt-6.1-sol',
  importSenseCheck: 'gpt-6.1-sol',
  importKinds: 'gpt-6.1-sol', // candidate: Terra
  importPictureCheck: 'gpt-6.1-sol', // test both: needs reliable picture reading
  // Pictures
  image_search: 'gpt-6.1-sol', // candidate: Terra
  image_review: 'gpt-6.1-sol', // test both
  // Lesson tools
  task_edit: 'gpt-6.1-sol', // candidate: Terra
  task_ideas: 'gpt-6.1-sol', // candidate: Terra
  // Around the suite
  help_selection: 'gpt-6.1-sol', // candidate: Terra
  teaching_definition: 'gpt-6.1-sol', // candidate: Terra
  classroom_game: 'gpt-6.1-sol', // candidate: Terra
  learningReport: 'gpt-6.1-sol', // candidate: Terra
  song_lyrics: 'gpt-6.1-sol', // candidate: Terra
  teaching_dialogue: 'gpt-6.1-sol', // candidate: Terra
  classroom_video_plan: 'gpt-6.1-sol', // candidate: Terra
  teaching_coach: 'gpt-6.1-sol', // test both
  speaking_feedback: 'gpt-6.1-sol', // test both
  linguistics_analysis: 'gpt-6.1-sol', // test both
};

export function modelFor(name, requested) {
  const chosen = JOB_MODEL[name] || requested || DEFAULT_TEXT_MODEL;
  return TEXT_MODELS[chosen] ? chosen : requested;
}
