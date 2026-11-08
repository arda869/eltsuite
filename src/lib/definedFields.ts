// Firestore rejects undefined properties inside a document field. Optional
// settings should be absent until the teacher chooses a value for them.
export const definedFields = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
