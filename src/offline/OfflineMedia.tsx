import {useId,useMemo} from 'react';
import {MediaPlayer,type ScriptMode} from '../media/Player';
import type {Manifest,ScriptLine} from '../lib/archive';
// Use the presenting player and karaoke renderer with an embedded, local manifest.
export function OfflineMedia({src,video,title,script=[],scriptMode='karaoke',inline=false,mute=[]}:{src:string;video?:boolean;title?:string;script?:ScriptLine[];scriptMode?:ScriptMode;inline?:boolean;mute?:string[]}){
 const id=useId();
 const manifest=useMemo<Manifest>(()=>({kind:'link',url:src,size:0,video,title,script}),[src,video,title,script]);
 return <MediaPlayer classId="" mediaId={id} manifest={manifest} title={title} scriptMode={scriptMode} teaching inline={inline} mute={mute}/>;
}
