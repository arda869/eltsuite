export function normalise(s: unknown): string;
export function exactArticles<T extends {questions?: string[]}>(articles:T[],question:string):T[];
export function searchArticles<T extends {title:string;questions?:string[];keywords:string;category:string;summary:string;steps:string[]}>(articles:T[],query:string):T[];
