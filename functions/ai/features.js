export const AI_FEATURES = [
 ['lessonOutline','Lesson outlines',12],['lessonPlan','Lesson plans and reviews',12],['lessonActivities','Lesson activities',12],['materialImport','Material imports',12],
 ['coach','Teaching coach',12],['help','AI help',30],['speech','Voice generation',100],['transcription','Transcription',100],['dialogue','Dialogue drafts',30],
 ['lyrics','Lyric drafts',10],['song','Songs',3],['videoPlan','Video plans',10],['videoScene','Video scenes',24],['videoImage','Video reference images',10],
 ['lessonImage','Lesson images',12],['lessonAudio','Lesson recordings',12],['speakingPractice','Speaking conversations',10],['speakingFeedback','Speaking feedback',10]
].map(([id,label,defaultLimit])=>({id,label,defaultLimit}));
