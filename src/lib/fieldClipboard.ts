import {tell} from './ask';
export function captureFieldSelection(field:HTMLElement){
 if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement){const start=field.selectionStart??0,end=field.selectionEnd??0;return {text:field.value.slice(start,end),start,end,value:field.value,range:null as Range|null};}
 const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;
 return {text:range&&field.contains(range.commonAncestorContainer)?range.toString():'',start:0,end:0,value:'',range};
}
export async function editFieldClipboard(field:HTMLElement,action:'copy'|'cut',saved:ReturnType<typeof captureFieldSelection>){
 if(!saved.text)return;const input=field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement?field:null;
 if(action==='cut'&&input&&(input.readOnly||input.disabled))return;
 field.focus();if(input){if(input.value!==saved.value)return;input.setSelectionRange(saved.start,saved.end);}else if(saved.range){const s=window.getSelection();s?.removeAllRanges();s?.addRange(saved.range);}
 if(document.execCommand(action)){
  // Some browsers report success for a menu-triggered cut without replacing the
  // system clipboard. Keep the selected text available for the next Paste.
  try{await navigator.clipboard.writeText(saved.text);}catch{/* The native command may already have copied it. */}
  return;
 }
 try{await navigator.clipboard.writeText(saved.text);if(action==='cut'){
  if(input&&input.value===saved.value){const value=input.value.slice(0,saved.start)+input.value.slice(saved.end),proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(input,value);input.setSelectionRange(saved.start,saved.start);input.dispatchEvent(new Event('input',{bubbles:true}));}
  else if(saved.range?.commonAncestorContainer.isConnected){saved.range.deleteContents();field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteByCut'}));}
 }}catch{await tell('Your browser couldn’t access the clipboard. Your text is unchanged. Use Ctrl+X to cut, or ⌘X on Mac.');}
}
