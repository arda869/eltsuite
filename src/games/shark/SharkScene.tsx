// The sea, drawn in code: sky and sun, a far shore, waves, an island with a palm and a flag, a
// rower in a small boat, and the shark. Everything is vector, in one flat illustration style, and
// moves with the clock: the shark closes in as time runs, the rower reaches the island when the
// answer is right. Decorative throughout: aria-hidden, nothing here is interactive.
import { useId } from 'react';

export type SharkMood = 'idle' | 'running' | 'cleared' | 'lost';

export function SharkScene({ progress, mood, splashes, urgent }: { progress: number; mood: SharkMood; splashes: number; urgent: boolean }) {
  const p = Math.min(1, Math.max(0, progress));
  return <div className="sk-scene" data-mood={mood} data-urgent={urgent || undefined} style={{ ['--p' as string]: p }} aria-hidden="true">
    <div className="sk-sky" />
    <Sun />
    <Clouds />
    <FarShore />
    <div className="sk-sea" />
    <Waves className="sk-wave sk-wave-far" />
    <Island />
    <Shark />
    <Waves className="sk-wave sk-wave-mid" />
    <Boat />
    {splashes > 0 && <Splash key={splashes} />}
    <Waves className="sk-wave sk-wave-near" />
    <Bubbles />
    <div className="sk-danger" />
  </div>;
}

function Sun() {
  const id = useId();
  return <svg className="sk-sun" viewBox="0 0 120 120">
    <defs><radialGradient id={id}><stop offset="55%" stopColor="var(--sk-sun)" /><stop offset="100%" stopColor="var(--sk-sun)" stopOpacity="0" /></radialGradient></defs>
    <circle cx="60" cy="60" r="60" fill={`url(#${id})`} opacity=".55" />
    <circle cx="60" cy="60" r="30" fill="var(--sk-sun)" />
    <path className="sk-moon-shadow" d="M60 30a30 30 0 1 0 0 60 24 24 0 0 1 0-60z" fill="var(--sk-sky-top)" />
  </svg>;
}

function Clouds() {
  const cloud = 'M20 40c-9 0-15-6-15-13s6-13 14-13c3-8 10-14 19-14 10 0 18 7 20 16 2-1 4-2 7-2 8 0 14 6 14 13s-6 13-14 13z';
  return <svg className="sk-clouds" viewBox="0 0 1000 200" preserveAspectRatio="none">
    <g fill="var(--sk-cloud)">
      <path d={cloud} transform="translate(80 40) scale(1.3)" opacity=".9" />
      <path d={cloud} transform="translate(420 20) scale(.9)" opacity=".7" />
      <path d={cloud} transform="translate(700 60) scale(1.1)" opacity=".8" />
      <path d={cloud} transform="translate(1080 30) scale(1.2)" opacity=".9" />
      <path d={cloud} transform="translate(1420 50) scale(.8)" opacity=".7" />
      <path d={cloud} transform="translate(1700 25) scale(1.1)" opacity=".8" />
    </g>
  </svg>;
}

function FarShore() {
  return <svg className="sk-shore" viewBox="0 0 1000 80" preserveAspectRatio="none">
    <path d="M0 80V62c40-10 90-22 150-20s100 18 160 10 120-30 190-26 130 30 200 22 160-34 300-18V80z" fill="var(--sk-shore)" />
    <path d="M0 80V72c60-4 140-14 220-8s150 14 230 6 170-22 260-14 190 20 290 10V80z" fill="var(--sk-shore-near)" />
  </svg>;
}

