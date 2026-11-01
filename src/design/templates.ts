import type { DPage, El } from './model';
export type TplEl = Omit<El, 'id' | 'page' | 'z'>;
export type Tpl = { k: string; name: string; about: string; pages: { p: Omit<DPage, 'id' | 'order'>; els: TplEl[] }[] };
export const TEMPLATES: Tpl[] = [
 {k:'square',name:'Square image',about:'A versatile canvas for pictures and graphics',pages:[{p:{w:1080,h:1080,bg:'#ffffff'},els:[]}]},
 {k:'landscape',name:'Landscape image',about:'Room for a scene or side-by-side pictures',pages:[{p:{w:1536,h:1024,bg:'#ffffff'},els:[]}]},
 {k:'portrait',name:'Portrait image',about:'A tall canvas for a character or illustration',pages:[{p:{w:1024,h:1536,bg:'#ffffff'},els:[]}]},
];
