import type { ArtView } from './model';

// Structured variations of a saved character: the side it is seen from, its pose and its expression.
// The same lists live in functions/designer/variants.js. A variation's key is `${view}.${pose}.${face}`;
// the reference picture itself is the key `ref`.
export const CHAR_POSES: { k: string; name: string }[] = [
  { k: 'stand', name: 'Standing' },
  { k: 'sit', name: 'Sitting' },
  { k: 'walk', name: 'Walking' },
  { k: 'run', name: 'Running' },
  { k: 'point', name: 'Pointing' },
  { k: 'wave', name: 'Waving' },
  { k: 'hold', name: 'Holding something' },
  { k: 'think', name: 'Thinking' },
  { k: 'arms', name: 'Arms crossed' },
  { k: 'hips', name: 'Hands on hips' },
];
export const CHAR_FACES: { k: string; name: string }[] = [
  { k: 'neutral', name: 'Calm' },
  { k: 'happy', name: 'Happy' },
  { k: 'sad', name: 'Sad' },
  { k: 'surprised', name: 'Surprised' },
  { k: 'confused', name: 'Confused' },
  { k: 'angry', name: 'Angry' },
  { k: 'thinking', name: 'Thoughtful' },
];
export type Variant = { view: ArtView; pose: string; face: string };
export const variantKey = (v: Variant) => `${v.view}.${v.pose}.${v.face}`;
export function parseVariant(k?: string): Variant | null {
  if (!k || k === 'ref') return null;
  const [view, pose, face] = k.split('.');
  if (!view || !pose || !face) return null;
  return { view: view as ArtView, pose, face };
}
export const REF: Variant = { view: 'front', pose: 'stand', face: 'neutral' };
