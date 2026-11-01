import type {JSONContent} from '@tiptap/react';
import type {AnswerKey} from '../../src/lib/questions';
import type {ImportElement} from './import-types';
export function nativeImportedElements(elements?:ImportElement[],prefix?:string,options?:{addBank?:boolean}):{content:JSONContent[];key:AnswerKey;notes:string;requirements:string[]};
export function importRequirements(elements?:ImportElement[]):string[];
