// List prices, reviewed 2026-11-12. Calculations are NEVER invoice confirmation.
export const PRICING_VERSION = '2026-11-12.1';
export const SOURCES = {
 openai: 'https://developers.openai.com/api/docs/pricing',
 google: 'https://ai.google.dev/gemini-api/docs/pricing',
 runway: 'https://docs.dev.runwayml.com/guides/pricing/',
};
export const RATE_CARD = {
 'gpt-6.1-sol': {provider:'openai',textInput:2,textCached:0.1,textOutput:10},
 'gpt-6.1-terra': {provider:'openai',textInput:1,textCached:0.05,textOutput:5},
 'gpt-image-2.5-flare': {provider:'openai',textInput:5,textCached:1.25,imageInput:8,imageCached:2,imageOutput:30},
 'gpt-image-2.5-sunburst': {provider:'openai',textInput:5,textCached:1.25,imageInput:8,imageCached:2,imageOutput:30},
 'gpt-realtime-2.1-mini': {provider:'openai',textInput:0.6,textCached:0.06,textOutput:2.4,audioInput:10,audioCached:0.3,audioOutput:20,imageInput:0.8,imageCached:0.08},
 'gpt-4o-transcribe-diarize': {provider:'openai',audioInput:2.5,textInput:2.5,textOutput:10,estimatedMinute:0.006},
 'gpt-4o-mini-transcribe': {provider:'openai',audioInput:1.25,textInput:1.25,textOutput:5,estimatedMinute:0.003},
 'lyria-3-clip-preview': {provider:'google',song:0.04},
 'lyria-3.5': {provider:'google',song:0.08},
 'gen4.5': {provider:'runway',videoSecond:0.12},
};
const number = n => Number.isFinite(n) && n >= 0;
export function calculateCost(model, usage = {}, basis = 'provider_usage') {
 const rate=RATE_CARD[model];
 const unknown=reason=>({costMicroUsd:null,basis:'unknown',reason,pricingVersion:PRICING_VERSION});
 if(!rate)return unknown('Unpriced model');
 let micro=0, count=0;
 for(const [unit,value] of Object.entries(usage)) {
  if(!number(value))return unknown('Invalid usage');
  if(unit in rate){micro+=value*rate[unit];count++;}
 }
 if(number(usage.songs)&&rate.song){micro+=usage.songs*rate.song*1e6;count++;}
 if(number(usage.videoSeconds)&&rate.videoSecond){micro+=usage.videoSeconds*rate.videoSecond*1e6;count++;}
 if(number(usage.audioSeconds)&&rate.estimatedMinute){micro+=usage.audioSeconds/60*rate.estimatedMinute*1e6;count++;basis='estimated_usage';}
 if(!count)return unknown('Provider did not return billable usage');
 return {costMicroUsd:Math.ceil(micro-1e-8),basis,pricingVersion:PRICING_VERSION,rateSnapshot:rate,source:SOURCES[rate.provider]};
}
// Flatten only billing fields; no prompts, transcripts, images, names or credentials.
export function normaliseUsage(model, body) {
 const u=body?.usage;
 if(!u)return {};
 if(model.includes('transcribe')) {
  if(u.type==='duration'&&number(u.seconds))return {audioSeconds:u.seconds};
  const d=u.input_token_details??u.input_tokens_details;
  if(d&&number(d.audio_tokens)&&number(d.text_tokens)&&number(u.output_tokens))return {audioInput:d.audio_tokens,textInput:d.text_tokens,textOutput:u.output_tokens};
  return {};
 }
 if(model==='gpt-6.1-sol'||model==='gpt-6.1-terra') {
  if(!number(u.input_tokens)||!number(u.output_tokens))return {};
  const cached=u.input_tokens_details?.cached_tokens??0;
  if(!number(cached)||cached>u.input_tokens)return {};
  return {textInput:u.input_tokens-cached,textCached:cached,textOutput:u.output_tokens};
 }
 if(model.startsWith('gpt-image-')) {
  const d=u.input_tokens_details;
  if(!d||!number(d.text_tokens)||!number(d.image_tokens)||!number(u.output_tokens))return {};
  const c=d.cached_tokens_details??{};
  // An undisclosed cache split cannot be billed accurately at two different rates.
  if(d.cached_tokens&&!Object.keys(c).length)return {};
  return {textInput:d.text_tokens-(c.text_tokens??0),textCached:c.text_tokens??0,imageInput:d.image_tokens-(c.image_tokens??0),imageCached:c.image_tokens??0,imageOutput:u.output_tokens};
 }
 if(model.startsWith('gpt-realtime-')) {
  const i=u.input_token_details,o=u.output_token_details,c=i?.cached_tokens_details??{};
  if(!i||!o||!number(i.text_tokens)||!number(i.audio_tokens)||!number(o.text_tokens)||!number(o.audio_tokens))return {};
  if(i.cached_tokens&&!Object.keys(c).length)return {};
  return {textInput:i.text_tokens-(c.text_tokens??0),textCached:c.text_tokens??0,audioInput:i.audio_tokens-(c.audio_tokens??0),audioCached:c.audio_tokens??0,imageInput:(i.image_tokens??0)-(c.image_tokens??0),imageCached:c.image_tokens??0,textOutput:o.text_tokens,audioOutput:o.audio_tokens};
 }
 return {};
}
export const recommendedCredits = micro => Number.isSafeInteger(micro)&&micro>=0 ? Math.ceil(micro/2500) : null;
