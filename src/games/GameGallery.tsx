import {useState} from 'react';
import {doc,setDoc} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {useAuth} from '../lib/auth';
import {newSharedDoc} from '../lib/sharedDocs';
import {blankGame,GAME_TYPES,type GameType} from './model';
import {GameArtwork} from './GameArtwork';
import './games.css';

type Family = 'all' | 'action' | 'words' | 'strategy';
const families: {id:Family;label:string}[] = [
    {id:'all',label:'All games'},
    {id:'action',label:'Action & adventure'},
    {id:'words',label:'Word play'},
    {id:'strategy',label:'Thinking & strategy'}
];
const gameFamilies: Record<GameType,Exclude<Family,'all'>> = {
    shark:'action',taxi:'action',drive:'action',blocks:'action',
    show:'words',targets:'action',pinball:'action',maze:'action',
    hangman:'words',search:'words',slice:'action',moles:'action',
    wager:'strategy',auction:'strategy',pairs:'strategy',cloud:'words'
};
const gameTags: Record<GameType,string> = {
    shark:'Beat the clock',taxi:'Adventure',drive:'Racing',blocks:'Puzzle action',
    show:'Quiz',targets:'Aim & answer',pinball:'Arcade',maze:'Explorer',
    hangman:'Spelling',search:'Vocabulary',slice:'Quick reflexes',moles:'Quick thinking',
    wager:'Risk & reward',auction:'Team strategy',pairs:'Memory',cloud:'Word discovery'
};
export function GameGallery(){
    const {user}=useAuth();
    const [busy,setBusy]=useState(''),[error,setError]=useState(''),[family,setFamily]=useState<Family>('all');
    const create=async(type:GameType)=>{
        if(!user)return;
        const w=window.open('about:blank','_blank');
        setBusy(type);setError('');
        try{
            const id=await newSharedDoc({uid:user.uid,name:user.displayName||'Teacher'},'game');
            await setDoc(doc(db,'sharedDocs',id,'game','main'),{...blankGame(),type});
            if(w)w.location.href='/doc/'+id;
            else setError('Your game was saved. Open it from the file list below.');
        }catch(e){w?.close();setError((e as Error).message);}
        finally{setBusy('');}
    };
    const shown=GAME_TYPES.filter(g=>family==='all'||gameFamilies[g.id]===family);
    return <section className="game-gallery" aria-label="Classroom games">
        <div className="game-gallery-intro">
            <span className="game-gallery-eyebrow"><span aria-hidden="true" className="game-gallery-sparkle">✦</span> THE PLAYROOM <span className="game-gallery-count">{GAME_TYPES.length} games</span></span>
            <h2>A little competition.<br/><em>A lot of language.</em></h2>
            <p>Make practice feel like play. Pick a game, add your questions or bring in flashcards, and you are ready for your next class.</p>
        </div>
        {error&&<p role="alert" className="game-error">{error}</p>}
        <div className="game-gallery-categories" role="group" aria-label="Filter games">
            {families.map(f=><button type="button" key={f.id} aria-pressed={family===f.id} onClick={()=>setFamily(f.id)}>{f.label}</button>)}
        </div>
        <div className="game-gallery-grid">
            {shown.map(g=><button type="button" key={g.id} className={'game-gallery-card game-gallery-card-'+g.id} aria-label={g.name+' '+g.about} disabled={!!busy} onClick={()=>void create(g.id)}>
                <span className={'game-gallery-cover game-gallery-cover-'+g.id} aria-hidden="true"><GameArtwork type={g.id}/><span className="game-gallery-cover-label">{gameTags[g.id]}</span></span>
                <span className="game-gallery-card-heading"><strong>{g.name}</strong><span className="game-gallery-card-arrow" aria-hidden="true">↗</span></span>
                <span className="game-gallery-description">{g.about}</span>
                <span className="game-gallery-action">{busy===g.id?'Creating your game…':'Create game'}<span aria-hidden="true">→</span></span>
            </button>)}
        </div>
        <p className="game-gallery-footnote">Every game has five looks: Arcade, Garden, Space, Wooden tabletop and Paper classroom. Choose yours in the editor.</p>
    </section>;
}
