import { useEffect, useState, type ReactNode } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// A photo as a profile picture: its key is "photo:<uid>", the picture itself in photos/<uid>.
const photoCache = new Map<string, Promise<string>>();
export const photoKey = (uid: string) => 'photo:' + uid;
export const loadPhoto = (uid: string) => {
  if (!photoCache.has(uid)) photoCache.set(uid, getDoc(doc(db, 'photos', uid)).then((s) => String(s.data()?.data ?? ''), () => ''));
  return photoCache.get(uid)!;
};
export async function savePhoto(uid: string, file: Blob) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const data = c.toDataURL('image/jpeg', 0.82);
  await setDoc(doc(db, 'photos', uid), { data, at: Date.now() });
  photoCache.set(uid, Promise.resolve(data));
  return data;
}
function Photo({ uid, size, className }: { uid: string; size: number; className: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => void loadPhoto(uid).then(setSrc), [uid]);
  return src ? <img className={'avatar-photo ' + className} src={src} width={size} height={size} alt="" /> : <span className={'avatar-fallback ' + className} style={{ width: size, height: size }} aria-hidden="true" />;
}

// Profile pictures: flat illustrations on a soft circle, in the app's muted palette.
// Each picture can be used by only one person in a class.

const INK = '#2f2e2d';
const W = '#ffffff';

type A = { key: string; label: string; bg: string; art: ReactNode };

// Building blocks
const eyes = (y = 30, gap = 8, r = 2.2) => (
  <>
    <circle cx={32 - gap} cy={y} r={r} fill={INK} />
    <circle cx={32 + gap} cy={y} r={r} fill={INK} />
  </>
);
const smile = (y = 37, w = 5) => <path d={`M${32 - w} ${y}q${w} ${w * 0.7} ${w * 2} 0`} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />;
const cheeks = (y = 35, gap = 13, c = '#f2b8a8') => (
  <>
    <circle cx={32 - gap} cy={y} r="3" fill={c} opacity="0.7" />
    <circle cx={32 + gap} cy={y} r="3" fill={c} opacity="0.7" />
  </>
);
const head = (c: string, r = 17, cy = 34) => <circle cx="32" cy={cy} r={r} fill={c} />;

