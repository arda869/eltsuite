// Every picker preview and exported map uses the same native vector path data.
import { MAP_SYMBOL_INVENTORY } from './mapSymbolCatalog';
import { LUCIDE_MAP_GLYPHS } from './mapSymbolLucide';

export const MAP_ICONS = MAP_SYMBOL_INVENTORY.map(([key,name])=>[key,name] as const);
export type MapSymbolKey = (typeof MAP_SYMBOL_INVENTORY)[number][0];
export type MapSymbolCategory = (typeof MAP_SYMBOL_INVENTORY)[number][2];
export const MAP_SYMBOL_CATEGORIES:{key:MapSymbolCategory;name:string;colour:string;keys:readonly MapSymbolKey[]}[] = [
  ['nature','Nature and water','#578d78'],
  ['transport','Roads and transport','#638596'],
  ['buildings','Buildings and work','#a77860'],
  ['services','Facilities and services','#a36b78'],
  ['food','Food and drink','#a57458'],
  ['leisure','Parks and leisure','#8b739d'],
  ['education','Learning','#887a56'],
  ['wayfinding','Routes and signs','#647a95'],
  ['sports','Sports','#7b8e60'],
  ['heritage','Heritage and culture','#966e7c'],
  ['safety','Safety','#b16b5e'],
].map(([key,name,colour])=>({key:key as MapSymbolCategory,name,colour,keys:MAP_SYMBOL_INVENTORY.filter(item=>item[2]===key).map(item=>item[0])}));

