import {savePrivateActivityPicture,copyPrivateActivityPicture} from './privatePictures';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useRef, useState } from 'react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Grip } from '../editor/nodes';
import { newId } from '../lib/tasks';
import { PictureField, preparePicture, useImageSrc } from '../editor/PackNode';
import { useEditorClass } from '../editor/context';
import { ActivityStage } from './ActivityStage';
import { ItemGrid, gridColumns, type GridChange } from './ItemGrid';
import { ACTIVITY_LABELS, ACTIVITY_KINDS, configFromNode, sameActivityPictureFrame, validateActivity, type ActivityKind, type ActivitySettings, type ActivityItem, ACTIVITY_COLOURS, boardStyleOf } from './model';
import { configForLearner, initialActivity, stateForLearner, transition, type ActivityAction } from './state';

export const ActivityCardAttributes = Extension.create({
  name: 'activityCardAttributes',
  addGlobalAttributes() {
    return [{ types: ['pickCard'], attributes: {
      activityItemId: { default: null }, match: { default: '' }, call: { default: '' }, useful: { default: '' }, taboo: { default: [] },
      picture: { default: null }, matchPicture: { default: null }, cardType: { default: 'character' }, special: { default: null }, move: { default: 2 },
      question: { default: '' }, followUp: { default: '' }, options: { default: [] },
    } }];
  },
});
// Kinds with extra settings on each card. Text and pictures go in the cards themselves (type / for a picture).
const PER_ITEM: ActivityKind[] = ['board', 'bingo', 'dominoes', 'memory', 'cue', 'taboo', 'survey', 'findSomeone'];
const defaults: Record<ActivityKind, string> = {
  board: 'Take turns. Roll the die and answer the question on your square.', bingo: 'Listen to the calls. Mark the matching squares on your card.',
  dominoes: 'Put the tiles in a chain. Match each word to its meaning.', memory: 'Take turns. Turn over two cards and find a pair.',
  strips: 'Put the story in the correct order.', cue: 'Read your card. Keep your information hidden and talk to your partner.',
  survey: 'Ask your classmates. Record their answers and describe the results.', findSomeone: 'Ask your classmates. Add a name for each yes answer.',
  ranking: 'Discuss the items. Agree an order with your group.', opinion: 'Choose a place on the line. Be ready to give a reason.',
  spot: 'Keep your picture hidden. Describe it to your partner and find the differences.', taboo: 'Describe the word. Do not say any of the words underneath.',
  speaking: 'Talk about the prompt. Your partner listens and asks a question.',
};
export function newCommunicativeActivity(kind: ActivityKind) {
  const count = kind === 'spot' ? 2 : kind === 'board' ? 12 : kind === 'bingo' ? 18 : kind === 'findSomeone' ? 6 : kind === 'ranking' ? 4 : ['opinion', 'speaking', 'cue'].includes(kind) ? 1 : 3;
  // No ready-made instruction: teachers write their own. The suggestion shows as a placeholder.
  return { type: 'communicativeActivity', attrs: { id: newId(), kind, instruction: '', settings: { mode: 'class', gridSize: 4, boardStyle: 'snake', seconds: 60, scoring: true, showNames: true, showCalls: false, nameOnce: false, layout: 'list', noCorrectAnswer: ['ranking', 'opinion', 'cue', 'survey', 'findSomeone', 'speaking'].includes(kind) } }, content: Array.from({ length: count }, (_, n) => ({ type: 'pickCard', attrs: { title: kind === 'board' && n === 0 ? 'Start' : kind === 'board' && n === count - 1 ? 'Finish' : '', activityItemId: newId(), ...(kind === 'board' && (n === 0 || n === count - 1) ? { special: n === 0 ? 'start' : 'finish' } : {}) }, content: [{ type: 'paragraph' }] })) };
}

// A black-and-white version of a card's picture, used when the cards print in black and white.
function ActivityBwPicture({ bw, onChange }: { bw: string; onChange: (bw: string) => void }) {
  const { classId } = useEditorClass();
  const [state, setState] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const add = async (file?: File) => {
    if (!file) return;
    setState('Uploading…');
    try { onChange(await savePrivateActivityPicture(classId, await preparePicture(file))); setState(''); }
    catch { setState('We couldn’t add that picture. Try again. The colour picture is still here.'); }
  };
  return <span className="ca-bw-row"><span>Black-and-white print</span>{bw ? <><span className="hint">Added. Used when you print in black and white.</span><button type="button" className="btn small-btn" onClick={() => input.current?.click()}>Change</button><button type="button" className="btn link small" onClick={() => onChange('')}>Remove</button></> : <button type="button" className="btn small-btn" disabled={state === 'Uploading…'} onClick={() => input.current?.click()}>Add a black-and-white version</button>}{state && <span className={state.endsWith('…') ? 'hint' : 'error small'} role="status">{state}</span>}<input ref={input} type="file" accept="image/*" hidden onChange={e => (void add(e.target.files?.[0]), (e.target.value = ''))} /></span>;
}

