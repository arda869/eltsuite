// Keep provider output opaque at rest: visual grids contain nested arrays,
// which Firestore Standard cannot store as native array values.
export function encodeGenerationResult(result) {
  const resultJson=JSON.stringify(result);
  if(typeof resultJson!=='string'||Buffer.byteLength(resultJson,'utf8')>700_000) throw Error('Generated result exceeds the safe storage limit.');
  return {resultJson};
}
export function readGenerationResult(record) {
  return typeof record?.resultJson==='string'?JSON.parse(record.resultJson):record?.result;
}