// Each path is drawn with a rounded 2.5 px stroke in a 48 × 48 view box.
// Glyphs use recognisable map pictograms rather than platform-dependent emoji.
export type MapSymbolGlyph = {paths:readonly string[]; text?:string; viewBox?:24|48; source?:string};
const GLYPHS:Record<string,MapSymbolGlyph> = {
  tree:{paths:['M24 39v-13','M16 40h16','M16 26c-4-2-6-6-4-10 2-4 5-5 8-4 2-5 9-6 12-1 5-1 9 3 8 8 3 5-1 10-6 10H17z']},
  café:{paths:['M10 17h25l-3 16H13z','M35 20h4c6 0 5 8-2 8h-4','M13 39h23','M18 11c0-3 3-3 3-6','M27 11c0-3 3-3 3-6']},
  toilets:{paths:['M15 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M33 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M10 36V18h10v18','M28 36V18h10v18','M7 26h16','M25 26h16']},
  playground:{paths:['M8 39 16 11h16l8 28','M16 11v18m16-18v18','M17 29q7 10 15 0','M12 39h8m16 0h7']},
  building:{paths:['M8 40V20L24 9l16 11v20z','M19 40V28h10v12','M14 23h3m14 0h3']},
  office:{paths:['M11 40V9h26v31z','M17 16h5m7 0h3m-15 8h5m7 0h3m-15 8h5m7 0h3','M22 40v-6h5v6']},
  reception:{paths:['M8 30h32v10H8z','M24 24a5 5 0 1 0 0-10 5 5 0 0 0 0 10z','M16 30c0-5 4-8 8-8s8 3 8 8']},
  school:{paths:['M8 40V18L24 8l16 10v22z','M17 22h14v8H17z','M21 40V30h6v10','M14 40h20']},
  medical:{paths:['M24 7v34M7 24h34','M14 14h20v20H14z']},
  pharmacy:{paths:['M12 30 30 12a7 7 0 0 1 10 10L22 40a7 7 0 0 1-10-10z','M20 22l10 10','M9 42h30']},
  hospital:{paths:['M10 41V11h28v30z','M18 19h12m-6-6v12','M19 41V31h10v10','M10 41h28']},
  firstaid:{paths:['M8 18h32v23H8z','M18 18v-6h12v6','M24 23v13m-7-6h14']},
  shop:{paths:['M8 20h32l-3 8H11z','M12 28v12h24V28','M19 40v-8h10v8','M10 17h28']},
  train:{paths:['M12 9h24v26H12z','M16 15h16v9H16z','M17 30h3m8 0h3','M17 35l-5 7m19-7 5 7']},
  car:{paths:['M11 28l4-10h18l4 10','M8 28h32v10H8z','M14 38v4m20-4v4','M14 32h3m14 0h3']},
  plane:{paths:['M24 5l3 18 14 8v5l-15-5-1 10h-2l-1-10-15 5v-5l14-8z']},
  arrival:{paths:['M20 7l2 14 10 6v4l-11-3-1 8h-2l-1-8-11 3v-4l10-6z','M38 8v25m-6-6 6 6 6-6']},
  departure:{paths:['M20 7l2 14 10 6v4l-11-3-1 8h-2l-1-8-11 3v-4l10-6z','M38 34V9m-6 6 6-6 6 6']},
  tower:{paths:['M18 40l3-30h6l3 30z','M15 10h18m-15 30h12','M20 21h8']},
  castle:{paths:['M8 40V12h7v5h6v-5h6v5h6v-5h7v28z','M20 40V29a4 4 0 0 1 8 0v11','M13 24h4m14 0h4']},
  museum:{paths:['M6 18l18-10 18 10z','M9 39h30','M13 20v16m11-16v16m11-16v16','M7 42h34']},
  factory:{paths:['M7 40V21l10 6V17l10 9V14l13 10v16z','M13 33h3m8 0h3m8 0h3']},
  field:{paths:['M7 11h34v26H7z','M24 11v26','M24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z']},
  tennis:{paths:['M20 30a11 14 0 1 0 0-28 11 14 0 1 0 0 28z','M27 30l13 12','M11 15l16 10m-11-15 16 9','M12 24l20-12m-16 17 20-12']},
  cricket:{paths:['M11 37 27 9l8 5-16 27z','M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z','M10 42h30']},
  football:{paths:['M24 41a17 17 0 1 0 0-34 17 17 0 0 0 0 34z','M19 20l5-4 6 4-2 7h-8z','M19 20 11 17m19 3 7-3m-17 10-5 9m13-9 5 9']},
  gym:{paths:['M7 19v10m5-14v18m5-13v8m14-8v8m5-13v18m5-14v10','M7 24h34']},
  flower:{paths:['M24 41V26','M24 25c-12 0-9-12-2-10-2-9 10-10 10-2 9-1 10 10 2 11 2 9-11 10-10 1z','M17 36l7-3 7 3']},
  water:{paths:['M7 22c6-5 11-5 17 0s11 5 17 0','M7 29c6-5 11-5 17 0s11 5 17 0','M7 36c6-5 11-5 17 0s11 5 17 0']},
  bridge:{paths:['M6 32c9-16 27-16 36 0','M6 36h36','M12 25v11m24-11v11']},
  walkway:{paths:['M12 37c5-10 12-16 24-25','M10 40h6m19-30h5','M18 26l5 5m4-12 5 5','M9 13h0m8-5h0m15 28h0']},
  gate:{paths:['M9 40V11h5v29m20 0V11h5v29','M14 18h19v17H14z','M14 18l19 17m-19 0 19-17']},
  checkin:{paths:['M7 30h34v10H7z','M14 30V14h20v16','M18 19h12','M24 26a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']},
  baggage:{paths:['M12 18h24v22H12z','M19 18v-5h10v5','M18 25v8m12-8v8','M19 40v3m10-3v3']},
  entrance:{paths:['M8 40V10h31v30','M31 13v24','M12 25h18','M22 18l8 7-8 7']},
  exit:{paths:['M8 40V10h31v30','M18 13v24','M12 25h18','M23 18l8 7-8 7']},
  emergency:{paths:['M8 40V10h31v30','M29 13v25','M15 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M15 20l7 4 7-2m-9 2-4 9m4-9 7 9','M32 24h5']},
  bus:{paths:['M11 10h26v27H11z','M14 15h20v10H14z','M16 33h3m10 0h3','M16 37v4m16-4v4']},
  sculpture:{paths:['M24 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10z','M24 16v17m-11-10h22m-11 10-8 9m8-9 8 9','M12 43h24']},
  food:{paths:['M7 31h34','M10 31a14 14 0 0 1 28 0','M7 37h34','M24 13v4m-5-4h10','M13 41h22']},
  hotel:{paths:['M8 16v24m0-11h32v11','M12 22h10a5 5 0 0 1 5 5v2','M27 19h7a6 6 0 0 1 6 6v4']},
  camping:{paths:['M5 39 24 10l19 29z','M24 10v29','M15 39l9-14 9 14']},
  warehouse:{paths:['M7 40V17l17-9 17 9v23z','M16 40V25h16v15','M18 31h12m-12 5h12']},
  atm:{paths:['M11 9h26v31H11z','M17 16h14v6H17z','M24 27v8m-4-6c3-3 8-2 8 1s-8 2-8 5 5 3 8 0']},
  post:{paths:['M7 13h34v25H7z','M7 16l17 13 17-13','M7 38l13-12m21 12L28 26']},
  library:{paths:['M8 9h16v29H8z','M24 9h16v29H24z','M8 15c5-2 10-2 16 1m0 0c5-3 10-3 16-1','M24 38v4']},
  shield:{paths:['M24 5l16 6v12c0 10-6 17-16 21C14 40 8 33 8 23V11z','M17 24l5 5 10-11']},
  fire:{paths:['M24 42c-10 0-15-7-13-15 1-5 7-9 8-16 4 4 4 7 4 9 5-4 5-9 5-14 7 7 11 13 11 21 0 9-6 15-15 15z','M24 40c-5 0-7-4-6-8 1-3 4-5 6-8 3 3 6 6 6 9 0 4-2 7-6 7z']},
  firestation:{paths:['M7 40V14L24 6l17 8v26z','M15 40V25h18v15','M24 17c-4 4-4 8 0 9 4-1 4-5 0-9z','M12 40h24']},
  passport:{paths:['M12 7h24v34H12z','M24 31a8 8 0 1 0 0-16 8 8 0 0 0 0 16z','M16 23h16m-8-8c-5 4-5 12 0 16m0-16c5 4 5 12 0 16']},
  customs:{paths:['M11 17h26v24H11z','M18 17v-6h12v6','M16 28l5 5 10-10']},
  ticket:{paths:['M7 17h34v6a4 4 0 0 0 0 8v6H7v-6a4 4 0 0 0 0-8z','M25 17v20']},
  ferry:{paths:['M9 28h30l-4 10H13z','M18 28V12h12v16','M8 42c5-3 9-3 14 0s9 3 14 0']},
  bike:{paths:['M12 36a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm24 0a7 7 0 1 0 0-14 7 7 0 0 0 0 14z','M12 29l8-15 8 15h8','M20 14h7m-7 15h8l-6-10']},
  charging:{paths:['M11 8h22v32H11z','M18 17h8l-5 8h8l-10 11 3-9h-7z','M33 23h4v14h4']},
  petrol:{paths:['M11 8h19v33H11z','M15 13h11v11H15z','M30 17h4l4 6v13a3 3 0 0 1-6 0v-8','M8 41h25']},
  stairs:{paths:['M7 39h34V9H29v10H18v10H7z']},
  lift:{paths:['M10 8h28v32H10z','M24 15v17','M20 19l4-4 4 4m-8 9 4 4 4-4']},
  accessible:{paths:['M24 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z','M24 13v12h11','M17 17a16 16 0 1 0 18 15','M23 24h12l4 13']},
  drinking:{paths:['M12 12h24l-3 28H15z','M12 23h24','M23 8c0-3 3-3 3-6']},
  beach:{paths:['M24 7c-9 0-16 7-16 16h32C40 14 33 7 24 7z','M24 7v33','M14 40h20','M30 15l-6 8']},
  mountain:{paths:['M5 39 17 14l8 14 6-9 12 20z','M11 27l6-4 5 4m10 2 5-3']},
  waterfall:{paths:['M11 8h27v9H11z','M19 17v15m7-15v19m7-19v15','M8 40c5-3 9-3 14 0s9 3 14 0']},
  fountain:{paths:['M24 12v22','M17 18c-1 5-5 5-7 10m21-10c1 5 5 5 7 10','M11 35h26l-3 7H14z','M24 7h0']},
  bench:{paths:['M10 23h28v11H10z','M10 15h28v6H10z','M14 34v8m20-8v8']},
  bin:{paths:['M13 15h22l-2 27H15z','M10 13h28','M18 9h12','M21 20v16m6-16v16']},
  notice:{paths:['M9 9h30v25H9z','M15 16h18m-18 6h18m-18 6h12','M14 34v8m20-8v8']},
  viewpoint:{paths:['M7 24c5-8 11-12 17-12s12 4 17 12c-5 8-11 12-17 12S12 32 7 24z','M24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z']},
  maze:{paths:['M8 39V9h32v30H8z','M14 34V15h20v18H20V21h8v6','M8 24h6m20 9v6']},
  skate:{paths:['M7 30q11 1 15 10h19','M8 38h34','M17 28l5 2m13 10a3 3 0 1 0 0-6m-17 6a3 3 0 1 0 0-6']},
  basketball:{paths:['M24 40a16 16 0 1 0 0-32 16 16 0 0 0 0 32z','M8 24h32m-16-16v32','M12 13c9 7 9 15 0 22m24-22c-9 7-9 15 0 22']},
  pool:{paths:['M8 31c6-4 10-4 16 0s10 4 16 0','M8 38c6-4 10-4 16 0s10 4 16 0','M17 24a4 4 0 1 0 0-8 4 4 0 0 0 0 8z','M16 26l10-2 8 4']},
  stadium:{paths:['M6 14h36v21H6z','M12 19h24v11H12z','M12 35v6m24-6v6']},
  zoo:{paths:['M15 25a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M12 37c-2-6 4-10 9-9 3-6 8-6 11 0 6 0 9 4 7 9-2 7-10 7-14 2-6 6-13 3-13-2z']},
  aquarium:{paths:['M8 24c9-12 21-12 29 0-8 12-20 12-29 0z','M37 24l7-8v16z','M17 21h0','M23 28q5-4 0-8']},
  cinema:{paths:['M8 15h32v25H8z','M8 15l6-8h26v8','M16 7l-6 8m16-8-6 8m16-8-6 8','M19 24l12 6-12 6z']},
  theatre:{paths:['M8 14q8-6 16 0v18q-8 12-16 0z','M24 14q8-6 16 0v18q-8 12-16 0z','M13 21h6m10 0h6','M14 28q3 3 6 0m9 3q3-3 6 0']},
  church:{paths:['M12 41V19l12-9 12 9v22z','M24 4v13m-6-7h12','M20 41V29h8v12']},
  meeting:{paths:['M9 21h30v13H9z','M14 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm20 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M14 34v7m20-7v7']},
  classroom:{paths:['M8 9h32v19H8z','M11 37h26','M15 32v9m18-9v9','M18 16h12m-12 5h7']},
  lab:{paths:['M18 7h12m-9 0v15L11 39q-2 4 3 4h20q5 0 3-4L27 22V7','M17 33h14']},
  courtyard:{paths:['M7 9h34v31H7z','M14 16h20v17H14z','M24 26a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']},
  roundabout:{paths:['M24 41a17 17 0 1 0 0-34 17 17 0 0 0 0 34z','M24 34a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M24 3v4m0 34v4M3 24h4m34 0h4']},
  north:{paths:['M24 5 34 39 24 32 14 39z','M24 5v27']},
  pond:{paths:['M6 30c0-7 8-11 18-11s18 4 18 11-8 10-18 10S6 37 6 30z','M9 17V8m-3 5 3 4 3-4m27 4V8m-3 5 3 4 3-4','M15 29h18m-14 5h10']},
  picnic:{paths:['M8 25h32m-24 0-5 15m21-15 5 15','M16 31h16m-12-6 4-17 4 17','M13 14c6-7 16-7 22 0']},
  bank:{paths:['M6 17 24 7l18 10z','M9 40h30m-26-20v16m22-16v16','M24 22v12m-5-8c2-3 10-3 10 0s-10 2-10 5 8 4 10 0']},
  garden:{paths:['M7 36h34v6H7z','M13 36V18m0 4c-5-4-7-4-8-9 6 0 8 2 8 9zm0 0c5-4 7-4 8-9-6 0-8 2-8 9z','M34 36V19m0 3c-5-4-7-4-8-9 6 0 8 2 8 9zm0 0c5-4 7-4 8-9-6 0-8 2-8 9z']},
  lake:{paths:['M5 28c4-7 11-8 17-7 6-3 16 1 21 8-3 7-10 10-17 9-8 2-17-2-21-10z','M13 28h20m-14 5h15','M8 15c5-2 9-2 14 0']},
  temple:{paths:['M8 19 24 7l16 12z','M12 20h24v21H12z','M18 20v21m12-21v21','M8 41h32m-19-7h6']},
  monument:{paths:['M20 8h8l4 30H16z','M17 38h14m-18 4h22','M22 14h4m-6 15h8']},
  reeds:{paths:['M12 41V15m11 26V8m11 33V18','M10 14c-3-4-1-8 2-9 4 2 5 6 2 9zm11-6c-2-4-1-7 2-9 4 2 5 6 2 9zm11 10c-2-4-1-7 2-9 4 2 5 6 2 9z','M7 42h34']},
  wetland:{paths:['M8 36c5-3 9-3 14 0s9 3 18 0M8 42c5-3 9-3 14 0s9 3 18 0','M14 34V14m10 20V9m10 25V17','M12 14h4m6-5h4m6 8h4']},
  canal:{paths:['M8 7v34m32-34v34','M13 16c5-3 9-3 14 0s8 3 13 0M13 27c5-3 9-3 14 0s8 3 13 0M13 38c5-3 9-3 14 0s8 3 13 0']},
  stream:{paths:['M9 5c11 6 9 13 20 18s6 12 10 20','M4 8c11 6 9 13 20 18s6 12 10 20','M13 13l-4 4m20 11-5 5']},
  cliff:{paths:['M6 11h24l-4 7 6 5-5 6 5 5-4 7H6','M28 41h14','M33 12l6 9m-5 3 7 6']},
  cave:{paths:['M5 40c1-18 9-31 19-31s18 13 19 31z','M16 40c0-10 3-17 8-17s8 7 8 17','M10 41h28']},
  beachchair:{paths:['M8 12l15 24h18M8 12l7-5 16 26','M20 34l-6 9m23-7 4 7','M23 19l9-6']},
  footbridge:{paths:['M5 35h38','M10 35V19h28v16','M10 24h28','M15 19v-7m18 7v-7','M5 42h38']},
  crossing:{paths:['M6 10h36M6 39h36','M8 16h9v5H8zM22 16h9v5h-9zM35 16h7v5h-7z','M6 27h7v5H6zM18 27h9v5h-9zM32 27h10v5H32z']},
  ruins:{paths:['M6 42h36','M10 36V19h7v17m7-15v15h7V14h7v22','M10 19l7-4m7 6 7-5m0-2 7-4','M8 36h14m7 0h11']},
  statue:{paths:['M24 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z','M16 26c2-6 14-6 16 0v6H16z','M12 33h24v6H12z','M9 42h30']},
  cemetery:{paths:['M8 42h32','M10 39V21a6 6 0 0 1 12 0v18zm16 0V18a6 6 0 0 1 12 0v21z','M13 25h6m-3-3v9m13-8h6m-3-3v9']},
  chapel:{paths:['M10 41V18L24 8l14 10v23z','M24 3v13m-5-8h10','M19 41V29a5 5 0 0 1 10 0v12','M12 41h24']},
  mosque:{paths:['M7 40V22q2-9 17-14 15 5 17 14v18z','M17 40V29a7 7 0 0 1 14 0v11','M3 40V14m0-5 3 5H0z','M45 40V14m0-5 3 5h-6z']},
  synagogue:{paths:['M8 40V16L24 8l16 8v24z','M24 18l6 11H18z','M24 33l-6-11h12z','M15 40h18']},
  shrine:{paths:['M8 19 24 8l16 11z','M12 20h24v20H12z','M19 40V28h10v12','M24 22v5m-4-2h8']},
  firehydrant:{paths:['M17 42V21a7 7 0 0 1 14 0v21z','M13 24h4m14 0h4','M10 21v8m28-8v8','M18 14h12M22 8h4v6','M13 42h22']},
  lifeguard:{paths:['M10 14h28','M15 14v28m18-28v28','M15 22h18','M21 30h12','M9 42h30','M24 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']},
  fence:{paths:['M7 10v31m10-31v31m10-31v31m10-31v31','M6 18h34M6 32h34','M7 10l3-3 3 3m4 0 3-3 3 3m4 0 3-3 3 3m4 0 3-3 3 3']},
  stop:{paths:['M16 6h16l10 10v16L32 42H16L6 32V16z'],text:'STOP'},
  underpass:{paths:['M6 18h36m-36 4h36','M24 10v8m0 4v17','M18 32l6 7 6-7','M8 10h10m12 0h10']},
  overpass:{paths:['M6 28h36m-36 4h36','M24 9v19m0 4v8','M18 16l6-7 6 7','M8 40h10m12 0h10']},
  greenhouse:{paths:['M6 41V21L24 7l18 14v20z','M13 21h22M13 21v20m11-30v30m11-20v20','M6 41h36']},
  barn:{paths:['M6 41V20L24 7l18 13v21z','M17 41V26h14v15','M17 26l14 15m-14 0 14-15','M6 41h36']},
  volleyball:{paths:['M24 39a15 15 0 1 0 0-30 15 15 0 0 0 0 30z','M13 15c9 4 16 12 19 21','M21 10c0 11-2 19-8 23','M34 14c-8 4-15 9-23 9']},
  badminton:{paths:['M10 10l18 18m-19-7 11-11','M9 20l-3 8 8-3 4-7','M28 28l12 12','M31 31l8-8m-3-3 5 5']},
  hockey:{paths:['M9 9l7 28h21m-5-7 5 7','M7 40h34','M37 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8z']},
  rugby:{paths:['M10 35c-3-10 0-20 14-25 14 5 17 15 14 25-11 6-19 6-28 0z','M14 31l20-18m-16 21 20-18','M20 24l8 8m-4-12 8 8']},
  baseball:{paths:['M22 33a12 12 0 1 0 0-24 12 12 0 0 0 0 24z','M15 13c5 4 6 11 4 18m10-18c-5 4-6 11-4 18','M9 39l26-4m-2 0 5 7']},
  skating:{paths:['M9 12h24l4 17-6 7H14l-5-7z','M8 38h32m-28 4h24','M14 27h19']},
  playcourt:{paths:['M7 10h34v29H7z','M24 10v29m-17-14h34','M19 21h10v8H19z']},
};

