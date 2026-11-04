// A street seen from behind the taxi: a skyline, building fronts on both sides, a three-lane road
// rolling towards the driver, a cone in one lane, and the destination on the horizon. The taxi sits
// in one of the three lanes; the cone comes closer as the clock runs. All vector, all decorative.
import { useId } from 'react';

export type TaxiMood = 'idle' | 'running' | 'cleared' | 'lost';
const LANE_X = ['25%', '50%', '75%'];
const FACADE = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300"><rect width="480" height="300" fill="#00000000"/>
<rect x="0" y="60" width="150" height="240" fill="#c9a47c"/><rect x="0" y="60" width="150" height="14" fill="#8f6b47"/><g fill="#5c7f99"><rect x="18" y="96" width="26" height="34" rx="2"/><rect x="62" y="96" width="26" height="34" rx="2"/><rect x="106" y="96" width="26" height="34" rx="2"/><rect x="18" y="150" width="26" height="34" rx="2"/><rect x="62" y="150" width="26" height="34" rx="2"/><rect x="106" y="150" width="26" height="34" rx="2"/><rect x="18" y="204" width="26" height="34" rx="2"/><rect x="106" y="204" width="26" height="34" rx="2"/></g><rect x="56" y="246" width="38" height="54" fill="#6b4a33"/><path d="M8 240h134l-10 22H18z" fill="#d2694a"/>
<rect x="160" y="20" width="170" height="280" fill="#e9dcc7"/><rect x="160" y="20" width="170" height="12" fill="#a08a6c"/><g fill="#4f6f8c"><rect x="178" y="52" width="30" height="40" rx="2"/><rect x="230" y="52" width="30" height="40" rx="2"/><rect x="282" y="52" width="30" height="40" rx="2"/><rect x="178" y="112" width="30" height="40" rx="2"/><rect x="230" y="112" width="30" height="40" rx="2"/><rect x="282" y="112" width="30" height="40" rx="2"/><rect x="178" y="172" width="30" height="40" rx="2"/><rect x="230" y="172" width="30" height="40" rx="2"/><rect x="282" y="172" width="30" height="40" rx="2"/></g><rect x="176" y="236" width="138" height="64" fill="#6f8a5e"/><rect x="176" y="236" width="138" height="10" fill="#4e6542"/><rect x="222" y="252" width="44" height="48" fill="#3c3a36"/><rect x="186" y="252" width="26" height="30" fill="#bfe0ea"/><rect x="278" y="252" width="26" height="30" fill="#bfe0ea"/>
<rect x="340" y="90" width="140" height="210" fill="#b7675a"/><rect x="340" y="90" width="140" height="12" fill="#7d443b"/><g fill="#f0d9a6"><rect x="356" y="120" width="24" height="30" rx="2"/><rect x="398" y="120" width="24" height="30" rx="2"/><rect x="440" y="120" width="24" height="30" rx="2"/><rect x="356" y="170" width="24" height="30" rx="2"/><rect x="398" y="170" width="24" height="30" rx="2"/><rect x="440" y="170" width="24" height="30" rx="2"/></g><rect x="352" y="222" width="116" height="78" fill="#3f3b36"/><rect x="364" y="236" width="92" height="40" fill="#cfe6ee"/><path d="M344 214h132l-8 18H352z" fill="#f2c14e"/></svg>`);

export function TaxiScene({ progress, mood, lane, cone, honks, urgent }: { progress: number; mood: TaxiMood; lane: number; cone: number; honks: number; urgent: boolean }) {
  const p = Math.min(1, Math.max(0, progress));
  return <div className="tx-scene" data-mood={mood} data-urgent={urgent || undefined} style={{ ['--p' as string]: p, ['--lane' as string]: LANE_X[lane] || '50%', ['--cone' as string]: LANE_X[cone] || '50%' }} aria-hidden="true">
    <div className="tx-sky" />
    <Sun />
    <Skyline />
    <div className="tx-ground" />
    <div className="tx-world">
      <div className="tx-wall tx-wall-left" style={{ backgroundImage: `url("data:image/svg+xml,${FACADE}")` }} />
      <div className="tx-wall tx-wall-right" style={{ backgroundImage: `url("data:image/svg+xml,${FACADE}")` }} />
      <div className="tx-road" />
    </div>
    <Destination />
    <Cone />
    <Taxi />
    {honks > 0 && <Honk key={honks} />}
    <div className="tx-danger" />
  </div>;
}

function Sun() {
  const id = useId();
  return <svg className="tx-sun" viewBox="0 0 120 120">
    <defs><radialGradient id={id}><stop offset="50%" stopColor="var(--tx-sun)" /><stop offset="100%" stopColor="var(--tx-sun)" stopOpacity="0" /></radialGradient></defs>
    <circle cx="60" cy="60" r="60" fill={`url(#${id})`} opacity=".5" />
    <circle cx="60" cy="60" r="28" fill="var(--tx-sun)" />
    <path className="tx-moon-shadow" d="M60 32a28 28 0 1 0 0 56 22 22 0 0 1 0-56z" fill="var(--tx-sky-top)" />
  </svg>;
}