function ActivityPicturePicker({item, onChange}: {item: ActivityItem; onChange: (picture: ActivityItem['picture']) => void}) {
  const {classId} = useEditorClass();
  const [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const src = useImageSrc(classId, item.picture?.src ?? '');
  const position = (item.picture?.position ?? '50% 50%').split(' ').map(v => Number.parseFloat(v));
  const upload = async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (!classId) {setError('Save the lesson in a class before adding a picture.');return;}
    setUploading(true);setError('');
    try {onChange({src:await savePrivateActivityPicture(classId,await preparePicture(file)),alt:item.picture?.alt ?? '',fit:'cover'});} catch {setError('We couldn’t add the picture. Try again.');} finally {setUploading(false);}
  };
  return <div className="ca-picture-field" tabIndex={0} aria-label={`Picture for ${item.title || 'this item'}`} onDragOver={e => {if (e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e => {const file=Array.from(e.dataTransfer.files).find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();e.stopPropagation();void upload(file);}}} onPaste={e => {const file=Array.from(e.clipboardData.files).find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();e.stopPropagation();void upload(file);}}}>
    <PictureField savePicture={async file=>savePrivateActivityPicture(classId,await preparePicture(file))} pickPicture={item=>copyPrivateActivityPicture(classId,item)} value={item.picture?.src ?? ''} onChange={value=>onChange(value?{...item.picture,src:value,alt:item.picture?.alt ?? ''}:undefined)} />
    <p className="hint">{uploading?'Adding your picture…':'Upload, paste or drop a picture here.'}</p>{error&&<p role="alert" className="ca-error">{error}</p>}
    {src&&<><div className="ca-crop-preview"><img src={src} alt={item.picture?.alt ?? ''} style={{objectFit:item.picture?.fit ?? 'cover',objectPosition:item.picture?.position ?? '50% 50%'}} /></div>{item.picture?.fit !== 'contain'&&<div className="ca-crop-controls">{['Horizontal framing','Vertical framing'].map((label,n)=><label key={label}>{label}<input type="range" min="0" max="100" aria-label={label} value={position[n] ?? 50} onChange={e=>{const next=[...position];next[n]=Number(e.target.value);onChange({...item.picture!,position:next.map(v=>v+'%').join(' ')});}} /></label>)}</div>}</>}
  </div>;
}

