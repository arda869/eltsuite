// A privacy-setting/context change starts a fresh model context, without erasing the visible record.
export function coachHistoryKey(profileVersion,preferencesVersion,context={}){
 const lesson=context.lessonContext||{},form=context.formContext||{};
 return JSON.stringify([profileVersion||0,preferencesVersion||0,lesson.classId||'',lesson.itemId||'',lesson.taskId||'',lesson.reportId||'',form.docId||'',form.formId||'',context.evidencePacketId||'',context.reflectionId||context.entryId||'']);
}
