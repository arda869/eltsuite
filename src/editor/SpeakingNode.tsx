import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { lazy, Suspense } from 'react';
import { newId } from '../lib/tasks';
const SpeakingEditor=lazy(()=>import('./SpeakingEditor'));
function SpeakingView(props:NodeViewProps){return <Suspense fallback={<NodeViewWrapper contentEditable={false}>Opening AI conversation…</NodeViewWrapper>}><SpeakingEditor {...props}/></Suspense>;}
export const SpeakingBlock=Node.create({name:'speakingPractice',group:'block',atom:true,draggable:true,
  addAttributes:()=>({id:{default:''},contextSeeded:{default:false},contextApplied:{default:false},feedbackMode:{default:'task'},focusOptions:{default:['Asking for clarification','Using the target vocabulary']},lessonId:{default:''},title:{default:'Make a plan together'},scenario:{default:'You and a friend are planning an afternoon out. Agree on where to go, when to meet, and what to bring.'},focus:{default:'Ask for clarification and check that you have understood your partner.'},learnerRole:{default:'A friend making plans'},partnerRole:{default:'A friend with a few different ideas'},level:{default:'B1'},seconds:{default:120}}),
  parseHTML:()=>[{tag:'div[data-speaking-practice]'}],renderHTML:({HTMLAttributes})=>['div',mergeAttributes(HTMLAttributes,{'data-speaking-practice':''})],addNodeView:()=>ReactNodeViewRenderer(SpeakingView),
});
export const newSpeaking=(editor?:Editor)=>{
  // Take surrounding learner material, never private keys or teacher notes.
  const text=editor?.state.doc.textBetween(0,editor.state.doc.content.size,'\n','').trim().slice(0,1400)||'';
  return {type:'speakingPractice',attrs:{id:newId(),contextSeeded:true,feedbackMode:'task',title:'AI conversation',scenario:text,focus:'Achieve the communicative goal in the activity. Respond to your partner and clarify meaning when needed.',learnerRole:'The learner taking part in this activity',partnerRole:'The other person in this activity'}};
};
