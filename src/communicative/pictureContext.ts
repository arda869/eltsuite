import type {Editor} from '@tiptap/core';
export function insideCommunicativeActivity(editor:Editor):boolean {
  const {$from}=editor.state.selection;
  for(let depth=1;depth<=$from.depth;depth++)if($from.node(depth).type.name==='communicativeActivity')return true;
  return false;
}