function Skyline() {
  return <svg className="tx-skyline" viewBox="0 0 1000 160" preserveAspectRatio="none">
    <g fill="var(--tx-far)">
      <path d="M0 160V90h40V60h30v30h30V40h20v50h40V70h50v90z" />
      <path d="M210 160V80h30V50h20l10-20 10 20h20v30h40V95h30v65z" />
      <path d="M370 160V100h40V30h25v70h35V85h50v75z" />
      <path d="M520 160V75h30V45h30v30h40V20h20v55h30v85z" />
      <path d="M690 160V95h50V60h30v35h30V70h40v90z" />
      <path d="M840 160V85h30V50h20v35h40V65h30v30h40v65z" />
    </g>
    <g fill="var(--tx-far-light)" opacity=".6">
      <rect x="48" y="68" width="6" height="8" /><rect x="60" y="68" width="6" height="8" /><rect x="412" y="40" width="6" height="8" /><rect x="412" y="56" width="6" height="8" /><rect x="632" y="30" width="6" height="8" /><rect x="632" y="46" width="6" height="8" /><rect x="872" y="58" width="6" height="8" />
    </g>
  </svg>;
}

function Destination() {
  return <svg className="tx-destination" viewBox="0 0 200 180">
    <rect x="30" y="60" width="140" height="120" rx="4" fill="var(--tx-dest)" />
    <rect x="30" y="60" width="140" height="12" fill="var(--tx-dest-dark)" />
    <g fill="var(--tx-window)"><rect x="46" y="86" width="22" height="26" rx="2" /><rect x="89" y="86" width="22" height="26" rx="2" /><rect x="132" y="86" width="22" height="26" rx="2" /></g>
    <path d="M38 128h124l-8 16H46z" fill="var(--ch-accent)" />
    <rect x="80" y="144" width="40" height="36" fill="var(--tx-door)" />
    <g className="tx-dest-sign"><path d="M100 60V12" stroke="var(--tx-dest-dark)" strokeWidth="5" strokeLinecap="round" /><path d="M70 8h60c6 0 10 4 10 10v10c0 6-4 10-10 10H70c-6 0-10-4-10-10V18c0-6 4-10 10-10z" fill="var(--ch-accent)" /><path d="M78 23h34m-8-7l8 7-8 7" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>
  </svg>;
}

function Cone() {
  return <svg className="tx-cone" viewBox="0 0 120 120">
    <ellipse cx="60" cy="110" rx="46" ry="8" fill="#000" opacity=".25" />
    <path d="M46 24c0-8 6-14 14-14s14 6 14 14l18 76H28z" fill="var(--tx-cone)" />
    <path d="M38 62h44l4 16H34zM44 40h32l3 12H41z" fill="#fff" opacity=".9" />
    <rect x="14" y="98" width="92" height="12" rx="4" fill="var(--tx-cone-dark)" />
  </svg>;
}