function Waves({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 1200 60" preserveAspectRatio="none">
    <path d="M0 30c50-18 100-18 150 0s100 18 150 0 100-18 150 0 100 18 150 0 100-18 150 0 100 18 150 0 100-18 150 0 100 18 150 0V60H0z" />
  </svg>;
}

function Island() {
  return <svg className="sk-island" viewBox="0 0 260 200">
    <ellipse cx="130" cy="186" rx="124" ry="14" fill="var(--sk-sea-dark)" opacity=".35" />
    <path d="M12 180c20-40 60-70 118-70s98 30 118 70z" fill="var(--sk-sand-dark)" />
    <path d="M24 180c20-32 56-58 106-58s86 26 106 58z" fill="var(--sk-sand)" />
    <path d="M60 176c10-10 24-16 42-16s32 6 42 16z" fill="var(--sk-sand-dark)" opacity=".5" />
    {/* palm */}
    <path d="M118 174c6-40 14-70 34-96" fill="none" stroke="var(--sk-trunk)" strokeWidth="9" strokeLinecap="round" />
    <path d="M122 174c4-32 10-58 28-84" fill="none" stroke="var(--sk-trunk-light)" strokeWidth="3" strokeLinecap="round" opacity=".6" />
    <g className="sk-fronds" fill="var(--sk-leaf)">
      <path d="M152 78c-30-20-62-14-80 8 24-4 50 2 80-8z" />
      <path d="M152 78c-4-34 14-60 44-66-16 20-20 44-44 66z" />
      <path d="M152 78c30-22 66-14 84 10-26-8-56-4-84-10z" />
      <path d="M152 78c6-30 36-46 66-38-28 6-46 22-66 38z" fill="var(--sk-leaf-dark)" />
      <path d="M152 78c-24-26-58-28-84-8 30-2 60 8 84 8z" fill="var(--sk-leaf-dark)" />
    </g>
    <circle cx="150" cy="86" r="6" fill="var(--sk-coconut)" /><circle cx="160" cy="90" r="6" fill="var(--sk-coconut)" />
    {/* flag, raised when the rower arrives */}
    <g className="sk-flag">
      <path d="M212 178V106" stroke="var(--sk-trunk)" strokeWidth="4" strokeLinecap="round" />
      <path className="sk-flag-cloth" d="M214 108h40l-10 14 10 14h-40z" fill="var(--ch-accent)" />
    </g>
  </svg>;
}

function Boat() {
  return <svg className="sk-boat" viewBox="-30 0 280 140">
    <ellipse cx="110" cy="128" rx="90" ry="8" fill="var(--sk-sea-dark)" opacity=".3" />
    {/* oars */}
    <g className="sk-oar sk-oar-left"><path d="M68 92L8 126" stroke="var(--sk-trunk)" strokeWidth="5" strokeLinecap="round" /><path d="M-4 134l16-12 6 7-16 12z" fill="var(--sk-trunk)" /></g>
    <g className="sk-oar sk-oar-right"><path d="M152 92l60 34" stroke="var(--sk-trunk)" strokeWidth="5" strokeLinecap="round" /><path d="M224 134l-16-12-6 7 16 12z" fill="var(--sk-trunk)" /></g>
    {/* rower */}
    <g className="sk-rower">
      <path d="M96 96c0-16 8-28 14-28s14 12 14 28z" fill="var(--sk-shirt)" />
      <circle cx="110" cy="56" r="13" fill="var(--sk-skin)" />
      <path d="M96 56c2-12 8-18 14-18s12 6 14 18c-8-5-20-5-28 0z" fill="var(--sk-hair)" />
      <path d="M92 76c-10 8-16 12-22 14M128 76c10 8 16 12 22 14" stroke="var(--sk-skin)" strokeWidth="6" strokeLinecap="round" />
    </g>
    {/* hull */}
    <path d="M14 96h192c-6 20-22 32-46 32H58c-22 0-38-12-44-32z" fill="var(--sk-hull)" />
    <path d="M14 96h192l-4 10H18z" fill="var(--sk-hull-light)" />
    <path d="M30 104h160" stroke="var(--sk-hull-dark)" strokeWidth="3" opacity=".5" />
    <path d="M60 128h100c14 0 26-6 34-16H26c8 10 20 16 34 16z" fill="var(--sk-hull-dark)" opacity=".35" />
  </svg>;
}

function Shark() {
  return <svg className="sk-shark" viewBox="0 0 320 150">
    <g className="sk-shark-body">
      {/* tail */}
      <path className="sk-tail" d="M50 78c-18-26-30-46-46-60 6 30 8 48 10 62-2 14-4 32-10 62 16-14 28-34 46-60z" fill="var(--sk-shark)" />
      {/* body */}
      <path d="M40 78c40-36 100-50 170-44 40 4 72 20 96 44-24 24-56 40-96 44-70 6-130-8-170-44z" fill="var(--sk-shark)" />
      <path d="M90 92c50 18 110 20 170 6l36-20c-24 24-56 40-96 44-70 6-130-8-170-44 18 8 38 12 60 14z" fill="var(--sk-shark-belly)" />
      {/* fin */}
      <path d="M150 36c10-30 30-48 58-54-10 20-14 38-14 58z" fill="var(--sk-shark-dark)" />
      <path d="M196 92c8 8 18 14 30 16-8-8-12-14-14-22z" fill="var(--sk-shark-dark)" />
      {/* gills, eye, mouth */}
      <path d="M212 60c-2 8-2 16 0 24M224 58c-2 8-2 16 0 24" stroke="var(--sk-shark-dark)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="262" cy="66" r="7" fill="#fff" /><circle cx="264" cy="67" r="4" fill="#1a1a1a" />
      <path className="sk-mouth" d="M250 92c14 2 28 0 44-8" fill="none" stroke="var(--sk-shark-dark)" strokeWidth="3" strokeLinecap="round" />
      <path className="sk-teeth" d="M254 92l4-6 4 6 4-6 4 6 4-6 4 6 4-7 4 6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
    </g>
  </svg>;
}

function Splash() {
  return <svg className="sk-splash" viewBox="0 0 200 120">
    <g fill="var(--sk-foam)">
      <circle cx="40" cy="80" r="10" /><circle cx="70" cy="50" r="14" /><circle cx="104" cy="34" r="16" /><circle cx="140" cy="54" r="12" /><circle cx="168" cy="84" r="9" />
      <circle cx="56" cy="100" r="7" /><circle cx="150" cy="104" r="6" />
    </g>
  </svg>;
}

function Bubbles() {
  return <svg className="sk-bubbles" viewBox="0 0 1000 300" preserveAspectRatio="none">
    {[120, 260, 430, 610, 780, 920].map((x, i) => <circle key={x} cx={x} cy={300} r={3 + (i % 3) * 2} fill="var(--sk-foam)" opacity=".7" style={{ ['--d' as string]: `${i * 0.9}s` }} />)}
  </svg>;
}
