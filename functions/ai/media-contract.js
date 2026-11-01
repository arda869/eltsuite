import { MONTHLY_LIMIT_MICRO_USD, PRICE_REVIEW_AFTER } from './budget.js';
export const mediaSchema={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['image','audio']},title:{type:'string',minLength:1,maxLength:100},prompt:{type:'string',maxLength:1200},alt:{type:'string',maxLength:300},lines:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,properties:{speaker:{type:'string',minLength:1,maxLength:40},text:{type:'string',minLength:1,maxLength:600}},required:['speaker','text']}}},required:['kind','title','prompt','alt','lines']};
export const mediaInstructions=`MEDIA PREPARATION IS AVAILABLE. For each activity, mediaPlan lists the images and audio the server will generate and save before the lesson can be created. Use images only for a concrete learner action, with a complete original prompt and neutral alt text. At most four images and eight media assets in the whole lesson; at most two assets per activity. No publisher characters, copied compositions, learner likenesses or invented source URLs. Number pictures in their displayed order; do not ask the image generator to draw labels or text. For audio supply only the exact spoken words in lines, with consistent speaker names, up to twelve short turns and 4,000 characters per recording. No stage directions or speaker labels inside spoken text. Leave image lines empty and audio prompt/alt empty. Every listening activity needs audio in mediaPlan; its private script must match those lines exactly. Say 'Listen', not 'Listen to your teacher'. For repeat listens refer to the recording in the earlier activity by its title rather than generating a duplicate. Later script analysis must remain separate. Do not include media if it does not serve the objective. For task layout choose stacked or columns; columns put input beside questions, useful for text/reference comparison. imageLayout chooses row or stacked: use row for comparisons and stacked when each picture needs full width. Keep layouts readable; do not force columns for dense input or long questions. Media preparation happens after activities, so do not claim assets exist during planning.`;
export function mediaRequests(activities){
 const requests=[];
 for(const [taskIndex,t] of activities.tasks.entries()) for(const [index,asset] of (t.mediaPlan??[]).entries()) {
  if(asset.kind==='image'&&(!asset.prompt.trim()||!asset.alt.trim()||asset.lines.length))throw Error('An image needs a prompt and alt text.');
  if(asset.kind==='audio'&&(!asset.lines.length||asset.lines.map(x=>x.text).join('').length>4000||asset.prompt||asset.alt))throw Error('A recording needs a bounded spoken script.');
  requests.push({id:`t${taskIndex}_m${index}`,taskIndex,index,...asset});
 }
 if(requests.length>8||requests.filter(x=>x.kind==='image').length>4)throw Error('Too many media assets.');
 return requests;
}
// Conservative reservations retained even on uncertain provider failures. No automatic paid retries.
// Verified 1 Nov 2026: image output $30/M, text $5/M; realtime mini audio output $20/M.
export function mediaReservation(asset,balance,now=Date.now()){
 if(now>=PRICE_REVIEW_AFTER)throw Error('Media prices need review.');
 const amount=asset.kind==='image'?100000:asset.lines.length*60000;
 if(!Number.isSafeInteger(balance)||balance<0||balance+amount>MONTHLY_LIMIT_MICRO_USD)throw Error('The US$20 monthly AI allowance cannot cover this media.');
 return {amount,balance:balance+amount};
}
export function wav(pcm){
 if(!Buffer.isBuffer(pcm)||!pcm.length||pcm.length%2)throw Error('Invalid audio.');
 const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);
}
export function sameWords(a,b){const words=x=>x.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu)?.join(' ')??'';return !!words(a)&&words(a)===words(b);}
