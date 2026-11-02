import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getFirestore} from 'firebase-admin/firestore';
import {handleObservation} from './service.js';
export const classroomObservation=onCall({region:'us-central1',maxInstances:5,timeoutSeconds:60},async req=>{
 try{return await handleObservation(getFirestore(),req.auth,req.data);}
 catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('invalid-argument',e.message||'Check the observation details and try again.');}
});
