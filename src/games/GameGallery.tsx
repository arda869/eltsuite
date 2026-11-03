import {useState} from 'react';
import {doc,setDoc} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {useAuth} from '../lib/auth';
import {newSharedDoc} from '../lib/sharedDocs';
import {blankGame,GAME_TYPES,type GameType} from './model';
import './games.css';
const symbols=['🦈','🚕','🏁','▦','★','◎','●','↗','A _','A B C','◒','◉','±','⚒','▣','☁'];
export function GameGallery(){const{user}=useAuth();const[busy,setBusy]=useState(''),[error,setError]=useState('');const create=async(type:GameType)=>{if(!user)return;const w=window.open('about:blank','_blank');setBusy(type);try{const id=await newSharedDoc({uid:user.uid,name:user.displayName||'Teacher'},'game');await setDoc(doc(db,'sharedDocs',id,'game','main'),{...blankGame(),type});if(w)w.location.href='/doc/'+id;else setError('Your game was saved. Open it from the file list below.');}catch(e){w?.close();setError((e as Error).message);}finally{setBusy('');}};return <section className="game-gallery"><div className="game-gallery-intro"><span>MAKE ROOM FOR PLAY</span><h2>A little competition.<br/>A lot of language.</h2><p>Choose a game. Add your questions, reuse flashcards, or ask AI for a draft. Save once and bring it into any class.</p></div>{error&&<p role="alert">{error}</p>}<div className="game-gallery-grid">{GAME_TYPES.map((g,i)=><button type="button" key={g.id} disabled={!!busy} onClick={()=>void create(g.id)}><span className={'game-gallery-art art-'+i%5} aria-hidden="true">{symbols[i]}</span><strong>{g.name}</strong><span>{busy===g.id?'Creating your game…':g.about}</span></button>)}</div><p>Five looks for every game: Arcade, Garden, Space, Wooden tabletop and Paper classroom.</p></section>;}
