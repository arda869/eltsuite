export const voiceCreditMessage = 'The voice service has run out of credit. Your draft is saved. Ask an ELT Suite administrator to restore it, then retry this recording.';

export function mediaFailureMessage(error) {
 if(error?.code==='resource-exhausted')return error.message;
 if(error?.code==='voice-credit-exhausted')return voiceCreditMessage;
 const message=error instanceof Error?error.message:String(error??'');
 if(message.includes('allowance'))return 'Monthly AI allowance reached.';
 if(message.includes('script'))return 'Audio did not match the script. Retry this recording.';
 return 'Media could not be prepared. Retry this asset.';
}
