import { mergeAttributes, Node } from '@tiptap/core';
export const MediaBlockSchema = Node.create({
  name:'media',group:'block',atom:true,draggable:true,
  addAttributes:()=>({media:{default:''},archiveId:{default:''},kind:{default:'audio'},title:{default:''},scriptMode:{default:'karaoke'},plays:{default:0},mute:{default:[]},space:{default:''},size:{default:'m'},notes:{default:false}}),
  parseHTML:()=>[{tag:'div[data-media]'}],
  renderHTML:({HTMLAttributes})=>['div',mergeAttributes(HTMLAttributes,{'data-media':''})],
});
export const InlineMediaSchema = MediaBlockSchema.extend({
  name:'inlineMedia',group:'inline',inline:true,
  parseHTML:()=>[{tag:'span[data-inline-media]'}],
  renderHTML:({HTMLAttributes})=>['span',mergeAttributes(HTMLAttributes,{'data-inline-media':''})],
});