function Taxi() {
  return <svg className="tx-taxi" viewBox="0 0 240 180">
    <ellipse cx="120" cy="170" rx="104" ry="9" fill="#000" opacity=".3" />
    {/* wheels */}
    <rect x="22" y="128" width="30" height="42" rx="7" fill="#1f1d1b" /><rect x="188" y="128" width="30" height="42" rx="7" fill="#1f1d1b" />
    {/* body */}
    <path d="M30 100c0-10 6-18 16-20l10-36c3-10 10-16 20-16h88c10 0 17 6 20 16l10 36c10 2 16 10 16 20v44c0 8-6 14-14 14H44c-8 0-14-6-14-14z" fill="var(--tx-taxi)" />
    <path d="M30 118h180v26c0 8-6 14-14 14H44c-8 0-14-6-14-14z" fill="var(--tx-taxi-dark)" />
    {/* checker band */}
    <g fill="#2b2622"><rect x="30" y="112" width="12" height="6" /><rect x="54" y="112" width="12" height="6" /><rect x="78" y="112" width="12" height="6" /><rect x="102" y="112" width="12" height="6" /><rect x="126" y="112" width="12" height="6" /><rect x="150" y="112" width="12" height="6" /><rect x="174" y="112" width="12" height="6" /><rect x="198" y="112" width="12" height="6" /><rect x="42" y="118" width="12" height="6" /><rect x="66" y="118" width="12" height="6" /><rect x="90" y="118" width="12" height="6" /><rect x="114" y="118" width="12" height="6" /><rect x="138" y="118" width="12" height="6" /><rect x="162" y="118" width="12" height="6" /><rect x="186" y="118" width="12" height="6" /></g>
    {/* rear window with passenger */}
    <path d="M62 40c2-6 7-10 14-10h88c7 0 12 4 14 10l8 32H54z" fill="var(--tx-glass)" />
    <g className="tx-passenger"><circle cx="150" cy="54" r="9" fill="var(--tx-skin)" /><path d="M136 72c2-8 7-12 14-12s12 4 14 12z" fill="var(--tx-shirt)" /></g>
    <g className="tx-driver"><circle cx="92" cy="52" r="9" fill="var(--tx-skin-2)" /><path d="M78 72c2-8 7-12 14-12s12 4 14 12z" fill="var(--tx-shirt-2)" /><rect x="80" y="40" width="24" height="7" rx="3" fill="#2b2622" /></g>
    {/* roof sign */}
    <rect x="92" y="12" width="56" height="18" rx="5" fill="var(--tx-sign)" />
    <text x="120" y="26" textAnchor="middle" fontFamily="Karla, system-ui, sans-serif" fontWeight="800" fontSize="12" fill="#2b2622" letterSpacing="1">TAXI</text>
    {/* lights */}
    <rect className="tx-light" x="36" y="126" width="30" height="12" rx="4" fill="var(--tx-light)" /><rect className="tx-light" x="174" y="126" width="30" height="12" rx="4" fill="var(--tx-light)" />
    <rect x="98" y="134" width="44" height="18" rx="3" fill="#f3efe4" /><text x="120" y="147" textAnchor="middle" fontFamily="Karla, system-ui, sans-serif" fontWeight="800" fontSize="11" fill="#2b2622">ELT 1</text>
    <path d="M70 148h100" stroke="var(--tx-taxi)" strokeWidth="3" opacity=".4" />
  </svg>;
}

function Honk() {
  return <svg className="tx-honk" viewBox="0 0 160 100">
    <path d="M20 50c20-24 44-36 70-36s50 12 70 36" fill="none" stroke="var(--tx-honk)" strokeWidth="6" strokeLinecap="round" />
    <path d="M40 60c14-16 30-24 50-24s36 8 50 24" fill="none" stroke="var(--tx-honk)" strokeWidth="6" strokeLinecap="round" opacity=".7" />
    <path d="M60 70c8-8 18-12 30-12s22 4 30 12" fill="none" stroke="var(--tx-honk)" strokeWidth="6" strokeLinecap="round" opacity=".45" />
  </svg>;
}
