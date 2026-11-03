import type {CoachContext} from './conversations';
export type CoachPanelState={uid:string;conversationId:string;context:CoachContext;min?:boolean};
const key='elt.coach.panel';
export function readCoachPanel():CoachPanelState|null{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}}
export function setCoachPanel(value:CoachPanelState|null){try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}window.dispatchEvent(new CustomEvent('elt-coach-panel',{detail:value}));}
