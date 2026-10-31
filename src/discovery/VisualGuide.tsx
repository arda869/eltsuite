import { useEffect, useId, useRef, useState } from 'react';
import { UiIcon } from '../components/UiIcon';
import type { Feature, FeatureId } from './catalog';

const STORIES: Record<FeatureId, { title: string; labels: [string, string, string]; action: string }> = {
  lessons: { title: 'From an idea to a lesson.', labels: ['Choose your class', 'Build your activity', 'Preview your lesson'], action: 'Open Classes' },
  notes: { title: 'A little note. A clearer lesson.', labels: ['Choose a lesson', 'Find your notes', 'Keep a teaching prompt'], action: 'Open Classes' },
  assessment: { title: 'Make feedback useful.', labels: ['Find submitted work', 'Look at an answer', 'Give your feedback'], action: 'Open Classes' },
  live: { title: 'Bring everyone into the lesson.', labels: ['Prepare your lesson', 'Invite your learners', 'Start teaching live'], action: 'Open Classes' },
  timetable: { title: 'Give your next lesson a place.', labels: ['Find your week', 'Choose a time', 'Save your session'], action: 'Open Timetable' },
  collab: { title: 'Turn an idea into a resource.', labels: ['Make a document', 'Shape your activity', 'Preview and share'], action: 'Open Collab' },
  reading: { title: 'Follow an idea worth keeping.', labels: ['Start a reading journal', 'Keep your source', 'Add your first note'], action: 'Open Development Studio' },
};

