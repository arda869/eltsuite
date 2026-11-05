import type { DragEvent } from 'react';
import type { El } from './model';

// Dragging from the drawers onto the page. The browser's dataTransfer only carries text, so the
// payload lives here for the length of the drag, and the dataTransfer carries a marker type the
// stage recognises on dragover.

export const MIME = 'application/x-eltsuite-design';

export type Payload =
  | { kind: 'el'; el: Partial<El>; name: string } // a person, thing or shape from the library, ready to place
  | { kind: 'scene'; key: string; name: string } // a backdrop for the page
  | { kind: 'url'; url: string | (() => Promise<string>); name: string; credit?: string; w?: number; h?: number } // a picture on the web (Wikimedia, a file in the archive); the address may be looked up at drop time
  | { kind: 'media'; id: string; name: string; w?: number; h?: number; img: string } // a picture already in this file's media
  | { kind: 'blob'; blob: Blob; name: string; w?: number; h?: number } // a picture in memory (an AI result)
  | { kind: 'char'; id: string; name: string; src: string; w?: number; h?: number }; // a saved character, as its reference or a variant

let current: Payload | null = null;
export const dragging = () => current;

// Call from a tile's onDragStart. `ghost` is the picture under the pointer (the tile itself works).
export function startDrag(e: DragEvent, p: Payload, ghost?: Element | null) {
  current = p;
  e.dataTransfer.effectAllowed = 'copy';
  try {
    e.dataTransfer.setData(MIME, p.kind);
    e.dataTransfer.setData('text/plain', p.name);
  } catch {
    // Some browsers refuse custom types; the module payload still works.
  }
  const g = ghost ?? (e.currentTarget as HTMLElement);
  if (g) {
    const r = g.getBoundingClientRect();
    e.dataTransfer.setDragImage(g, Math.min(r.width / 2, e.clientX - r.left), Math.min(r.height / 2, e.clientY - r.top));
  }
  // Cleared after the drop has been handled (the stage reads the payload in its own drop handler),
  // and after a cancelled drag.
  const end = () => {
    window.removeEventListener('dragend', end);
    window.removeEventListener('drop', end);
    setTimeout(() => {
      if (current === p) current = null;
    }, 0);
  };
  window.addEventListener('dragend', end);
  window.addEventListener('drop', end);
}

export const isOurs = (e: DragEvent) => e.dataTransfer.types.includes(MIME) || current !== null;
