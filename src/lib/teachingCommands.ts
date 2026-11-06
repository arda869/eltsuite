// The visible teaching controls and the keyboard guide use the same command names.
export const ANSWER_COMMANDS = {
  next: { key: 'R', label: 'Next answer', description: 'Reveal the next answer' },
  all: { key: 'Shift+R', label: 'All answers', description: 'Reveal all answers' },
  hide: { key: 'H', label: 'Hide answers', description: 'Hide all revealed answers' },
} as const;
