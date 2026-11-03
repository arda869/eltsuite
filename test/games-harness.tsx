import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GamePlayer} from '../src/games/GamePlayer';
import {cleanState} from '../functions/games/state.js';
const game={version:1 as const,type:'show' as const,theme:'wood' as const,sound:false,rounds:[{id:'r1',prompt:'Choose the place for books.',answer:'library',choices:['bank']}]};
function Harness(){const[state,setState]=useState<Record<string,unknown>|null>(null),[writes,setWrites]=useState(0),[epoch,setEpoch]=useState(0);return <><button onClick={()=>setEpoch(n=>n+1)}>Reopen controller</button><output aria-label="Writes">{writes}</output><section aria-label="Controller"><GamePlayer key={epoch} game={game} remote={state} onState={s=>{setWrites(n=>n+1);setState(cleanState(s,1));}}/></section><section aria-label="Spectator"><GamePlayer game={game} remote={state} readOnly/></section></>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
