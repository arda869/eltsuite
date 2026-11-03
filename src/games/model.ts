import type { JSONContent } from '@tiptap/react';
export const GAME_TYPES = [
    { id: 'shark', name: 'Shark escape', about: 'Answer in time to escape the shark.' },
    { id: 'taxi', name: 'Taxi town', about: 'Deliver passengers by answering each question.' },
    { id: 'drive', name: 'Checkpoint driver', about: 'Race between checkpoints with correct answers.' },
    { id: 'blocks', name: 'Falling blocks', about: 'Answer before the block drops. Fill rows to clear them.' },
    { id: 'show', name: 'Game show', about: 'Answer rounds using any inline task type.' },
    { id: 'targets', name: 'Target practice', about: 'Hit the target that answers the question.' },
    { id: 'pinball', name: 'Pinball', about: 'Choose an answer bumper and launch the ball.' },
    { id: 'maze', name: 'Maze explorer', about: 'Follow the route to the correct answer.' },
    { id: 'hangman', name: 'Word rescue', about: 'Discover a word, one letter at a time.' },
    { id: 'search', name: 'Word search', about: 'Find words from their clues.' },
    { id: 'slice', name: 'Fruit slice', about: 'Slice the fruit with the correct answer.' },
    { id: 'moles', name: 'Whack-a-mole', about: 'Catch the mole carrying the correct answer.' },
    { id: 'wager', name: 'Win or lose', about: 'Choose a stake before answering.' },
    { id: 'auction', name: 'Sentence auction', about: 'Bid on sentences you believe are correct.' },
    { id: 'pairs', name: 'Pelmanism', about: 'Turn cards over and find matching pairs.' },
] as const;
export type GameType = typeof GAME_TYPES[number]['id'];
export const THEMES = [
    { id: 'arcade', name: 'Arcade cabinet' }, { id: 'garden', name: 'Garden adventure' },
    { id: 'space', name: 'Space station' }, { id: 'wood', name: 'Wooden tabletop' }, { id: 'paper', name: 'Paper classroom' },
] as const;
export type GameTheme = typeof THEMES[number]['id'];
export type GameRound = {
    id: string;
    prompt: string;
    answer: string;
    choices: string[];
    content?: JSONContent;
};
export type GameConfig = {
    version: 1;
    type: GameType;
    theme: GameTheme;
    rounds: GameRound[];
    sound: boolean;
    sourceId?: string;
    roundSeconds?: number;
};
export const blankGame = (): GameConfig => ({ version: 1, type: 'show', theme: 'wood', rounds: [], sound: false });
export const norm = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase();
export function gameProblems(game: GameConfig): string[] {
    const errors: string[] = [];
    if (!game.rounds.length)
        errors.push('Add at least one question.');
    if (game.rounds.length > 60)
        errors.push('Use no more than 60 questions in one game.');
    if (game.type === 'search' && game.rounds.length > 16)
        errors.push('Word search supports up to 16 words.');
    if (game.type === 'pairs' && (game.rounds.length < 2 || game.rounds.length > 12))
        errors.push('Matching pairs needs 2–12 pairs.');
    if(game.type==='pairs'&&(new Set(game.rounds.map(r=>norm(r.prompt))).size!==game.rounds.length||new Set(game.rounds.map(r=>norm(r.answer))).size!==game.rounds.length))errors.push('Use distinct clues and answers so each pair has only one match.');
    const words = new Set<string>();
    game.rounds.forEach((r, i) => {
        if (!r.prompt.trim() && !r.content)
            errors.push(`Question ${i + 1}: add a clue or task.`);
        if (!r.answer.trim() && !r.content)
            errors.push(`Question ${i + 1}: add the answer.`);
        if (['hangman', 'search'].includes(game.type)) {
            if (!/^[a-zA-Z]{2,16}$/.test(r.answer))
                errors.push(`Question ${i + 1}: use a single 2–16 letter English word for this game.`);
            if (words.has(norm(r.answer)))
                errors.push(`Question ${i + 1}: use a different word.`);
            words.add(norm(r.answer));
        }
        if (['targets', 'pinball', 'maze', 'slice', 'moles','shark','taxi','drive','blocks'].includes(game.type) && new Set([r.answer, ...r.choices].map(norm).filter(Boolean)).size < 2)
            errors.push(`Question ${i + 1}: add at least one different answer option.`);
        if (game.type === 'auction' && !['correct', 'incorrect'].includes(norm(r.answer)))
            errors.push(`Sentence ${i + 1}: answer must be Correct or Incorrect.`);
    });
    return errors;
}
// Seeded order survives redraws and is shared by all players in the same round.
export function shuffled<T>(values: T[], seed: string): T[] { let n = 2166136261; for (const c of seed)
    n = Math.imul(n ^ c.charCodeAt(0), 16777619); return values.map(v => { n = (Math.imul(n, 1664525) + 1013904223) | 0; return { v, k: n >>> 0 }; }).sort((a, b) => a.k - b.k).map(x => x.v); }
export function optionsFor(r: GameRound) { return shuffled([...new Map([r.answer, ...r.choices].map(s => s.trim()).filter(Boolean).map(s => [norm(s), s])).values()], r.id); }
export function wordGrid(rounds: GameRound[]) {
    if(rounds.length>16||rounds.some(r=>!/^[A-Za-z]{2,16}$/.test(r.answer)))return {grid:[] as string[][],paths:{} as Record<string,number[]>,size:0};
    const size=Math.max(8,...rounds.map(r=>r.answer.length));
    const height=Math.max(size,Math.min(16,rounds.length));
    const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
    for(let attempt=0;attempt<12;attempt++){
        const grid=Array.from({length:height},()=>Array<string>(size).fill(''));
        const paths:Record<string,number[]>={};
        for(const r of [...rounds].sort((a,b)=>b.answer.length-a.answer.length)){
            const word=r.answer.toUpperCase();
            const candidates:number[][]=[];
            for(let y=0;y<height;y++)for(let x=0;x<size;x++)for(const [dx,dy] of directions){
                const path:number[]=[];
                for(let i=0;i<word.length;i++){const xx=x+dx*i,yy=y+dy*i;if(xx<0||xx>=size||yy<0||yy>=height||(grid[yy][xx]&&grid[yy][xx]!==word[i]))break;path.push(yy*size+xx);}
                if(path.length===word.length)candidates.push(path);
            }
            const path=shuffled(candidates,r.id+':'+attempt)[0];
            if(!path)break;
            paths[r.id]=path;path.forEach((p,i)=>grid[Math.floor(p/size)][p%size]=word[i]);
        }
        if(Object.keys(paths).length===rounds.length){grid.forEach((row,y)=>row.forEach((letter,x)=>{if(!letter)row[x]=String.fromCharCode(65+(x*17+y*11+attempt*3)%26);}));return {grid,paths,size};}
    }
    // Dense sets still have a guaranteed solution: one word per row.
    const grid=Array.from({length:height},(_,y)=>Array.from({length:size},(_,x)=>String.fromCharCode(65+(x*17+y*11)%26)));
    const paths:Record<string,number[]>={};
    rounds.slice(0,16).forEach((r,y)=>{paths[r.id]=[...r.answer.toUpperCase()].map((c,x)=>{grid[y][x]=c;return y*size+x;});});
    return {grid,paths,size};
}
