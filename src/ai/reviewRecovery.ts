// Resume only a server-confirmed checkpoint, once, with the identical request ID.
// Never restart generation or retry billing, access or credential failures.
export async function withReviewRecovery<T>(request:()=>Promise<T>,onResume:()=>void):Promise<T>{
 try{return await request();}catch(error){
  const details=(error as {details?:{resumable?:boolean;phase?:string;reason?:string}})?.details;
  if(details?.resumable!==true||details.phase!=='review'||!['editorial','editorial_patch','timeout','connection','provider','incomplete','output_validation'].includes(details.reason??''))throw error;
  onResume();return request();
 }
}
