import type { MaterialSource } from './readSource';

// The model sees worksheet pages first, then distinctly labelled answer-key pages.
// Keeping their image indices stable matters for source-illustration crops.
export function combineMaterialSources(worksheet:MaterialSource,key:MaterialSource|null):MaterialSource{
 if(!key)return worksheet;
 const images=[...worksheet.images,...key.images];
 if(images.length>6)throw Error('The worksheet and answer key have more than six pages or pictures together. Choose fewer pages from one file.');
 if(images.reduce((bytes,image)=>bytes+Math.ceil((image.split(',')[1]?.length??0)*.75),0)>2_000_000)throw Error('The worksheet and answer-key previews are too large together. Choose fewer pages.');
 const keyStart=`\n\n[Answer key: ${key.name}]\n`;
 const text=worksheet.text+(key.text.trim()?keyStart+key.text+'\n[End answer key]':keyStart+'Use the answer-key page preview(s) labelled below.');
 if(text.length>30000)throw Error('The worksheet and answer key have more than 30,000 characters together. Choose fewer pages.');
 return {name:worksheet.name,text,images,answerKeyImageStart:worksheet.images.length,
  imageLabels:[...worksheet.images.map((_,i)=>worksheet.imageLabels?.[i]??`Worksheet preview ${i+1}`),...key.images.map((_,i)=>`Answer key · ${key.name} · ${key.imageLabels?.[i]??`page ${i+1}`}`.slice(0,200))],
  warnings:[...worksheet.warnings,...key.warnings.map(w=>`Answer key: ${w}`)].slice(0,20)};
}
