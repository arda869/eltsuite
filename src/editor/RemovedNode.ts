import { Node } from '@tiptap/core';

// Elements that ELT Suite no longer has (storyboards). A lesson saved with one still opens: the
// element is kept as it was, shows nothing and prints nothing, until the clean-up job
// (scripts/remove-slides-storyboards.mjs) takes it out.
export const RemovedStoryboard = Node.create({
  name: 'storyboard',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes: () => ({ snap: { default: null }, cols: { default: 2 }, docId: { default: null }, caption: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-storyboard]' }],
  renderHTML: () => ['div', { 'data-storyboard': '', hidden: 'hidden' }],
});
