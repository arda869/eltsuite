import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getFirestore} from 'firebase-admin/firestore';
import {defineSecret} from 'firebase-functions/params';
import {analyseInvestigation} from './analysis.js';
import {handleLinguistics} from './service.js';
const corpusConnected=process.env.ELT_CORPUS_CONNECTED==='true';
// Unbound secret parameters are still required by Firebase deployment discovery.
const corpusKey=corpusConnected?defineSecret('SKETCH_ENGINE_API_KEY'):null;
export const appliedLinguistics=onCall({region:'us-central1',secrets:corpusConnected?[corpusKey]:[],maxInstances:2,timeoutSeconds:60},async req=>{
 try{return await handleLinguistics(getFirestore(),req.auth,req.data,{apiKey:corpusConnected?corpusKey.value():''});}catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('invalid-argument',e.message||'We could not complete that action. Your work is kept.');}
});
const aiKey=defineSecret('OPENAI_API_KEY');
export const appliedLinguisticsAnalysis=onCall({region:'us-central1',secrets:[aiKey],maxInstances:2,concurrency:4,timeoutSeconds:540},req=>analyseInvestigation(getFirestore(),req.auth,req.data||{},aiKey.value()));
