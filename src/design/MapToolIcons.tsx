import type { MapItemKind } from './figures';

// Small, purpose-drawn marks for the map tool rail. Each tool has a distinct
// outline that remains legible at the rail's compact size and in dark mode.
const paths:Record<MapItemKind,string[]>={
  road:['M4 21C8 16 8 8 12 3','M11 22c4-5 4-13 8-17','M8 18l2-3m2-4 1-3'],
  river:['M3 3c4 2 4 5 0 7s-4 5 0 7 4 4 0 5','M11 3c4 2 4 5 0 7s-4 5 0 7 4 4 0 5','M19 3c4 2 4 5 0 7s-4 5 0 7 4 4 0 5'],
  footpath:['M3 21c0-2 1-3 3-4','M8 15c2-1 2-3 3-4','M13 9c1-2 3-3 4-3','M19 5l2-2'],
  wall:['M2 5h20v14H2z','M2 12h20M8 5v7m8 0v7M12 12v7'],
  fence:['M3 20V5l2-2 2 2v15M17 20V5l2-2 2 2v15M3 9h18M3 15h18'],
  zone:['M4 5h6m4 0h6v6m0 4v4h-6m-4 0H4v-6m0-4v-4','M9 10h6v5H9z'],
  building:['M4 21V6l8-3 8 3v15M2 21h20','M8 9h2m4 0h2M8 13h2m4 0h2M10 21v-5h4v5'],
  room:['M3 4h18v16H3V4','M10 20v-6a3 3 0 0 1 3-3','M15 7h3'],
  water:['M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12Z','M8 17c2 1 4 1 6 0'],
  roundabout:['M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16','M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8','M12 1v3m0 16v3M1 12h3m16 0h3'],
  tree:['M12 21v-6','M7 15c-2 0-3-2-2-4-2-2 0-5 3-5 1-4 7-4 8 0 3 0 5 3 3 5 1 2 0 4-2 4H7Z','M9 21h6'],
  gate:['M3 20V5h4v15M17 20V5h4v15','M7 8l9 4-9 4V8Z','M3 21h4m10 0h4'],
  bridge:['M2 18h20M3 18c0-7 4-11 9-11s9 4 9 11','M7 18v-6m5 6V8m5 10v-6','M3 22c2-1 4-1 6 0 2-1 4-1 6 0 2-1 4-1 6 0'],
  compass:['M12 2v20M2 12h20','M12 4l-3 7 3-2 3 2-3-7Z','M8 3h8'],
  icon:['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20','m12 6 1.7 3.8 4.2.4-3.1 2.8.9 4-3.7-2-3.7 2 .9-4-3.1-2.8 4.2-.4L12 6Z'],
  marker:['M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z','M12 6a3 3 0 1 0 0 6 3 3 0 1 0 0-6'],
  label:['M3 5h18M12 5v14M8 19h8'],
};

export function MapToolIcon({kind,size=20}:{kind:MapItemKind;size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths[kind].map((path,index)=><path key={index} d={path}/>)}
  </svg>;
}