const sourceByKey=new Map(MAP_SYMBOL_INVENTORY.map(([key,, ,source])=>[key,source] as const));
const UNKNOWN_SYMBOL_GLYPH:MapSymbolGlyph={paths:['M24 42s14-14 14-25a14 14 0 1 0-28 0c0 11 14 25 14 25z','M24 23a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'],viewBox:48,source:'legacy:unknown'};
export function mapSymbolGlyph(key:string):MapSymbolGlyph{
  const source=sourceByKey.get(key as MapSymbolKey);
  if(!source)return UNKNOWN_SYMBOL_GLYPH; // Safely show obsolete imported symbol keys.
  if(source.startsWith('lucide:')){
    const paths=LUCIDE_MAP_GLYPHS[key];
    if(!paths)throw new Error(`Missing map symbol artwork: ${key}`);
    return {paths,viewBox:24,source};
  }
  const paths=GLYPHS[source.slice('bespoke:'.length)];
  if(!paths)throw new Error(`Missing map symbol artwork: ${key}`);
  return {...paths,viewBox:48,source};
}

export const MAP_SYMBOLS=MAP_SYMBOL_INVENTORY.map(([key,name,category])=>({key,name,category,glyph:mapSymbolGlyph(key)}));
export const MAP_SYMBOL_DRAG_TYPE='application/x-elt-map-symbol';
