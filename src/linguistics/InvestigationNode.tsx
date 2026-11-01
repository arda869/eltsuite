import {Node,mergeAttributes} from '@tiptap/core';
import {NodeViewWrapper,ReactNodeViewRenderer,type NodeViewProps} from '@tiptap/react';
import {InlineInvestigation,InvestigationPicker} from './InlineInvestigation';
import type {Family} from './model';
function View({node,updateAttributes,deleteNode,editor}:NodeViewProps){return <NodeViewWrapper contentEditable={false}><div className="ling-actions">{editor.isEditable&&<button type="button" className="btn" onClick={deleteNode}>Remove block</button>}</div>{node.attrs.embedId?<InlineInvestigation embedId={node.attrs.embedId}/>:editor.isEditable?<InvestigationPicker family={node.attrs.family||undefined} onPick={embedId=>updateAttributes({embedId})} onCancel={deleteNode}/>:<p>Investigation has not been selected.</p>}</NodeViewWrapper>;}
export const InvestigationNode=Node.create({name:'investigation',group:'block',atom:true,draggable:true,addAttributes:()=>({id:{default:''},embedId:{default:''},family:{default:''},schemaVersion:{default:1}}),parseHTML:()=>[{tag:'div[data-investigation]'}],renderHTML:({HTMLAttributes})=>['div',mergeAttributes(HTMLAttributes,{'data-investigation':''})],addNodeView:()=>ReactNodeViewRenderer(View)});
export const newInvestigationBlock=(family:Family)=>({type:'investigation',attrs:{id:crypto.randomUUID(),family,embedId:'',schemaVersion:1}});
