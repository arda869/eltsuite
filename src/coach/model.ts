import type { JSONContent } from '@tiptap/core';
export type Reflection = { id: string; title: string; text: string; content?: JSONContent; theme: string; reading?: string; readingTitle?: string; lesson: string; intention: string; reality: string; next: string; inquiry: string; at: number; version: number };
export type Inquiry = { evidenceLinks?: {investigationId:string;selected:string[];purpose:string;attachedAt:number}[]; id: string; title: string; baseline: string; intervention: string; evidence: string; ethics: string; observations: string; interpretation: string; limitations: string; next: string; sources: string; at: number; version: number };
export type CoachProfile = { qualifications: string; experience: string; roles: string[]; context: string; goals: string; beliefs: string; version: number };
export const emptyProfile: CoachProfile = { qualifications: '', experience: '', roles: [], context: '', goals: '', beliefs: '', version: 0 };
export const newReflection = (): Reflection => ({ id: crypto.randomUUID(), title: '', text: '', theme: 'Open reflection', reading: '', readingTitle: '', lesson: '', intention: '', reality: '', next: '', inquiry: '', at: Date.now(), version: 0 });
export const newInquiry = (): Inquiry => ({ id: crypto.randomUUID(), title: '', baseline: '', intervention: '', evidence: '', ethics: '', observations: '', interpretation: '', limitations: '', next: '', sources: '', at: Date.now(), version: 0 });
export const modes = ['Reflect with me', 'Challenge my thinking', 'Help me experiment', 'Teacher trainer mode'] as const;
export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reflectionDoc(text: string): JSONContent { return {type:'doc',content:text.split('\n').map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}))}; }
export function reflectionText(node: JSONContent): string { return node.type==='text' ? node.text??'' : (node.content??[]).map(reflectionText).join(['doc','bulletList','orderedList','listItem','table','tableRow'].includes(node.type??'')?'\n':'') + (node.type==='hardBreak'?'\n':''); }
