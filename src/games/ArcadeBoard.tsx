import { useEffect, useRef } from 'react';
import type { GameType } from './model';
export function ArcadeBoard({ type, options, onAnswer, disabled, remote, onState }: {
    remote: Record<string, any>;
    onState: (s: Record<string, any>) => void;
    type: GameType;
    options: string[];
    onAnswer: (s: string) => void;
    disabled: boolean;
}) {
    const position = { x: remote.x ?? 2, y: remote.y ?? 4 }, bumper = remote.bumper ?? 0, ball = remote.ball ?? null, active = remote.active ?? 0, sliced = remote.sliced ?? null;
    const latest = useRef(remote);
    latest.current = remote;
    const change = (p: Record<string, any>) => onState({ ...latest.current, ...p });
    const setPosition = (p: {
        x: number;
        y: number;
    }) => change(p), setBumper = (v: number) => change({ bumper: v }), setBall = (v: number) => change({ ball: v }), setActive = (fn: (v: number) => number) => change({ active: fn(latest.current.active ?? 0) }), setSliced = (v: number) => change({ sliced: v });
    const frame = useRef(0);
    useEffect(() => { if (type !== 'moles' || disabled)
        return; const timer = window.setInterval(() => setActive(a => (a + 1) % options.length), 1800); return () => clearInterval(timer); }, [type, options.length, disabled]);
    useEffect(() => () => cancelAnimationFrame(frame.current), []);
    if (type === 'maze') {
        // Rooms connect through a centre corridor; each answer occupies a distinct exit.
        const width = Math.max(5, options.length * 2 - 1);
        const exits = options.map((_, i) => ({ x: i * 2, y: 0 }));
        const blocked = (x: number, y: number) => x < 0 || x >= width || y < 0 || y > 4 || (y === 1 && x % 2 === 1) || (y === 3 && x !== 2);
        const move = (dx: number, dy: number) => { if (disabled)
            return; const p = { x: position.x + dx, y: position.y + dy }; if (blocked(p.x, p.y))
            return; setPosition(p); const exit = exits.findIndex(e => e.x === p.x && e.y === p.y); if (exit >= 0)
            onAnswer(options[exit]); };
        return <div onKeyDown={e => { const d: Record<string, number[]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }; if (d[e.key]) {
            e.preventDefault();
            move(d[e.key][0], d[e.key][1]);
        } }}><p>Move through the maze to the answer. Use arrows or the buttons below.</p><div className="game-maze" style={{ gridTemplateColumns: `repeat(${width},1fr)` }}>{Array.from({ length: width * 5 }, (_, i) => { const x = i % width, y = Math.floor(i / width), exit = exits.findIndex(e => e.x === x && e.y === y); return <div key={i} className={blocked(x, y) ? 'wall' : 'path'}>{position.x === x && position.y === y ? <span aria-label="Your position">●</span> : exit >= 0 ? options[exit] : ''}</div>; })}</div><div className="game-direction">{[['Left', -1, 0], ['Up', 0, -1], ['Down', 0, 1], ['Right', 1, 0]].map(([label, x, y]) => <button key={label} type="button" disabled={disabled} onClick={() => move(Number(x), Number(y))}>{label}</button>)}</div></div>;
    }
    if (type === 'pinball') {
        const launch = () => { if (disabled || ball !== null)
            return; let start = 0, lastStep=-1; const animate = (t: number) => { if (!start)
            start = t; const elapsed = Math.min(1, (t - start) / 900); const step=Math.floor(elapsed*5);if(step!==lastStep){setBall(elapsed);lastStep=step;} if (elapsed < 1)
            frame.current = requestAnimationFrame(animate);
        else
            onAnswer(options[bumper]); }; frame.current = requestAnimationFrame(animate); };
        return <><p>Aim at the correct answer bumper, then launch the ball.</p><div className="game-pinboard"><div className="game-options">{options.map((v, i) => <button key={v} type="button" aria-pressed={bumper === i} disabled={disabled || ball !== null} onClick={() => setBumper(i)}>{v}</button>)}</div><span className="game-ball" style={{ bottom: `${8 + (ball || 0) * 70}%`, left: `${50 + (ball || 0) * ((bumper + .5) / options.length * 100 - 50)}%` }} aria-hidden="true"/><div className="game-flippers" aria-hidden="true">╱ ╲</div></div><button type="button" disabled={disabled || ball !== null} onClick={launch}>Launch ball</button></>;
    }
    if (type === 'slice')
        return <><p>Slice the fruit with the correct answer. Tap a fruit, or drag across it.</p><div className="game-fruitfield">{options.map((v, i) => <button key={v} type="button" disabled={disabled} className={sliced === i ? 'sliced' : ''} onPointerEnter={e => { if (e.buttons === 1 && !disabled && sliced === null) {
            setSliced(i);
            onAnswer(v);
        } }} onClick={() => { if (sliced === null) {
            setSliced(i);
            onAnswer(v);
        } }}><span aria-hidden="true">{['🍊', '🍉', '🍎', '🍐'][i % 4]}</span>{v}</button>)}</div></>;
    if (type === 'moles')
        return <><p>Catch the mole holding the correct answer when it appears.</p><div className="game-molefield">{options.map((v, i) => <div className="game-hole" key={v}><button type="button" aria-label={v} disabled={disabled || active !== i} className={active === i ? 'up' : ''} onClick={() => onAnswer(v)}><span aria-hidden="true">🐹</span>{v}</button></div>)}</div><button type="button" disabled={disabled} onClick={() => setActive(a => (a + 1) % options.length)}>Show next mole</button></>;
    return <div className="game-options">{options.map(v => <button key={v} type="button" disabled={disabled} onClick={() => onAnswer(v)}><span className="game-object" aria-hidden="true">◎</span>{v}</button>)}</div>;
}
