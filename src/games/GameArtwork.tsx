import type { ReactNode } from 'react';
import type { GameType } from './model';

/**
 * Lightweight, original vector covers. No external image requests or emoji fonts.
 * They share one palette so the gallery feels like a set of collectible iPad apps.
 */
export function GameArtwork({ type }: { type: GameType }) {
  const ink = '#233d48', ivory = '#fff7ec', clay = '#d98158', gold = '#efbd69', teal = '#67b5aa';
  let scene: ReactNode;
  switch (type) {
    case 'shark':
      scene = <><circle cx="258" cy="38" r="24" fill={gold}/><path d="M0 102 Q58 75 112 103 T225 102 T320 94 V180 H0Z" fill="#5bafbb"/><path d="M0 126 Q68 106 125 127 T245 122 T320 127 V180 H0Z" fill="#387f9d"/><path d="M34 103 Q55 73 80 101Z" fill="#8cbf80"/><path d="M50 98 L55 65" stroke={ink} strokeWidth="4"/><path d="M54 66 L79 88 L54 88Z" fill={ivory}/><path d="M190 124 Q205 85 226 127 Q203 118 190 124Z" fill={ink}/><path d="M218 148 Q245 138 266 145" stroke={ivory} strokeWidth="3" fill="none" strokeLinecap="round"/><circle cx="240" cy="151" r="3" fill={ivory}/></>;
      break;
    case 'taxi':
      scene = <><path d="M0 114H320V180H0Z" fill="#8dbfc0"/><path d="M0 143H320V180H0Z" fill={ink}/>{[20,72,131,197,259].map((x,i)=><rect key={x} x={x} y={50+(i%3)*14} width={34+i%2*12} height={94} rx="3" fill={i%2?'#789dad':'#adc6bc'}/>)}<path d="M69 130 L93 98 Q99 92 118 92 H192 Q205 92 213 107 L229 130Z" fill={gold}/><rect x="60" y="124" width="185" height="37" rx="12" fill={gold} stroke={ink} strokeWidth="5"/><path d="M100 103H150V124H89Z M157 103H191L208 124H157Z" fill="#d8eddf"/><rect x="145" y="82" width="36" height="13" rx="4" fill={ivory} stroke={ink} strokeWidth="3"/><circle cx="101" cy="157" r="16" fill={ink}/><circle cx="207" cy="157" r="16" fill={ink}/><path d="M21 166h30m215 0h34" stroke={ivory} strokeWidth="5" strokeLinecap="round"/></>;
      break;
    case 'drive':
      scene = <><path d="M105 -10 L225 -10 L303 180 H24Z" fill="#345f6c"/><path d="M156 0L156 180" stroke={ivory} strokeDasharray="20 17" strokeWidth="6"/><path d="M86 128h140l16 26H72Z" fill={clay} stroke={ink} strokeWidth="5"/><path d="M109 110h96l20 22H89Z" fill="#e8a279"/><path d="M116 113h83l10 15H105Z" fill="#bbe0d2"/><rect x="83" y="151" width="35" height="19" rx="7" fill={ink}/><rect x="198" y="151" width="35" height="19" rx="7" fill={ink}/><path d="M126 151h72" stroke={ivory} strokeWidth="6" strokeLinecap="round"/><path d="M30 54L66 68M258 43l34-15" stroke={gold} strokeWidth="7" strokeLinecap="round"/></>;
      break;
    case 'blocks':
      scene = <><rect x="86" y="15" width="148" height="162" rx="14" fill={ink}/>{[[104,35,clay],[136,35,clay],[136,67,clay],[168,67,clay],[104,99,teal],[136,99,teal],[168,99,teal],[200,99,teal],[104,131,gold],[136,131,gold],[168,131,gold],[200,131,gold]].map(([x,y,c],i)=><rect key={i} x={Number(x)} y={Number(y)} width="27" height="27" rx="5" fill={String(c)} stroke={ivory} strokeWidth="2"/>)}<path d="M54 27v98M266 48v106" stroke={ivory} strokeOpacity=".55" strokeDasharray="4 9" strokeWidth="3"/></>;
      break;
    case 'show':
      scene = <><path d="M0 0L118 0L170 156Z" fill="#e6b873" fillOpacity=".5"/><path d="M320 0L207 0L160 156Z" fill="#f9ead0" fillOpacity=".4"/><ellipse cx="160" cy="160" rx="132" ry="24" fill="#315763"/><rect x="106" y="85" width="108" height="78" rx="17" fill={clay} stroke={ink} strokeWidth="5"/><circle cx="160" cy="118" r="24" fill={ivory}/><path d="M160 99L166 112L180 114L170 123L172 137L160 129L148 137L150 123L140 114L154 112Z" fill={gold}/><path d="M63 90l15 20m174-20l-15 20" stroke={ivory} strokeWidth="6" strokeLinecap="round"/><circle cx="63" cy="84" r="10" fill={gold}/><circle cx="258" cy="84" r="10" fill={gold}/></>;
      break;
    case 'targets':
      scene = <><circle cx="148" cy="91" r="72" fill={ivory} stroke={ink} strokeWidth="8"/><circle cx="148" cy="91" r="52" fill={clay}/><circle cx="148" cy="91" r="32" fill={ivory}/><circle cx="148" cy="91" r="15" fill={teal}/><path d="M250 31L151 89" stroke={ink} strokeWidth="8" strokeLinecap="round"/><path d="M253 29l30-12-8 24Z" fill={gold} stroke={ink} strokeWidth="4"/><path d="M151 89l17-6-4 18Z" fill={ink}/><path d="M35 35l16 10M39 137l16-9" stroke={ivory} strokeWidth="5" strokeLinecap="round"/></>;
      break;
    case 'pinball':
      scene = <><path d="M87 172V69Q87 23 160 23Q233 23 233 69V172Z" fill="#355c70" stroke={ivory} strokeWidth="6"/><circle cx="159" cy="65" r="23" fill={clay} stroke={gold} strokeWidth="7"/><circle cx="117" cy="107" r="15" fill={gold} stroke={ivory} strokeWidth="5"/><circle cx="198" cy="110" r="15" fill={teal} stroke={ivory} strokeWidth="5"/><circle cx="169" cy="139" r="12" fill={ivory}/><path d="M105 160l45 15m65-15l-45 15" stroke={clay} strokeWidth="11" strokeLinecap="round"/><path d="M146 37l27-9m-21 27l-26 3" stroke={ivory} strokeWidth="3" strokeLinecap="round"/></>;
      break;
    case 'maze':
      scene = <><rect x="49" y="16" width="222" height="154" rx="15" fill={ivory}/><path d="M70 57h64V36h55v47h58M92 57v85h44v-35h60v35h54M70 106h43m45-23v-27m-22 86v25m60-83h52" stroke={ink} strokeWidth="11" fill="none" strokeLinecap="round" strokeLinejoin="round"/><circle cx="89" cy="36" r="15" fill={clay} stroke={ivory} strokeWidth="4"/><path d="M246 119l11 14-11 14-11-14Z" fill={teal}/></>;
      break;
    case 'hangman':
      scene = <><path d="M42 148Q161 162 279 148" fill="none" stroke="#6f9e93" strokeWidth="9" strokeLinecap="round"/>{['W','O','R','D'].map((v,i)=><g key={i}><rect x={61+i*53} y={74+(i%2)*7} width="45" height="53" rx="9" fill={ivory} stroke={ink} strokeWidth="4"/><text x={83+i*53} y={110+(i%2)*7} textAnchor="middle" fontSize="30" fontWeight="800" fill={clay}>{v}</text></g>)}<path d="M158 19v39m-11-7l11 9 11-9" stroke={gold} strokeWidth="5" strokeLinecap="round" fill="none"/><circle cx="158" cy="15" r="8" fill={gold}/></>;
      break;
    case 'search':
      scene = <><rect x="69" y="16" width="181" height="148" rx="12" fill={ivory}/>{['T','E','A','C','H','O','U','S','E','P','L','A','Y','R','S','K'].map((v,i)=><text key={i} x={92+(i%4)*46} y={47+Math.floor(i/4)*34} textAnchor="middle" fontSize="23" fontWeight="800" fill={i===0||i===1||i===2||i===3?clay:ink}>{v}</text>)}<rect x="72" y="24" width="171" height="30" rx="12" fill="none" stroke={clay} strokeWidth="5"/><circle cx="248" cy="142" r="25" stroke={ink} strokeWidth="7" fill="none"/><path d="M265 161l23 20" stroke={ink} strokeWidth="9" strokeLinecap="round"/></>;
      break;
    case 'slice':
      scene = <><circle cx="104" cy="95" r="57" fill={gold} stroke={ivory} strokeWidth="7"/><path d="M104 95l-37-42m37 42l41-42m-41 42l52 16m-52-16l-14 55" stroke={ivory} strokeWidth="5"/><circle cx="219" cy="92" r="47" fill={clay} stroke={ivory} strokeWidth="7"/><path d="M184 116q35-64 69-48" stroke={ivory} strokeWidth="6" fill="none"/><path d="M52 23Q153 116 277 26" stroke={ivory} strokeWidth="7" fill="none" strokeLinecap="round"/><path d="M250 18l27 8-17 20" fill={ivory}/></>;
      break;
    case 'moles':
      scene = <><ellipse cx="78" cy="144" rx="55" ry="22" fill="#6c9388"/><ellipse cx="240" cy="144" rx="55" ry="22" fill="#6c9388"/><ellipse cx="159" cy="148" rx="62" ry="25" fill={ink}/><path d="M112 139V90q0-41 47-41t47 41v49Z" fill="#bd8b72" stroke={ink} strokeWidth="5"/><circle cx="128" cy="80" r="16" fill="#bd8b72" stroke={ink} strokeWidth="4"/><circle cx="192" cy="80" r="16" fill="#bd8b72" stroke={ink} strokeWidth="4"/><circle cx="145" cy="103" r="5" fill={ink}/><circle cx="177" cy="103" r="5" fill={ink}/><ellipse cx="160" cy="118" rx="12" ry="8" fill={clay}/><path d="M0 162Q81 141 160 161T320 160V180H0Z" fill="#719c8a"/></>;
      break;
    case 'wager':
      scene = <>{[0,1,2].map(i=><g key={i}><ellipse cx={100+i*45} cy={136-i*23} rx="40" ry="16" fill={gold} stroke={ink} strokeWidth="4"/><rect x={60+i*45} y={110-i*23} width="80" height="26" fill={gold} stroke={ink} strokeWidth="4"/><ellipse cx={100+i*45} cy={110-i*23} rx="40" ry="16" fill="#f4d990" stroke={ink} strokeWidth="4"/></g>)}<circle cx="220" cy="43" r="27" fill={clay} stroke={ivory} strokeWidth="5"/><text x="220" y="53" textAnchor="middle" fontSize="28" fontWeight="800" fill={ivory}>?</text></>;
      break;
    case 'auction':
      scene = <><path d="M84 146h157" stroke={ink} strokeWidth="15" strokeLinecap="round"/><rect x="130" y="117" width="74" height="22" rx="6" fill={gold} stroke={ink} strokeWidth="4"/><g transform="rotate(-30 165 90)"><rect x="153" y="46" width="18" height="84" rx="7" fill="#b27559" stroke={ink} strokeWidth="4"/><rect x="119" y="31" width="85" height="32" rx="6" fill={clay} stroke={ink} strokeWidth="5"/><path d="M131 35v25m61-25v25" stroke={ivory} strokeWidth="4"/></g><circle cx="237" cy="64" r="19" fill={ivory}/><path d="M229 65h16m-8-8v16" stroke={clay} strokeWidth="4" strokeLinecap="round"/></>;
      break;
    case 'pairs':
      scene = <><g transform="rotate(-12 110 91)"><rect x="75" y="30" width="91" height="128" rx="13" fill={clay} stroke={ivory} strokeWidth="5"/><rect x="91" y="46" width="59" height="95" rx="8" fill="none" stroke={ivory} strokeWidth="3"/><path d="M120 76l-14 20 14 20 14-20Z" fill={ivory}/></g><g transform="rotate(12 212 91)"><rect x="173" y="30" width="91" height="128" rx="13" fill={ivory} stroke={ink} strokeWidth="5"/><circle cx="219" cy="95" r="29" fill={teal}/><path d="M208 95l8 8 17-20" stroke={ivory} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g></>;
      break;
    case 'cloud':
      scene = <><path d="M53 120q-26-1-26-27 0-24 25-29 5-36 45-36 28 0 43 26 12-10 31-10 30 0 35 28 34-2 39 29 5 28-30 31H55Z" fill={ivory} stroke={ink} strokeWidth="5"/><text x="110" y="88" textAnchor="middle" fontSize="27" fontWeight="800" fill={clay}>PLAY</text><text x="176" y="117" textAnchor="middle" fontSize="21" fontWeight="800" fill={ink}>LEARN</text><circle cx="257" cy="49" r="13" fill={gold}/><circle cx="277" cy="77" r="8" fill={gold}/></>;
      break;
  }
  return <svg className="game-cover-artwork" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="26" cy="24" r="5" fill="#fff8ec" fillOpacity=".6"/><circle cx="297" cy="151" r="7" fill="#fff8ec" fillOpacity=".45"/>{scene}</svg>;
}
