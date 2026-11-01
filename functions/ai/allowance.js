const OWNER='ardanurioglu@gmail.com';
// The exemption is derived only from authenticated identity and the protected
// Super Admin registry. Feature access and teaching permissions still apply. Usage and budget caps do not.
export async function isGenerationAdmin(db,auth) {
  if(!auth || auth.token?.proxyBy || auth.token?.email_verified!==true) return false;
  const email=String(auth.token.email??'').toLowerCase();
  if(!email || email.includes('/')) return false;
  if(email===OWNER) return true;
  return (await db.doc(`superAdmins/${email}`).get()).exists;
}
export function dailyGlobalUsage(record,units,isAdmin) {
  const field=isAdmin===true?'adminCalls':'calls';
  return {[field]:(record?.[field]??0)+units};
}
