export const VARIANTS={'en-GB':'British English','en-US':'American English','en-AU':'Australian English','en-CA':'Canadian English'} as const;
export type Spelling={variant?:keyof typeof VARIANTS;enabled?:boolean;autocorrect?:boolean};
export const spellingDefaults:Required<Spelling>={variant:'en-GB',enabled:true,autocorrect:true};
export function resolveSpelling(...layers:(Spelling|null|undefined)[]):Required<Spelling>{
 const out={...spellingDefaults};for(const layer of layers){if(!layer)continue;if(layer.variant&&layer.variant in VARIANTS)out.variant=layer.variant;if(typeof layer.enabled==='boolean')out.enabled=layer.enabled;if(typeof layer.autocorrect==='boolean')out.autocorrect=layer.autocorrect;}if(!out.enabled)out.autocorrect=false;return out;
}
// Conservative typo repairs only: never rewrite real words, names, grammar or dialect.
const TYPOS:Record<string,string>={teh:'the',adn:'and',hte:'the',thier:'their',recieve:'receive',recieved:'received',becuase:'because',beacuse:'because',seperate:'separate',definately:'definitely',occured:'occurred',untill:'until',wich:'which',woudl:'would',shoudl:'should',coudl:'could',langauge:'language',exmaple:'example',studnet:'student',studnets:'students',teachre:'teacher'};
export function typoCorrection(word:string){const fixed=TYPOS[word.toLowerCase()];if(!fixed)return null;return word===word.toUpperCase()?fixed.toUpperCase():/^[A-Z]/.test(word)?fixed[0].toUpperCase()+fixed.slice(1):fixed;}
export function words(text:string){return [...text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)].map(m=>({word:m[0],start:m.index!,end:m.index!+m[0].length}));}