// Native SVG illustrations stay crisp, theme-aware and aligned with the existing icon family.
// They illustrate the workflow; they are not screenshots or evidence of a completed action.
export function WorkflowArt({ feature, stage = 0 }: { feature: FeatureId; stage?: number }) {
  const id = useId();
  return <svg className="discovery-art" viewBox="0 0 360 176" fill="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x1="30" y1="0" x2="330" y2="176" gradientUnits="userSpaceOnUse"><stop stopColor="var(--accent)" stopOpacity=".2" /><stop offset="1" stopColor="var(--accent)" stopOpacity=".02" /></linearGradient></defs>
    <rect width="360" height="176" rx="20" fill={`url(#${id})`} />
    <circle cx="313" cy="35" r="52" stroke="var(--accent)" strokeOpacity=".16" /><circle cx="40" cy="161" r="55" stroke="var(--accent)" strokeOpacity=".14" />
    <g className="discovery-art-paper"><rect x="61" y="21" width="238" height="138" rx="13" fill="var(--paper)" stroke="var(--hair-strong)" /><path d="M62 46h236" stroke="var(--hair)" /><circle cx="75" cy="34" r="2.5" fill="var(--accent-text)" opacity=".55" /><circle cx="84" cy="34" r="2.5" fill="var(--accent-text)" opacity=".3" /><circle cx="93" cy="34" r="2.5" fill="var(--accent-text)" opacity=".18" /><rect x="238" y="30" width="45" height="8" rx="4" fill="var(--surface)" /></g>
    {stage === 0 ? <g stroke="var(--hair-strong)"><rect x="75" y="59" width="38" height="85" rx="6" fill="var(--surface)" stroke="none" /><path d="M84 73h20M84 85h15M84 97h20M84 109h13" strokeLinecap="round" />{[0, 1, 2].map(i => <g key={i}><rect x={125 + i * 53} y="63" width="45" height="69" rx="7" fill={i === 1 ? 'color-mix(in srgb, var(--accent) 14%, var(--paper))' : 'var(--paper)'} stroke={i === 1 ? 'var(--accent-text)' : 'var(--hair-strong)'} /><rect x={135 + i * 53} y="74" width="25" height="20" rx="4" fill={i === 1 ? 'var(--accent-text)' : 'var(--surface)'} opacity={i === 1 ? '.25' : '1'} stroke="none" /><path d={`M${135 + i * 53} 106h25m-25 8h17`} strokeLinecap="round" /></g>)}</g> : <g stroke="var(--hair-strong)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {feature === 'lessons' && <><rect x="81" y="60" width="198" height="82" rx="8" fill="var(--paper-soft)" /><path d="M96 75h91M96 84h143" /><circle cx="100" cy="102" r="5" stroke="var(--accent-text)" /><circle cx="100" cy="121" r="5" /><path d="M113 102h98M113 121h75" /><circle cx="100" cy="102" r="2" fill="var(--accent-text)" stroke="none" /></>}
      {feature === 'notes' && <><path d="M82 65h91M82 77h105M82 89h82M82 110h60M82 122h79" /><rect x="196" y="57" width="85" height="88" rx="7" fill="color-mix(in srgb, var(--accent) 12%, var(--paper))" stroke="var(--accent-text)" /><path d="M209 73h44M209 86h58M209 98h52M209 110h42M209 122h50" stroke="var(--accent-text)" opacity=".6" /></>}
      {feature === 'assessment' && <><path d="M82 65h107M82 76h151M82 87h136M82 98h88" /><rect x="111" y="107" width="168" height="36" rx="8" fill="color-mix(in srgb, var(--accent) 12%, var(--paper))" stroke="var(--accent-text)" /><path d="M126 120h96M126 130h129" stroke="var(--accent-text)" opacity=".7" /><circle cx="265" cy="69" r="13" fill="var(--surface)" /><path d="m259 69 4 4 8-9" stroke="var(--accent-text)" /></>}
      {feature === 'live' && <><rect x="111" y="59" width="137" height="55" rx="6" fill="var(--surface)" /><path d="m169 73 18 9-18 10V73Z" fill="var(--accent-text)" stroke="none" /><path d="M179 115v10M99 126h161M99 126v7M139 126v7M219 126v7M259 126v7" stroke="var(--accent-text)" opacity=".5" />{[99,139,179,219,259].map(x => <circle key={x} cx={x} cy="142" r="7" fill="color-mix(in srgb, var(--accent) 22%, var(--paper))" stroke="var(--accent-text)" />)}</>}
      {feature === 'timetable' && <><rect x="81" y="59" width="198" height="85" rx="6" fill="var(--paper-soft)" /><path d="M81 80h198M120 59v85M160 59v85M200 59v85M240 59v85M81 101h198M81 122h198" stroke="var(--hair)" /><rect x="163" y="86" width="34" height="45" rx="5" fill="var(--accent-text)" opacity=".2" stroke="none" /><path d="M170 96h20M170 104h14" stroke="var(--accent-text)" /></>}
      {feature === 'collab' && <><path d="M87 65h101M87 80h184M87 92h171M87 104h180M87 116h137" /><rect x="85" y="97" width="109" height="10" rx="2" fill="var(--accent-text)" opacity=".15" stroke="none" /><path d="M195 95v18" stroke="var(--accent-text)" strokeWidth="2" />{[236,253,270].map((x,i) => <circle key={x} cx={x} cy="133" r="9" fill="color-mix(in srgb, var(--accent) 18%, var(--paper))" stroke="var(--accent-text)" opacity={1-i*.2} />)}</>}
      {feature === 'reading' && <><path d="M85 67c26-5 53 0 78 13v53c-25-13-52-18-78-13V67Zm78 13c22-13 49-18 75-13v53c-26-5-53 0-75 13V80Z" fill="var(--paper-soft)" /><path d="M98 82c16 0 31 4 50 12M98 94c15 1 28 4 43 10M178 94c15-7 28-10 45-12M178 106c12-6 26-9 40-10" /><rect x="229" y="99" width="49" height="43" rx="6" fill="color-mix(in srgb, var(--accent) 16%, var(--paper))" stroke="var(--accent-text)" /><path d="M239 112h28M239 121h22M239 130h27" stroke="var(--accent-text)" /></>}
    </g>}
    <g transform={stage === 2 ? 'translate(269 120)' : stage === 1 ? 'translate(273 96)' : 'translate(212 108)'}>
      <circle r="17" fill="var(--accent-text)" stroke="var(--paper)" strokeWidth="4" />
      {stage === 2 ? <path d="m-6 0 4 4 8-8" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M-5-7 7 0 1 2-1 8-5-7Z" fill="var(--paper)" />}
    </g>
  </svg>;
}

export function VisualGuide({ feature, onOpen, onBack }: { feature: Feature; onOpen: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const story = STORIES[feature.id];
  return <article className="discovery-visual-guide" aria-label={feature.name + ' visual guide'}>
    <button className="discovery-back" type="button" onClick={onBack}><UiIcon name="prev" size={15} /> Back to discovery</button>
    <div className="discovery-guide-heading"><span className="discovery-symbol"><UiIcon name={feature.icon} size={28} /></span><div><span className="discovery-eyebrow">{feature.name} · Visual guide</span><h3 ref={heading} tabIndex={-1}>{story.title}</h3></div></div>
    <div className="discovery-flow-layout">
    <figure className="discovery-guide-figure"><WorkflowArt feature={feature.id} stage={step} /><figcaption>Illustration · Step {step + 1} of 3</figcaption><p className="discovery-art-benefit">{feature.benefit}</p></figure>
    <div>
    <ol className="discovery-steps discovery-flow-tree" aria-label="Walkthrough steps">{feature.steps.map((body, i) => <li key={body} className={step === i ? 'active' : ''}><button type="button" className="discovery-flow-node" aria-current={step === i ? 'step' : undefined} aria-expanded={step === i} onClick={() => setStep(i)}><span className="discovery-flow-number" aria-hidden="true">{i + 1}</span><span className="discovery-flow-copy"><b>{story.labels[i]}</b>{step === i && <span>{body}</span>}</span><span className="discovery-flow-toggle" aria-hidden="true">{step === i ? '−' : '+'}</span></button></li>)}</ol>
    <div className="discovery-guide-pagination"><span aria-live="polite">Step {step + 1} of 3 · {story.labels[step]}</span><div><button type="button" aria-label="Previous step" disabled={step === 0} onClick={() => setStep(s => s - 1)}><UiIcon name="prev" size={17} /></button><button type="button" aria-label="Next step" disabled={step === 2} onClick={() => setStep(s => s + 1)}><UiIcon name="next" size={17} /></button></div></div>
    </div></div>
    <div className="discovery-flow-branches"><button className="btn primary tall" onClick={onOpen}>{story.action} <span aria-hidden="true">↗</span></button><a href={'/guide#gu-' + feature.topic} className="btn tall">Read the full guide</a></div>
    <p className="discovery-fine">Explore the steps here, then try them with your own work. Reading this guide doesn’t mark the feature as used.</p>
  </article>;
}
