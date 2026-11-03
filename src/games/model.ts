import type { JSONContent } from '@tiptap/react';
export const GAME_TYPES = [
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
        if (['targets', 'pinball', 'maze', 'slice', 'moles'].includes(game.type) && new Set([r.answer, ...r.choices].map(norm).filter(Boolean)).size < 2)
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
    const size = Math.max(8, ...rounds.map(r => r.answer.length));
    const rows = rounds.slice(0, 16);
    const height = Math.max(size, rows.length);
    const grid = Array.from({ length: height }, (_, y) => Array.from({ length: size }, (_, x) => String.fromCharCode(65 + ((x * 17 + y * 11 + 7) % 26))));
    const paths: Record<string, number[]> = {};
    rows.forEach((r, y) => { const word = r.answer.toUpperCase(); const reverse = y % 2 === 1; const start = (size - word.length) % (y + 1); const path: number[] = []; for (let i = 0; i < word.length; i++) {
        const x = reverse ? size - 1 - start - i : start + i;
        grid[y][x] = word[i];
        path.push(y * size + x);
    } paths[r.id] = path; });
    return { grid, paths, size };
}
