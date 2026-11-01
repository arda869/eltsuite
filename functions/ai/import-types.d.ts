export type ImportValue=string|number|boolean|null|ImportValue[]|{[key:string]:ImportValue};
export type ImportSchema={type?:string;enum?:(string|number)[];minimum?:number;maximum?:number;minItems?:number;maxItems?:number;minLength?:number;maxLength?:number;items?:ImportSchema;properties?:Record<string,ImportSchema>};
export type ImportElement={kind:string;prompt:string;reason:string;feedback:string;example:boolean;needs:string[];data:Record<string,ImportValue>};
export const IMPORT_TYPES:{kind:string;label:string;hint:string;dataSchema:ImportSchema}[];
export const IMPORT_TYPE_BY_KIND:Map<string,typeof IMPORT_TYPES[number]>;
export function defaultSchemaValue(schema:ImportSchema):ImportValue;
export function newImportElement(kind:string,prompt?:string):ImportElement;
