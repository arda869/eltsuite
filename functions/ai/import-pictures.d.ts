import type {JSONContent} from '@tiptap/react';
export type PicturePlan={ref:string;sourceImage:number;x:number;y:number;width:number;height:number;alt:string;recreationPrompt:string;asset:string};
export function importPicturePlans(rebuilt:unknown):PicturePlan[];
export function resolveImportPictures(node:JSONContent,plans:PicturePlan[],assetUrls:Record<string,string>):JSONContent;
