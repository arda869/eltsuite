const OWNER='ardanurioglu@gmail.com';
// The exemption is derived only from authenticated identity and the protected
// Super Admin registry. Pilot access, teacher access and money limits still apply.
export async function isGenerationAdmin(db,auth) {
  if(!auth || auth.token?.proxyBy || auth.token?.email_verified!==true) return false;
  const email=String(auth.token.email??'').toLowerCase();
  if(!email || email.includes('/')) return false;
  if(email===OWNER) return true;
  return (await db.doc(`superAdmins/${email}`).get()).exists;
}
export function dailyAllowanceReached(personal,global,units,isAdmin) {
  return isAdmin!==true && (personal+units>12 || global+units>120);
}
export function dailyGlobalUsage(record,units,isAdmin) {
  const field=isAdmin===true?'adminCalls':'calls';
  return {[field]:(record?.[field]??0)+units};
}