function ActivityEditorView({ node, editor, getPos, updateAttributes, deleteNode }: NodeViewProps) {
  const c = configFromNode(node.toJSON());
  const [preview, setPreview] = useState(false);
  const [differencePosition, setDifferencePosition] = useState({x:50,y:50});
  const [error, setError] = useState('');
  const [showCards, setShowCards] = useState(false);
  const [previewState, setPreviewState] = useState<ReturnType<typeof initialActivity> | null>(null);
  const [previewRole, setPreviewRole] = useState('teacher');
  const { classId, classmates } = useEditorClass();
  const spotPictureB = c.settings.versions?.[1]?.picture;
  const pictureB = useImageSrc(classId, spotPictureB?.src ?? '');
  const people = [{ id: 'preview-a', name: 'Learner A' }, { id: 'preview-b', name: 'Learner B' }];
  const settings = (patch: Partial<ActivitySettings>) => { updateAttributes({ settings: { ...c.settings, ...patch } }); setPreview(false); };
  const cardAt = (n: number) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return null;
    let at: number | null = null; node.forEach((_child, offset, i) => { if (i === n) at = pos + 1 + offset; }); return at;
  };
  const itemAttrs = (n: number, patch: Record<string, unknown>) => {
    const at = cardAt(n); if (at === null) return;
    const frameChanged = c.kind === 'spot' && n < 2 && 'picture' in patch && !sameActivityPictureFrame(patch.picture as ActivityItem['picture'], c.items[n].picture);
    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(at, undefined, { ...node.child(n).attrs, ...patch });
      if (frameChanged) {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        const changed = typeof pos === 'number' ? tr.doc.nodeAt(pos) : null;
        if (changed && typeof pos === 'number') tr.setNodeMarkup(pos, undefined, { ...changed.attrs, settings: { ...configFromNode(changed.toJSON()).settings, differences: [] } });
      }
      return true;
    }); setPreview(false);
  };
  const add = (items = [{ title: '' }]) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined; if (typeof pos !== 'number') return;
    editor.chain().focus().insertContentAt(pos + node.nodeSize - 1, items.map(i => ({ type: 'pickCard', attrs: { ...i, activityItemId: newId() }, content: [{ type: 'paragraph' }] }))).run();
    setPreview(false);
  };
  const resizeBoard=(count:number)=>{
    if(!Number.isInteger(count)||count<12||count>48){setError('Use between 12 and 48 squares.');return;}
    const pos=typeof getPos==='function'?getPos():undefined;if(typeof pos!=='number')return;
    const original=node.toJSON().content??[];
    const cards=Array.from({length:count},(_,n)=>{
      const card=structuredClone((n===count-1 ? original.at(-1) : original[n] && n<original.length-1 ? original[n] : null)??{type:'pickCard',attrs:{title:'',activityItemId:newId()},content:[{type:'paragraph'}]});
      if(card.attrs?.special==='finish'&&n!==count-1){card.attrs.special=null;if(card.attrs.title==='Finish')card.attrs.title='';}
      if(n===count-1)card.attrs={...card.attrs,special:'finish',title:card.attrs?.title||'Finish'};
      return card;
    });
    editor.chain().focus().insertContentAt({from:pos+1,to:pos+node.nodeSize-1},cards).run();setPreview(false);setError('');
  };
  // The item grid writes straight into the cards: new cards first (at the end, or before Finish on a board),
  // then each changed cell. Everything is one step, so one undo takes it back.
  const applyGrid = (changes: GridChange[], add: number) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined; if (typeof pos !== 'number') return;
    editor.commands.command(({ tr, state }) => {
      const { pickCard, paragraph } = state.schema.nodes;
      const here = () => tr.doc.nodeAt(pos);
      const childAt = (n: number) => { const parent = here(); if (!parent || n >= parent.childCount) return null; let at = pos + 1; for (let i = 0; i < n; i++) at += parent.child(i).nodeSize; return { at, node: parent.child(n) }; };
      if (add > 0) {
        const parent = here(); if (!parent) return false;
        const index = c.kind === 'board' ? Math.max(0, parent.childCount - 1) : parent.childCount;
        const at = index < parent.childCount ? childAt(index)!.at : pos + parent.nodeSize - 1;
        tr.insert(at, Array.from({ length: add }, () => pickCard.create({ activityItemId: newId(), title: '' }, paragraph.create())));
      }
      // A card holds only plain text (no picture, list or table), so the grid can safely rewrite it.
      const plain = (n: PMNode) => { let ok = true; n.content.forEach(child => { if (child.type.name !== 'paragraph') ok = false; else child.content.forEach(t => { if (!t.isText) ok = false; }); }); return ok; };
      for (const ch of [...changes].sort((a, b) => b.row - a.row)) {
        const card = childAt(ch.row); if (!card) continue;
        const attrs = { ...card.node.attrs }, v = ch.value;
        let text: string | null = null;
        if (ch.key === 'title') { if (!attrs.title && c.kind !== 'cue' && plain(card.node)) text = ''; attrs.title = v; }
        else if (ch.key === 'special') { attrs.special = v || null; if (v === 'back' && !attrs.move) attrs.move = 2; }
        else if (ch.key === 'move') attrs.move = Math.max(1, Math.min(48, Number.parseInt(v, 10) || 2));
        else if (ch.key === 'options') attrs.options = v.split(/;|\n/).map(x => x.trim()).filter(Boolean);
        else if (ch.key === 'taboo') attrs.taboo = v.split(/,|;|\n/).map(x => x.trim()).filter(Boolean).slice(0, 5);
        else if (ch.key === 'useful') attrs.useful = v.split(/\s*\/\s*|\n/).map(x => x.trim()).filter(Boolean).join('\n');
        else if (ch.key === 'text') { if (!plain(card.node)) continue; text = v; }
        else attrs[ch.key] = v;
        tr.setNodeMarkup(card.at, undefined, attrs);
        if (text !== null) { const fresh = childAt(ch.row)!; tr.replaceWith(fresh.at + 1, fresh.at + fresh.node.nodeSize - 1, paragraph.create(null, text ? state.schema.text(text) : null)); }
      }
      return true;
    });
    setPreview(false);
  };
  const removeRows = (rows: number[]) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined; if (typeof pos !== 'number') return;
    const keep = Math.max(c.kind === 'board' ? 12 : 1, 1);
    const drop = [...new Set(rows)].filter(n => c.kind !== 'board' || n > 0 && n < c.items.length - 1).sort((a, b) => b - a).slice(0, Math.max(0, c.items.length - keep));
    if (!drop.length) { setError(c.kind === 'board' ? 'A board needs at least 12 squares.' : 'Keep at least one item.'); return; }
    editor.commands.command(({ tr }) => {
      for (const n of drop) { const parent = tr.doc.nodeAt(pos); if (!parent || n >= parent.childCount) continue; let at = pos + 1; for (let i = 0; i < n; i++) at += parent.child(i).nodeSize; tr.delete(at, at + parent.child(n).nodeSize); }
      return true;
    });
    setPreview(false); setError('');
  };
  const markDifference=(x:number,y:number)=>settings({differences:[...c.settings.differences??[],{id:newId(),x,y,radius:5,label:`Difference ${(c.settings.differences?.length??0)+1}`}]});
  const orderedPeople=[...(c.settings.turnOrderIds??[]).map(id=>classmates.find(p=>p.id===id)).filter((p):p is {id:string;name:string}=>!!p),...classmates.filter(p=>!c.settings.turnOrderIds?.includes(p.id))];
  const movePerson=(n:number,step:number)=>{const next=orderedPeople.map(p=>p.id),to=n+step;if(to<0||to>=next.length)return;[next[n],next[to]]=[next[to],next[n]];settings({turnOrderIds:next});};
  const issues = validateActivity(c);
  const startPreview = () => {
    if (issues.length) { setError(issues[0].message); return; }
    try { setPreviewState(transition(c, initialActivity(c, people), { type: 'start' }, { id: 'teacher', teacher: true }, Date.now())); setError(''); setPreview(true); } catch (e) { setError((e as Error).message); }
  };
  const previewAction = (a: ActivityAction) => {
    if (!previewState) return;
    const actual = a.type === 'roll' ? { ...a, die: Math.ceil(Math.random() * 6) } : a.type === 'call' && !a.itemId ? { ...a, itemId: c.items.find(i => !previewState.called.includes(i.id))?.id ?? '' } : a;
    try { setPreviewState(transition(c, previewState, actual, { id: previewRole, teacher: previewRole === 'teacher' }, Date.now())); setError(''); } catch (e) { setError((e as Error).message); }
  };
  return <NodeViewWrapper className={`ca ca-editor-node block-node ca-editing-${c.kind} ${showCards || !gridColumns(c.kind).length ? '' : 'ca-cards-hidden'}`}>
    <div className="mcq-tools" contentEditable={false}><Grip editor={editor} getPos={getPos} /><span className="block-label">{ACTIVITY_LABELS[c.kind]}</span><button type="button" className="btn small-btn" onClick={deleteNode}>Remove</button></div>
    <div className="ca-editor" contentEditable={false}>
      <div className="ca-editor-side">
        <label className="ca-setting">Instruction<input value={c.instruction} placeholder={`For example: ${defaults[c.kind]}`} onChange={e => updateAttributes({ instruction: e.target.value })} /></label>
        <div className="ca-setting ca-colour-setting"><span>Colours</span><span className="ca-swatches" role="radiogroup" aria-label="Colours">{ACTIVITY_COLOURS.map(o => <button key={o.v} type="button" role="radio" aria-checked={(c.settings.colours ?? 'class') === o.v} aria-label={o.label} title={o.label} className={`ca-swatch ca-pal-${o.v} ${(c.settings.colours ?? 'class') === o.v ? 'on' : ''}`} onClick={() => settings({ colours: o.v })} />)}</span></div>
        <label className="ca-setting">Play with<select value={c.settings.mode} onChange={e => settings({ mode: e.target.value as ActivitySettings['mode'] })}><option value="class">Whole class</option><option value="groups">Pairs or groups</option><option value="individual">Individual learners</option></select></label>
        {c.kind === 'board' && <><label className="ca-setting">Number of squares<input key={c.items.length} type="number" min="12" max="48" defaultValue={c.items.length} onBlur={e=>resizeBoard(Number(e.target.value))}/><small>12 to 48 squares, including Start and Finish.</small></label><label className="ca-setting">Board style<select value={boardStyleOf(c.settings.boardStyle)} onChange={e => settings({ boardStyle: e.target.value as ActivitySettings['boardStyle'] })}><option value="snake">Winding path</option><option value="spiral">Spiral</option><option value="ladders">Snakes and ladders</option></select></label><label className="ca-setting">Turn order<select value={c.settings.turnOrder ?? 'fixed'} onChange={e => settings({ turnOrder: e.target.value as ActivitySettings['turnOrder'] })}><option value="fixed">Set order</option><option value="random">Random</option></select></label></>}
        {['memory','taboo'].includes(c.kind)&&<label className="ca-setting">Turn order<select value={c.settings.turnOrder??'fixed'} onChange={e=>settings({turnOrder:e.target.value as 'fixed'|'random'})}><option value="fixed">Set order</option><option value="random">Random</option></select></label>}
        {['board','memory','taboo'].includes(c.kind)&&<><label className="ca-switch"><input type="checkbox" checked={!!c.settings.teamScoring} onChange={e=>settings({teamScoring:e.target.checked})}/>Score the current groups as teams</label>{c.settings.turnOrder!=='random'&&orderedPeople.length>0&&<details><summary>Set the turn order</summary><ol className="ca-turn-order">{orderedPeople.map((p,n)=><li key={p.id}><span>{p.name}</span><button type="button" className="btn small-btn" aria-label={`Move ${p.name} earlier`} disabled={n===0} onClick={()=>movePerson(n,-1)}>↑</button><button type="button" className="btn small-btn" aria-label={`Move ${p.name} later`} disabled={n===orderedPeople.length-1} onClick={()=>movePerson(n,1)}>↓</button></li>)}</ol></details>}</>}
        {c.kind==='findSomeone'&&<label className="ca-setting">Layout<select value={c.settings.layout??'list'} onChange={e=>settings({layout:e.target.value as 'list'|'grid'})}><option value="list">List</option><option value="grid">Grid</option></select></label>}
        {c.kind === 'board' && <label className="ca-switch"><input type="checkbox" checked={!!c.settings.printDie} onChange={e => settings({printDie:e.target.checked})} />Include a die net in print</label>}
        {c.kind === 'bingo' && <label className="ca-setting">Number of printed cards<input type="number" min="1" max="100" value={c.settings.printCards ?? 12} onChange={e=>settings({printCards:Number(e.target.value)})}/></label>}
        {c.kind === 'bingo' && <><label className="ca-setting">Card size<select value={c.settings.gridSize ?? 4} onChange={e => settings({ gridSize: Number(e.target.value) as 3 | 4 | 5, freeCentre: false })}>{[3, 4, 5].map(n => <option value={n} key={n}>{n} × {n}</option>)}</select></label><label className="ca-switch"><input type="checkbox" checked={!!c.settings.freeCentre} onChange={e => settings({ freeCentre: e.target.checked })} />Free centre square</label><label className="ca-setting">Calls visible to learners<select value={c.settings.learnerCalls ?? (c.settings.showCalls ? 'current' : 'none')} onChange={e => settings({ learnerCalls: e.target.value as ActivitySettings['learnerCalls'] })}><option value="none">Hide calls</option><option value="current">Current call only</option><option value="list">Calls so far only</option></select></label><label className="ca-setting">Win rule<select value={c.settings.winRule ?? 'line'} onChange={e => settings({ winRule: e.target.value as ActivitySettings['winRule'] })}><option value="line">One line</option><option value="twoLines">Two lines</option><option value="full">Full card</option></select></label></>}
        {c.kind === 'taboo' && <label className="ca-setting">Seconds per turn<input type="number" min={15} max="180" value={c.settings.seconds ?? 60} onChange={e => settings({ seconds: Number(e.target.value) })} /></label>}
        {c.kind === 'speaking' && <><label className="ca-setting">Counts<select value={c.settings.timerDirection ?? 'down'} onChange={e => settings({ timerDirection: e.target.value as 'down' | 'up' })}><option value="down">Down</option><option value="up">Up</option></select></label>{c.settings.timerDirection !== 'up' && <label className="ca-setting">Count down from<span className="ca-time-input"><input type="number" min={0} max={60} aria-label="Minutes" value={Math.floor((c.settings.seconds ?? 60) / 60)} onChange={e => settings({ seconds: Math.max(0, Number(e.target.value)) * 60 + (c.settings.seconds ?? 60) % 60 })} /><span>min</span><input type="number" min={0} max={59} aria-label="Seconds" value={(c.settings.seconds ?? 60) % 60} onChange={e => settings({ seconds: Math.floor((c.settings.seconds ?? 60) / 60) * 60 + Math.min(59, Math.max(0, Number(e.target.value))) })} /><span>sec</span></span></label>}<label className="ca-setting">Timer for<select value={c.settings.timerFor ?? 'class'} onChange={e => settings({ timerFor: e.target.value as 'class' | 'individual' | 'group' })}><option value="class">The whole class</option><option value="individual">Each learner</option><option value="group">Each group</option></select></label><label className="ca-setting">Timer size<select value={c.settings.timerSize ?? 'large'} onChange={e => settings({ timerSize: e.target.value as 'large' | 'inline' })}><option value="large">Large</option><option value="inline">One line</option></select></label></>}
        {c.kind === 'taboo' && <label className="ca-switch"><input type="checkbox" checked={c.settings.scoring !== false} onChange={e => settings({ scoring: e.target.checked })} />Keep score</label>}
        {c.kind === 'ranking' && <label className="ca-setting">Layout<select value={c.settings.layout ?? 'list'} onChange={e => settings({ layout: e.target.value as ActivitySettings['layout'] })}><option value="list">Ranked list</option><option value="diamond">Diamond 9</option></select></label>}
        {c.kind === 'findSomeone' && <><label className="ca-switch"><input type="checkbox" checked={!!c.settings.nameOnce} onChange={e => settings({ nameOnce: e.target.checked })} />Use each name once</label><label className="ca-switch"><input type="checkbox" checked={!!c.settings.showFollowUp} onChange={e => settings({ showFollowUp: e.target.checked })} />Ask for one extra detail</label></>}
        {c.kind === 'opinion' && <><label className="ca-setting">Learners see other pins<select value={c.settings.pinsVisible ?? 'reveal'} onChange={e => settings({ pinsVisible: e.target.value as 'reveal' | 'after' | 'always' })}><option value="reveal">When you reveal them</option><option value="after">After they save their own pin</option><option value="always">All the time</option></select></label><label className="ca-setting">After saving, learners can<select value={c.settings.pinMove === false ? 'no' : 'yes'} onChange={e => settings({ pinMove: e.target.value === 'yes' })}><option value="yes">Move their pin</option><option value="no">Not move their pin</option></select></label><label className="ca-setting">Left label<input value={c.settings.lowLabel ?? ''} placeholder="Strongly disagree" onChange={e => settings({ lowLabel: e.target.value })} /></label><label className="ca-setting">Right label<input value={c.settings.highLabel ?? ''} placeholder="Strongly agree" onChange={e => settings({ highLabel: e.target.value })} /></label><label className="ca-switch"><input type="checkbox" checked={c.settings.showNames !== false} onChange={e => settings({ showNames: e.target.checked })} />Show names after revealing</label><label className="ca-switch"><input type="checkbox" checked={!!c.settings.askReason} onChange={e => settings({ askReason: e.target.checked })} />Ask for a reason</label></>}
        {['ranking', 'cue', 'findSomeone'].includes(c.kind) && <label className="ca-setting">Useful language (optional)<textarea rows={3} value={c.settings.useful ?? ''} onChange={e => settings({ useful: e.target.value })} /></label>}
      </div>
      <div className="ca-editor-preview"><div className="ca-preview-bar"><strong>Live preview</strong>{preview && previewState ? <span className="ca-view-as" role="radiogroup" aria-label="View the preview as">{[{ id: 'teacher', name: 'Teacher view' }, ...people.map(p => ({ id: p.id, name: `As ${p.name}` }))].map(v => <button key={v.id} type="button" role="radio" aria-checked={previewRole === v.id} className={previewRole === v.id ? 'on' : ''} onClick={() => setPreviewRole(v.id)}>{v.name}</button>)}</span> : <span className="hint">Type / in a card to add a picture.</span>}<button className="btn primary small-btn" type="button" onClick={startPreview}>{preview ? 'Start again' : 'Try the activity'}</button></div>{issues.length > 0 && <div className="ca-validation" role="status"><b>Before starting</b><ul>{issues.map((issue, n) => <li key={n}>{issue.message}</li>)}</ul></div>}{error && <p role="alert">{error}</p>}{preview && previewState && <div className="ca-preview-screen"><ActivityStage classId={classId} teacher={previewRole === 'teacher'} config={previewRole === 'teacher' ? c : configForLearner(c, previewState, previewRole)} state={previewRole === 'teacher' ? previewState : stateForLearner(c, previewState, previewRole)} selfId={previewRole} send={previewAction} error={error} /></div>}</div>
    </div>
    {gridColumns(c.kind).length > 0 && <div className="ca-grid-wrap" contentEditable={false}><div className="ca-grid-head"><b>{c.kind === 'board' ? 'Squares' : ['dominoes', 'memory'].includes(c.kind) ? 'Pairs' : c.kind === 'strips' ? 'Strips, in the correct order' : 'Items'}</b><span className="hint">{c.items.length} {c.kind === 'board' ? 'squares' : c.items.length === 1 ? 'item' : 'items'}</span><button type="button" className="btn small-btn ca-cards-toggle" aria-expanded={showCards} onClick={() => setShowCards(v => !v)}>{showCards ? 'Hide pictures and formatting' : 'Pictures and formatting'}</button></div><ItemGrid kind={c.kind} items={c.items} maxRows={c.kind === 'board' ? 48 : 200} minRows={c.kind === 'board' ? 12 : 1} onChange={applyGrid} onRemove={removeRows} /></div>}
    {(showCards || c.kind === 'spot') && (PER_ITEM.includes(c.kind) || c.kind === 'spot' || c.items.some(i => i.picture?.src)) && <div className="ca-item-settings" contentEditable={false}><p className="ca-item-settings-head">{c.kind === 'board' ? 'Special squares' : ['dominoes', 'memory'].includes(c.kind) ? 'Pairs: each card and the half it matches' : 'More for each card'}</p>{c.items.map((item, n) => <details key={item.id} className="ca-item" open={['dominoes', 'memory'].includes(c.kind) && !item.match?.trim() && !item.matchPicture?.src}><summary>{c.kind === 'board' ? 'Square' : ['dominoes', 'memory'].includes(c.kind) ? 'Pair' : 'Card'} {n + 1}{item.title ? ` · ${item.title}` : ''}{item.match ? ` = ${item.match}` : ''}{item.special ? ` · ${item.special === 'back' ? 'Go back' : item.special === 'miss' ? 'Miss a turn' : item.special === 'again' ? 'Roll again' : item.special === 'start' ? 'Start' : 'Finish'}` : ''}</summary>
      {c.kind === 'spot' && <ActivityPicturePicker item={item} onChange={picture => itemAttrs(n, {picture: picture ?? null})} />}
      {item.picture?.src && <><label>Picture description<input value={item.picture.alt} onChange={e => itemAttrs(n, { picture: { ...item.picture, alt: e.target.value } })} /></label><button type="button" className="btn small-btn" onClick={() => itemAttrs(n, { picture: null })}>Remove this picture</button><label>Fit<select value={item.picture.fit ?? 'cover'} onChange={e => itemAttrs(n, { picture: { ...item.picture, fit: e.target.value } })}><option value="cover">Fill the frame</option><option value="contain">Show the whole picture</option></select></label><ActivityBwPicture bw={item.picture.bw ?? ''} onChange={bw => itemAttrs(n, { picture: { ...item.picture, bw } })} /></>}
      {['dominoes', 'memory'].includes(c.kind) && <><label>Matching half<input value={item.match ?? ''} onChange={e => itemAttrs(n, { match: e.target.value })} /></label><ActivityPicturePicker item={{...item,title:'Matching half',picture:item.matchPicture}} onChange={picture=>itemAttrs(n,{matchPicture:picture??null})}/>{item.matchPicture?.src&&<label>Matching picture description<input value={item.matchPicture.alt} onChange={e=>itemAttrs(n,{matchPicture:{...item.matchPicture,alt:e.target.value}})}/></label>}</>}
      {c.kind === 'bingo' && <label>Call (optional)<input value={item.call ?? ''} placeholder="The caller reads the item if this is blank" onChange={e => itemAttrs(n, { call: e.target.value })} /></label>}
      {c.kind === 'cue' && <><label>Card type<select value={item.cardType ?? 'character'} onChange={e => itemAttrs(n, { cardType: e.target.value })}><option value="character">Character or persona</option><option value="secret">Secret objective</option><option value="opinion">Opinion prompt</option><option value="problem">Problem scenario</option></select></label><label>Useful language (optional)<textarea value={item.useful ?? ''} onChange={e => itemAttrs(n, { useful: e.target.value })} /></label></>}
      {c.kind === 'board' && <><label>Special square<select value={item.special ?? ''} onChange={e => itemAttrs(n, { special: e.target.value || null })}><option value="">Ordinary square</option><option value="start">Start</option><option value="finish">Finish</option><option value="back">Go back</option><option value="miss">Miss a turn</option><option value="again">Roll again</option></select></label>{item.special === 'back' && <label>Squares to move back<input type="number" min="1" max="48" value={item.move ?? 2} onChange={e => itemAttrs(n, { move: Number(e.target.value) })} /></label>}</>}
      {c.kind === 'taboo' && <label>Taboo words (up to five)<input value={(item.taboo ?? []).join(', ')} onChange={e => itemAttrs(n, { taboo: e.target.value.split(',').map(w => w.trim()).filter(Boolean) })} /></label>}
      {c.kind === 'survey' && <label>Possible answers (one per line)<textarea value={(item.options ?? []).join('\n')} onChange={e => itemAttrs(n, { options: e.target.value.split('\n') })} /></label>}
      {c.kind === 'findSomeone' && <><label>Question form (optional)<input value={item.question ?? ''} onChange={e => itemAttrs(n, { question: e.target.value })} /></label><label>Follow-up question (optional)<input value={item.followUp ?? ''} onChange={e => itemAttrs(n, { followUp: e.target.value })} /></label></>}
    </details>)}</div>}
    {c.kind === 'spot' && <div contentEditable={false}><p>Mark the differences on picture B. Select a circle to remove it.</p>{pictureB && <><div className="ca-crop-controls">{(['x','y'] as const).map((axis,n)=><label key={axis}>{n===0?'Horizontal position':'Vertical position'}<input type="range" min="0" max="100" value={differencePosition[axis]} onChange={e=>setDifferencePosition({...differencePosition,[axis]:Number(e.target.value)})}/></label>)}<button className="btn" type="button" onClick={()=>markDifference(differencePosition.x,differencePosition.y)}>Mark this point</button></div><div className="ca-spot ca-spot-editor" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); markDifference(100 * (e.clientX-r.left)/r.width,100*(e.clientY-r.top)/r.height); }}><img src={pictureB} alt={spotPictureB?.alt || 'Picture B'} style={{width:'100%',height:'100%',maxWidth:'none',maxHeight:'none',margin:0,objectFit:spotPictureB?.fit ?? 'cover',objectPosition:spotPictureB?.position ?? '50% 50%'}} />{c.settings.differences?.map(d => <button key={d.id} type="button" className="ca-ring" style={{ left: `${d.x}%`, top: `${d.y}%` }} aria-label={`Remove ${d.label}`} onClick={e => { e.stopPropagation(); settings({ differences: c.settings.differences?.filter(x => x.id !== d.id) }); }} />)}</div></>}</div>}
    <NodeViewContent className="pick-cards ca-rich-items" />
    <div contentEditable={false} hidden={!showCards && gridColumns(c.kind).length > 0 && c.kind !== 'board'}><button className="btn dashed" type="button" disabled={c.kind==='board'&&c.items.length>=48} onClick={() => c.kind==='board'?resizeBoard(c.items.length+1):add()}>Add item</button>{c.kind==='board'&&c.items.length>=48&&<p className="hint">A board can have up to 48 squares.</p>}</div>
  </NodeViewWrapper>;
}

export const CommunicativeActivity = Node.create({
  name: 'communicativeActivity', group: 'block', content: 'pickCard+', defining: true, isolating: true, draggable: true,
  addAttributes: () => ({ id: { default: null }, kind: { default: 'cue' }, sealed: { default: false }, instruction: { default: '' }, settings: { default: { mode: 'class' } } }),
  parseHTML: () => [{ tag: 'div[data-communicative-activity]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-communicative-activity': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(ActivityEditorView),
});
export const COMMUNICATIVE_INSERTS = ACTIVITY_KINDS.map(kind => ({ key: `activity-${kind}`, label: ACTIVITY_LABELS[kind], hint: defaults[kind], group: 'Blocks' as const, run: (e: NodeViewProps['editor']) => {const {$from}=e.state.selection;for(let depth=1;depth<=$from.depth;depth++)if($from.node(depth).type.name==='communicativeActivity')return e.chain().focus().insertContentAt($from.after(depth),[newCommunicativeActivity(kind),{type:'paragraph'}]).run();return e.chain().focus().insertContent([newCommunicativeActivity(kind),{type:'paragraph'}]).run();} }));
