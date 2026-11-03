// Bundle the locked, locally installed dictionaries; no text is sent to a service.
import {mkdir,copyFile,readdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),output=new URL('public/spelling/',root);await mkdir(output,{recursive:true});
for(const [variant,pkg] of [['en-US','dictionary-en'],['en-GB','dictionary-en-gb'],['en-AU','dictionary-en-au'],['en-CA','dictionary-en-ca']]){
 const source=new URL('node_modules/'+pkg+'/',root);
 for(const ext of ['aff','dic'])await copyFile(new URL('index.'+ext,source),new URL(variant+'.'+ext,output));
 for(const file of await readdir(source))if(/license/i.test(file))await copyFile(new URL(file,source),new URL(variant+'-'+file,output));
}
await copyFile(new URL('node_modules/nspell/license',root),new URL('nspell-license',output));