export const AVATARS: A[] = [
  // Animals
  { key: 'cat', label: 'Cat', bg: '#f3e6d8', art: <><path d="M17 26l3-13 9 8M47 26l-3-13-9 8" fill="#e0a46c" />{head('#e8b07a')}{eyes()}<path d="M30 35l2 2 2-2" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" /><path d="M14 34h8M14 38l8-1M50 34h-8M50 38l-8-1" stroke={INK} strokeWidth="1.2" strokeLinecap="round" /></> },
  { key: 'fox', label: 'Fox', bg: '#f5e3d5', art: <><path d="M15 28l4-16 10 9M49 28l-4-16-10 9" fill="#d9743f" /><path d="M15 30q17-14 34 0q-4 18-17 20q-13-2-17-20z" fill="#e0844a" /><path d="M22 38q10 14 20 0q-10 8-20 0z" fill={W} />{eyes(32, 8)}<circle cx="32" cy="42" r="2.2" fill={INK} /></> },
  { key: 'owl', label: 'Owl', bg: '#e7e3da', art: <><path d="M16 22l6 5M48 22l-6 5" stroke="#8a6c4f" strokeWidth="3" strokeLinecap="round" /><ellipse cx="32" cy="36" rx="17" ry="18" fill="#a88560" /><circle cx="25" cy="31" r="7" fill={W} /><circle cx="39" cy="31" r="7" fill={W} /><circle cx="25" cy="31" r="3" fill={INK} /><circle cx="39" cy="31" r="3" fill={INK} /><path d="M30 38l2 4 2-4z" fill="#e2a33f" /></> },
  { key: 'bear', label: 'Bear', bg: '#eadfd3', art: <><circle cx="19" cy="20" r="6" fill="#9b6f4e" /><circle cx="45" cy="20" r="6" fill="#9b6f4e" />{head('#a87b58')}<ellipse cx="32" cy="40" rx="8" ry="6" fill="#e2c7a8" />{eyes(30, 7)}<ellipse cx="32" cy="38" rx="2.6" ry="2" fill={INK} /></> },
  { key: 'rabbit', label: 'Rabbit', bg: '#eee7ee', art: <><ellipse cx="25" cy="14" rx="4.5" ry="12" fill="#e9e2e2" /><ellipse cx="39" cy="14" rx="4.5" ry="12" fill="#e9e2e2" /><ellipse cx="25" cy="15" rx="2" ry="8" fill="#f2c2c6" /><ellipse cx="39" cy="15" rx="2" ry="8" fill="#f2c2c6" />{head('#f1ecea', 16, 37)}{eyes(35, 6)}<path d="M31 40h2l-1 1.5z" fill="#e58f9b" />{cheeks(41, 10)}</> },
  { key: 'panda', label: 'Panda', bg: '#e3ece4', art: <><circle cx="19" cy="21" r="6" fill={INK} /><circle cx="45" cy="21" r="6" fill={INK} />{head('#fbfbf9')}<ellipse cx="24" cy="32" rx="4.5" ry="5.5" fill={INK} transform="rotate(-20 24 32)" /><ellipse cx="40" cy="32" rx="4.5" ry="5.5" fill={INK} transform="rotate(20 40 32)" /><circle cx="24.5" cy="31.5" r="1.4" fill={W} /><circle cx="39.5" cy="31.5" r="1.4" fill={W} /><ellipse cx="32" cy="39" rx="2.6" ry="2" fill={INK} /></> },
  { key: 'penguin', label: 'Penguin', bg: '#dfe8ef', art: <><ellipse cx="32" cy="36" rx="16" ry="19" fill="#34404f" /><ellipse cx="32" cy="39" rx="11" ry="14" fill={W} />{eyes(30, 5)}<path d="M29 34h6l-3 4z" fill="#e8a23a" /></> },
  { key: 'frog', label: 'Frog', bg: '#e1ecdc', art: <><circle cx="22" cy="22" r="7" fill="#7fb069" /><circle cx="42" cy="22" r="7" fill="#7fb069" /><ellipse cx="32" cy="37" rx="18" ry="14" fill="#8cbd74" /><circle cx="22" cy="22" r="3.5" fill={W} /><circle cx="42" cy="22" r="3.5" fill={W} /><circle cx="22" cy="22" r="1.8" fill={INK} /><circle cx="42" cy="22" r="1.8" fill={INK} /><path d="M22 40q10 7 20 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" /></> },
  { key: 'whale', label: 'Whale', bg: '#dbe7f1', art: <><path d="M10 38q0-15 20-15q20 0 22 14l6-6-1 11q-6 8-27 8q-20 0-20-12z" fill="#5f8fb8" /><path d="M14 42q16 6 36 0q-4 6-18 6t-18-6z" fill="#cfe0ee" /><circle cx="22" cy="34" r="2" fill={INK} /><path d="M30 18q0-6 4-8M30 18q-2-5-6-6" stroke="#7fb0d8" strokeWidth="2" fill="none" strokeLinecap="round" /></> },
  { key: 'bird', label: 'Bird', bg: '#f4ecd3', art: <><circle cx="32" cy="34" r="16" fill="#e6b84a" /><path d="M30 18q4-8 8-4" stroke="#c9952c" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M44 33l9 3-9 3z" fill="#e07a3b" /><circle cx="37" cy="30" r="2.2" fill={INK} /><path d="M20 38q6 6 12 0" fill="#d9a43a" /></> },
  { key: 'deer', label: 'Deer', bg: '#efe4d6', art: <><path d="M20 22q-6-6-4-12M20 16q-4-2-6 0M44 22q6-6 4-12M44 16q4-2 6 0" stroke="#8a6644" strokeWidth="2.5" fill="none" strokeLinecap="round" /><ellipse cx="18" cy="27" rx="6" ry="3.5" fill="#b9875c" transform="rotate(-25 18 27)" /><ellipse cx="46" cy="27" rx="6" ry="3.5" fill="#b9875c" transform="rotate(25 46 27)" /><ellipse cx="32" cy="36" rx="13" ry="16" fill="#c49466" />{eyes(32, 6)}<ellipse cx="32" cy="45" rx="3" ry="2.2" fill={INK} /></> },
  { key: 'koala', label: 'Koala', bg: '#e4e6e8', art: <><circle cx="16" cy="27" r="9" fill="#a3a8ad" /><circle cx="48" cy="27" r="9" fill="#a3a8ad" /><circle cx="16" cy="27" r="5" fill="#e6d9dc" /><circle cx="48" cy="27" r="5" fill="#e6d9dc" />{head('#b3b8bd', 16, 35)}<ellipse cx="32" cy="38" rx="4" ry="5.5" fill="#4a4e53" />{eyes(31, 8)}</> },
  { key: 'lion', label: 'Lion', bg: '#f4e7cf', art: <><circle cx="32" cy="34" r="22" fill="#c98a3d" />{head('#e8b866', 14)}{eyes(31, 5.5)}<path d="M29 37h6l-3 3z" fill={INK} />{smile(41, 3)}</> },
  { key: 'dog', label: 'Dog', bg: '#efe5dc', art: <><ellipse cx="16" cy="33" rx="6" ry="11" fill="#8f6a4c" /><ellipse cx="48" cy="33" rx="6" ry="11" fill="#8f6a4c" />{head('#d7b18b', 15)}<circle cx="38" cy="29" r="5" fill="#b58b66" />{eyes(31, 6)}<ellipse cx="32" cy="38" rx="3" ry="2.2" fill={INK} />{smile(42, 3)}</> },
  { key: 'mouse', label: 'Mouse', bg: '#ebe8e5', art: <><circle cx="17" cy="23" r="9" fill="#b9b4b0" /><circle cx="47" cy="23" r="9" fill="#b9b4b0" /><circle cx="17" cy="23" r="5" fill="#efc7cb" /><circle cx="47" cy="23" r="5" fill="#efc7cb" />{head('#c8c3bf', 15, 37)}{eyes(35, 5.5)}<circle cx="32" cy="41" r="2.2" fill="#e58f9b" /></> },
  { key: 'hedgehog', label: 'Hedgehog', bg: '#efe6db', art: <><path d="M10 40l4-6-3-5 6-2-1-6 6 1 2-6 5 3 4-5 4 5 5-3 2 6 6-1-1 6 6 2-3 5 4 6z" fill="#7d6450" /><ellipse cx="32" cy="41" rx="14" ry="10" fill="#e8cfae" />{eyes(39, 5)}<circle cx="32" cy="44" r="2" fill={INK} /></> },
  { key: 'octopus', label: 'Octopus', bg: '#f0e1e8', art: <><path d="M14 36q0-20 18-20t18 20q-2 4-4 0q-2 8-5 2q-3 8-6 1q-3 8-6 0q-3 6-5-2q-2 6-4 0q-2 3-6-1z" fill="#c9708f" />{eyes(31, 6)}{smile(37, 4)}</> },
  { key: 'turtle', label: 'Turtle', bg: '#e2ebde', art: <><circle cx="50" cy="34" r="5" fill="#9cc48a" /><ellipse cx="30" cy="38" rx="17" ry="12" fill="#5f8f55" /><path d="M20 34l5-6h10l5 6-5 6H25z" fill="#77a56a" /><circle cx="51" cy="33" r="1.4" fill={INK} /><path d="M16 46l-3 4M44 46l3 4" stroke="#9cc48a" strokeWidth="4" strokeLinecap="round" /></> },
  { key: 'bee', label: 'Bee', bg: '#f5efcf', art: <><ellipse cx="22" cy="22" rx="7" ry="5" fill="#dfe9f2" opacity="0.95" /><ellipse cx="42" cy="22" rx="7" ry="5" fill="#dfe9f2" opacity="0.95" /><ellipse cx="32" cy="36" rx="15" ry="13" fill="#e9c24a" /><path d="M24 26q8 3 16 0M20 35q12 3 24 0M21 43q11 3 22 0" stroke={INK} strokeWidth="3" fill="none" />{eyes(31, 5, 1.8)}</> },
  { key: 'snail', label: 'Snail', bg: '#ece6dc', art: <><path d="M8 46h44q4-1 3-5l-6 1" fill="#c9b49a" /><circle cx="30" cy="34" r="13" fill="#c98a5a" /><path d="M30 34m-4 0a4 4 0 1 0 8 0a8 8 0 1 0-16 0" fill="none" stroke="#e8b48a" strokeWidth="2.5" /><path d="M48 40l2-12M53 40l3-11" stroke="#a89277" strokeWidth="2" strokeLinecap="round" /><circle cx="50" cy="28" r="1.8" fill={INK} /><circle cx="56" cy="29" r="1.8" fill={INK} /></> },
  { key: 'fish', label: 'Fish', bg: '#dce9ec', art: <><path d="M44 32l12-9v18z" fill="#e3874f" /><ellipse cx="30" cy="32" rx="18" ry="12" fill="#ec9a5c" /><path d="M26 22q4 10 0 20" stroke="#d2753d" strokeWidth="2" fill="none" /><circle cx="18" cy="30" r="2.4" fill={INK} /></> },
  { key: 'sloth', label: 'Sloth', bg: '#e8e2d6', art: <>{head('#a99278', 18)}<ellipse cx="32" cy="35" rx="13" ry="11" fill="#e6d8c2" /><ellipse cx="25" cy="33" rx="5" ry="3.5" fill="#7c664f" transform="rotate(20 25 33)" /><ellipse cx="39" cy="33" rx="5" ry="3.5" fill="#7c664f" transform="rotate(-20 39 33)" /><circle cx="25" cy="33" r="1.6" fill={INK} /><circle cx="39" cy="33" r="1.6" fill={INK} />{smile(40, 3)}</> },
  { key: 'pig', label: 'Pig', bg: '#f3e3e3', art: <><path d="M18 24l2-9 8 6M46 24l-2-9-8 6" fill="#e8a5aa" />{head('#f0b8bc')}<ellipse cx="32" cy="38" rx="7" ry="5" fill="#e597a0" /><circle cx="29.5" cy="38" r="1.4" fill="#b8606b" /><circle cx="34.5" cy="38" r="1.4" fill="#b8606b" />{eyes(30, 7)}</> },
  { key: 'cow', label: 'Cow', bg: '#e9ece6', art: <><path d="M18 20q-6-2-6-8M46 20q6-2 6-8" stroke="#c9b89a" strokeWidth="3" fill="none" strokeLinecap="round" />{head('#fafaf8')}<path d="M20 22q6 0 6 8q-6 2-9-4z" fill={INK} /><ellipse cx="32" cy="41" rx="9" ry="6" fill="#efc7c3" />{eyes(31, 7)}</> },
  { key: 'monkey', label: 'Monkey', bg: '#efe3d6', art: <><circle cx="15" cy="34" r="6" fill="#d7b48f" /><circle cx="49" cy="34" r="6" fill="#d7b48f" />{head('#8a6243')}<path d="M20 36q0-12 12-10q12-2 12 10q0 12-12 12t-12-12z" fill="#e4c49f" />{eyes(32, 5)}{smile(40, 3)}</> },
  { key: 'elephant', label: 'Elephant', bg: '#e3e5ea', art: <><ellipse cx="16" cy="32" rx="9" ry="12" fill="#a7adb8" /><ellipse cx="48" cy="32" rx="9" ry="12" fill="#a7adb8" />{head('#b9bfca', 15, 31)}<path d="M29 38q0 12 6 14q3 0 2-3q-4-2-4-11z" fill="#b9bfca" />{eyes(29, 6)}</> },
  { key: 'giraffe', label: 'Giraffe', bg: '#f4ead2', art: <><path d="M26 18v-6M38 18v-6" stroke="#b8833f" strokeWidth="2.5" strokeLinecap="round" /><circle cx="26" cy="11" r="2.5" fill="#8a5f2c" /><circle cx="38" cy="11" r="2.5" fill="#8a5f2c" /><ellipse cx="32" cy="34" rx="13" ry="17" fill="#e6b45a" /><circle cx="25" cy="28" r="3" fill="#b8833f" /><circle cx="40" cy="38" r="3.5" fill="#b8833f" /><ellipse cx="32" cy="44" rx="8" ry="6" fill="#f0cf8f" />{eyes(31, 5.5)}</> },
  { key: 'zebra', label: 'Zebra', bg: '#e9e9e6', art: <><ellipse cx="32" cy="34" rx="14" ry="18" fill="#fafaf8" /><path d="M20 26h8M19 33h9M20 40h7M44 26h-8M45 33h-9M44 40h-7" stroke={INK} strokeWidth="2.5" strokeLinecap="round" /><path d="M26 16q6-6 12 0" stroke={INK} strokeWidth="4" fill="none" />{eyes(30, 5)}<ellipse cx="32" cy="46" rx="7" ry="5" fill="#4b4b49" /></> },
  { key: 'raccoon', label: 'Raccoon', bg: '#e6e5e2', art: <><path d="M17 25l3-11 8 7M47 25l-3-11-8 7" fill="#7a7672" />{head('#9a958f')}<path d="M16 32q8-8 16-2q8-6 16 2q-8 6-16 2q-8 4-16-2z" fill="#3a3836" /><circle cx="25" cy="32" r="2" fill={W} /><circle cx="39" cy="32" r="2" fill={W} /><ellipse cx="32" cy="41" rx="6" ry="4" fill="#e9e6e2" /><circle cx="32" cy="40" r="1.8" fill={INK} /></> },
  { key: 'seal', label: 'Seal', bg: '#dee7ee', art: <>{head('#9fb1c0', 18)}<ellipse cx="32" cy="40" rx="8" ry="5.5" fill="#c9d5df" />{eyes(31, 7, 2.8)}<ellipse cx="32" cy="38" rx="2.5" ry="1.8" fill={INK} /><path d="M24 41h-8M24 43l-7 2M40 41h8M40 43l7 2" stroke="#5f6f7c" strokeWidth="1.2" strokeLinecap="round" /></> },
  { key: 'chick', label: 'Chick', bg: '#f6f0d6', art: <><path d="M28 18q4-6 8 0" stroke="#e2b93f" strokeWidth="3" fill="none" strokeLinecap="round" />{head('#f1cf55', 17)}{eyes(32, 6)}<path d="M28 37h8l-4 4z" fill="#e88a3a" />{cheeks(39, 11, '#f0a07a')}</> },
  { key: 'tiger', label: 'Tiger', bg: '#f5e6d3', art: <><circle cx="19" cy="21" r="5.5" fill="#e08a3c" /><circle cx="45" cy="21" r="5.5" fill="#e08a3c" />{head('#e8954a')}<path d="M32 18v6M24 20l2 5M40 20l-2 5M15 33h6M15 38h5M49 33h-6M49 38h-5" stroke={INK} strokeWidth="2.2" strokeLinecap="round" /><ellipse cx="32" cy="40" rx="8" ry="6" fill="#faf3ea" />{eyes(31, 7)}<path d="M30 38h4l-2 2z" fill={INK} /></> },
  // Nature
  { key: 'cactus', label: 'Cactus', bg: '#e6ecdc', art: <><path d="M24 54h16l-2-8H26z" fill="#c9805a" /><rect x="27" y="14" width="10" height="34" rx="5" fill="#76a865" /><path d="M27 34h-5a4 4 0 0 1-4-4v-6a2.5 2.5 0 0 1 5 0v5h4M37 30h5v-6a2.5 2.5 0 0 1 5 0v6a4 4 0 0 1-4 4h-6" fill="#76a865" /><circle cx="32" cy="11" r="3" fill="#e88aa0" /></> },
  { key: 'mushroom', label: 'Mushroom', bg: '#f0e4e0', art: <><path d="M26 34h12l2 18H24z" fill="#f2e6d6" /><path d="M12 36q0-20 20-20t20 20z" fill="#c95a4c" /><circle cx="24" cy="26" r="3" fill={W} /><circle cx="38" cy="24" r="2.5" fill={W} /><circle cx="44" cy="32" r="2" fill={W} /><circle cx="18" cy="33" r="2" fill={W} /></> },
  { key: 'moon', label: 'Moon', bg: '#2f3a52', art: <><path d="M40 14a18 18 0 1 0 8 30a15 15 0 1 1-8-30z" fill="#f3e2a6" /><circle cx="16" cy="18" r="1.4" fill="#f3e2a6" /><circle cx="48" cy="12" r="1" fill="#f3e2a6" /><circle cx="50" cy="50" r="1.2" fill="#f3e2a6" /></> },
  { key: 'sun', label: 'Sun', bg: '#f7ecd0', art: <><g stroke="#e8a93a" strokeWidth="3" strokeLinecap="round"><path d="M32 6v7M32 51v7M6 32h7M51 32h7M13 13l5 5M46 46l5 5M13 51l5-5M46 18l5-5" /></g><circle cx="32" cy="32" r="13" fill="#f0bd4c" />{eyes(30, 5, 1.8)}{smile(35, 4)}</> },
  { key: 'planet', label: 'Planet', bg: '#e6e1f0', art: <><circle cx="32" cy="32" r="14" fill="#9c86c4" /><ellipse cx="32" cy="32" rx="24" ry="7" fill="none" stroke="#e3b65d" strokeWidth="3" transform="rotate(-18 32 32)" /><path d="M20 26q12-6 24 0" stroke="#b7a4d8" strokeWidth="3" fill="none" /></> },
  { key: 'mountain', label: 'Mountain', bg: '#e2e9ef', art: <><path d="M6 52l18-28 10 14 8-10 16 24z" fill="#6f879b" /><path d="M24 24l6 9-3-1-3 3-3-3-3 1z" fill={W} /><circle cx="46" cy="16" r="5" fill="#f0c96a" /></> },
  { key: 'tree', label: 'Tree', bg: '#e3ecdf', art: <><rect x="29" y="36" width="6" height="18" rx="2" fill="#8a6447" /><circle cx="32" cy="26" r="15" fill="#6b9e5c" /><circle cx="22" cy="32" r="8" fill="#5e8f50" /><circle cx="42" cy="31" r="8" fill="#7aad68" /></> },
  { key: 'flower', label: 'Flower', bg: '#f3e4ea', art: <><path d="M32 40v16M32 50q-8-2-10-8q8 0 10 6" stroke="#6b9e5c" strokeWidth="3" fill="#6b9e5c" strokeLinecap="round" />{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="32" cy="18" rx="6" ry="9" fill="#e7849c" transform={`rotate(${a} 32 28)`} />)}<circle cx="32" cy="28" r="6" fill="#f2c94c" /></> },
  { key: 'leaf', label: 'Leaf', bg: '#e1ece2', art: <><path d="M14 50Q12 16 50 12q2 36-36 38z" fill="#79ad6c" /><path d="M14 50L42 22M24 40h8M30 34v-8" stroke="#5a8c4f" strokeWidth="2" strokeLinecap="round" /></> },
  { key: 'wave', label: 'Wave', bg: '#dceaf0', art: <><path d="M6 40q8-14 18-6t18-4q10-8 16 4v18H6z" fill="#5f9eb8" /><path d="M6 46q8-6 16-2t18-2q10-4 18 2v14H6z" fill="#87bdd2" /><circle cx="46" cy="18" r="5" fill="#f2c96a" /></> },
  { key: 'cloud', label: 'Cloud', bg: '#dfe7f2', art: <><path d="M18 44a9 9 0 0 1 1-18a12 12 0 0 1 23-2a9 9 0 0 1 4 20z" fill={W} />{eyes(34, 6, 1.8)}{smile(38, 3)}</> },
  { key: 'rainbow', label: 'Rainbow', bg: '#f1eadf', art: <>{['#d9765f', '#e6ae55', '#86b36f', '#6b9cc4'].map((c, i) => <path key={c} d={`M${10 + i * 5} 46a${22 - i * 5} ${22 - i * 5} 0 0 1 ${44 - i * 10} 0`} fill="none" stroke={c} strokeWidth="5" />)}</> },
  { key: 'star', label: 'Star', bg: '#f4edd6', art: <><path d="M32 10l6.5 13.5 14.5 2-10.5 10 2.6 14.5L32 43l-13.1 7 2.6-14.5-10.5-10 14.5-2z" fill="#f0c24c" strokeLinejoin="round" />{eyes(30, 4.5, 1.6)}{smile(34, 2.5)}</> },
  // Things
  { key: 'rocket', label: 'Rocket', bg: '#e4e6ee', art: <><path d="M32 8q12 10 10 30H22Q20 18 32 8z" fill="#f2f2f0" /><circle cx="32" cy="24" r="4.5" fill="#6b9cc4" /><path d="M22 30l-6 10 7-2zM42 30l6 10-7-2z" fill="#d9765f" /><path d="M27 40l5 12 5-12z" fill="#e8a93a" /></> },
  { key: 'balloon', label: 'Balloon', bg: '#f2e2e2', art: <><path d="M32 44q-2 6 2 12" stroke="#8a8a87" strokeWidth="1.5" fill="none" /><ellipse cx="32" cy="27" rx="14" ry="17" fill="#d9665f" /><path d="M30 44h4l-2-3z" fill="#c4554f" /><ellipse cx="26" cy="20" rx="3" ry="5" fill="#ec948d" /></> },
  { key: 'kite', label: 'Kite', bg: '#e5ecf2', art: <><path d="M32 8l14 18-14 20-14-20z" fill="#e6ae55" /><path d="M32 8v38M18 26h28" stroke="#c98a2f" strokeWidth="1.5" /><path d="M32 46q-4 4 0 8t0 6" stroke="#8a8a87" strokeWidth="1.5" fill="none" /><path d="M30 52l-4 1 2 2zM33 58l4-1-2 3z" fill="#d9765f" /></> },
  { key: 'teacup', label: 'Teacup', bg: '#efe6dc', art: <><path d="M14 28h30v8a15 15 0 0 1-30 0z" fill="#f7f4ee" /><path d="M44 30h4a5 5 0 0 1 0 10h-5" fill="none" stroke="#f7f4ee" strokeWidth="3.5" /><ellipse cx="29" cy="28" rx="15" ry="3" fill="#c9895a" /><path d="M10 52h38" stroke="#d9c6b0" strokeWidth="4" strokeLinecap="round" /><path d="M24 20q-2-4 1-8M32 20q-2-4 1-8" stroke="#bfb3a6" strokeWidth="2" fill="none" strokeLinecap="round" /></> },
  { key: 'book', label: 'Book', bg: '#e8e4ee', art: <><path d="M10 18q11-3 22 3q11-6 22-3v30q-11-3-22 3q-11-6-22-3z" fill="#7b6aa6" /><path d="M13 20q9-2 18 3v27q-9-5-18-3zM51 20q-9-2-18 3v27q9-5 18-3z" fill="#f7f4ee" /><path d="M17 27h9M17 32h9M38 27h9M38 32h9" stroke="#cfc6dd" strokeWidth="2" strokeLinecap="round" /></> },
  { key: 'guitar', label: 'Guitar', bg: '#f1e5d8', art: <><path d="M41 9l6 6-14 14" stroke="#7d5a3e" strokeWidth="4" strokeLinecap="round" /><circle cx="24" cy="40" r="11" fill="#c98a4c" /><circle cx="31" cy="31" r="8" fill="#c98a4c" /><circle cx="26" cy="38" r="3.5" fill="#5a3f2b" /><path d="M19 45l6-6" stroke="#5a3f2b" strokeWidth="2" /></> },
  { key: 'camera', label: 'Camera', bg: '#e4e7ea', art: <><rect x="10" y="22" width="44" height="28" rx="5" fill="#4b5560" /><path d="M24 22l3-6h10l3 6z" fill="#4b5560" /><circle cx="32" cy="36" r="9" fill="#dfe6ee" /><circle cx="32" cy="36" r="5" fill="#6b8aa8" /><circle cx="46" cy="28" r="2" fill="#e8a93a" /></> },
  { key: 'paperplane', label: 'Paper plane', bg: '#dfe9f0', art: <><path d="M8 32l46-18-12 36-10-12z" fill="#fafaf8" /><path d="M32 38l22-24-28 20z" fill="#d8e2ea" /><path d="M8 52q6-2 10-8" stroke="#9fb3c4" strokeWidth="1.5" strokeDasharray="3 3" fill="none" /></> },
  { key: 'pizza', label: 'Pizza', bg: '#f3e6d6', art: <><path d="M12 16q20-8 40 0L32 56z" fill="#f0c766" /><path d="M12 16q20-8 40 0l-2 5q-18-7-36 0z" fill="#d9a050" /><circle cx="30" cy="26" r="3.5" fill="#d1584a" /><circle cx="38" cy="34" r="3" fill="#d1584a" /><circle cx="28" cy="40" r="2.5" fill="#d1584a" /></> },
  { key: 'icecream', label: 'Ice cream', bg: '#f2e3e8', art: <><path d="M22 32h20l-10 24z" fill="#dca96a" /><path d="M24 36l14 6M28 46l8-6" stroke="#c48f52" strokeWidth="1.5" /><circle cx="32" cy="24" r="11" fill="#f1b7c4" /><circle cx="25" cy="30" r="6" fill="#f6d9a8" /><circle cx="39" cy="30" r="6" fill="#bfe0d0" /><circle cx="32" cy="12" r="3" fill="#d9665f" /></> },
  { key: 'anchor', label: 'Anchor', bg: '#dee6ee', art: <><circle cx="32" cy="14" r="4.5" fill="none" stroke="#3f5a74" strokeWidth="3" /><path d="M32 19v32M22 26h20M14 38q2 14 18 14t18-14" stroke="#3f5a74" strokeWidth="3.5" fill="none" strokeLinecap="round" /><path d="M10 40l4-4 4 4M46 40l4-4 4 4" stroke="#3f5a74" strokeWidth="3" fill="none" strokeLinecap="round" /></> },
  { key: 'lighthouse', label: 'Lighthouse', bg: '#e1e8ef', art: <><path d="M26 54l3-34h6l3 34z" fill="#f4f3ef" /><path d="M27.5 36h9M26.8 46h10.4" stroke="#c9574d" strokeWidth="5" /><rect x="27" y="14" width="10" height="7" fill="#f0c24c" /><path d="M25 14l7-6 7 6z" fill="#c9574d" /><path d="M37 17l14-5v10zM27 17l-14-5v10z" fill="#f6e2a3" opacity="0.7" /></> },
  { key: 'compass', label: 'Compass', bg: '#ece6dc', art: <><circle cx="32" cy="32" r="20" fill="#f7f3ec" stroke="#b88b55" strokeWidth="3" /><path d="M32 16l5 16h-10z" fill="#c9574d" /><path d="M32 48l5-16h-10z" fill="#5f6f7c" /><circle cx="32" cy="32" r="2.5" fill={INK} /></> },
  { key: 'crown', label: 'Crown', bg: '#f4ecd5', art: <><path d="M12 24l10 10 10-16 10 16 10-10-4 24H16z" fill="#e8b84a" /><rect x="16" y="46" width="32" height="5" rx="2" fill="#d09a2f" /><circle cx="32" cy="38" r="3" fill="#c9574d" /><circle cx="22" cy="40" r="2" fill="#6b9cc4" /><circle cx="42" cy="40" r="2" fill="#6b9cc4" /></> },
];

export const avatarByKey = (k?: string) => AVATARS.find((a) => a.key === k);

export function Avatar({ k, name, size = 32, className = '' }: { k?: string; name?: string; size?: number; className?: string }) {
  if (k?.startsWith('photo:')) return <Photo uid={k.slice(6)} size={size} className={className} />;
  const a = avatarByKey(k);
  if (!a)
    return (
      <span className={'avatar-fallback ' + className} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.34) }} aria-hidden="true">
        {(name ?? '?')
          .split(' ')
          .map((w) => w[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()}
      </span>
    );
  return (
    <svg className={'avatar-pic ' + className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={a.label}>
      <defs>
        <clipPath id={'av-' + a.key}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#av-${a.key})`}>
        <rect width="64" height="64" fill={a.bg} />
        {a.art}
      </g>
    </svg>
  );
}
