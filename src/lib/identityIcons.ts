// Icons for activity identities ("Activation", "Pronunciation" and so on).
// Each is the inside of a 24 × 24 SVG drawn with rounded 1.8 strokes in the current colour, so the
// same string works on screen (React) and on paper (worksheetHtml). Keep them simple, accurate and
// readable at 10–12 px: they sit inline in a sentence at the size of a question number.

export type IdentityIcon = { key: string; label: string; group: string; words: string; svg: string };

const dot = (x: number, y: number, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

export const IDENTITY_ICONS: IdentityIcon[] = [
  // Lesson stages
  { key: 'activation', label: 'Activation', group: 'Lesson stages', words: 'warm up start spark lightning energy lead in', svg: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>' },
  { key: 'warmer', label: 'Warmer', group: 'Lesson stages', words: 'warm up sun start morning', svg: `<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>` },
  { key: 'leadin', label: 'Lead-in', group: 'Lesson stages', words: 'lead in door enter start begin', svg: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M4 12h11M11 8l4 4-4 4"/>' },
  { key: 'presentation', label: 'Presentation', group: 'Lesson stages', words: 'present board teach explain easel', svg: '<rect x="3.5" y="4" width="17" height="11" rx="1.5"/><path d="M12 15v3M8 21l4-3 4 3M7 8h6M7 11h9"/>' },
  { key: 'practice', label: 'Practice', group: 'Lesson stages', words: 'practise repeat loop cycle drill', svg: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>' },
  { key: 'production', label: 'Production', group: 'Lesson stages', words: 'produce freer use rocket launch', svg: '<path d="M12 3c3 2.2 4.5 5.4 4.5 9.2V16h-9v-3.8C7.5 8.4 9 5.2 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M7.5 13.5 5 16v3l2.5-1.5M16.5 13.5 19 16v3l-2.5-1.5M10.5 19.5 12 21.5l1.5-2"/>' },
  { key: 'review', label: 'Review', group: 'Lesson stages', words: 'review revise recap look back rewind history', svg: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/><path d="M12 8v4.5l3 1.8"/>' },
  { key: 'cooler', label: 'Cooler', group: 'Lesson stages', words: 'cool down end finish snowflake calm', svg: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5M3.8 10.6 6.3 12l-.1-2.9M20.2 13.4 17.7 12l.1 2.9M3.8 13.4 6.3 12l-.1 2.9M20.2 10.6 17.7 12l.1-2.9"/>' },
  { key: 'homework', label: 'Homework', group: 'Lesson stages', words: 'homework home study after class', svg: '<rect x="4" y="3.5" width="12" height="17" rx="1.5"/><path d="M7 8h6M7 11.5h4"/><path d="m20.5 9-6.5 6.5-2.5.8.8-2.5L18.8 7.3z"/>' },
  { key: 'extension', label: 'Extension', group: 'Lesson stages', words: 'extension extra more plus fast finishers', svg: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>' },
  { key: 'challenge', label: 'Challenge', group: 'Lesson stages', words: 'challenge mountain peak hard climb', svg: '<path d="M2.5 20 9 8.5l3.5 6 2.5-4 6.5 9.5z"/><path d="M9 8.5V3.5h4l-1 1.5 1 1.5H9"/>' },
  { key: 'reflection', label: 'Reflection', group: 'Lesson stages', words: 'reflect think mirror self assess', svg: '<ellipse cx="12" cy="10" rx="6" ry="7"/><path d="M12 17v4M8.5 21h7M9.5 7.5a3 3 0 0 1 2.5-1.5"/>' },
  { key: 'checkpoint', label: 'Checkpoint', group: 'Lesson stages', words: 'check point progress milestone flag', svg: '<path d="M5.5 21V3.5"/><path d="M5.5 4h12l-2.5 4 2.5 4h-12"/>' },
  { key: 'test', label: 'Test', group: 'Lesson stages', words: 'test exam quiz assessment clipboard', svg: '<rect x="5" y="4.5" width="14" height="16.5" rx="1.8"/><path d="M9 3h6v3H9z"/><path d="m8.5 12 1.5 1.5 2.5-3M14 12h2M8.5 17h7.5"/>' },
  { key: 'project', label: 'Project', group: 'Lesson stages', words: 'project folder task portfolio', svg: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z"/>' },

  // Skills
  { key: 'reading', label: 'Reading', group: 'Skills', words: 'read book text open', svg: '<path d="M12 6.5C10 5 7.5 4.5 4 4.8v13c3.5-.3 6 .2 8 1.7 2-1.5 4.5-2 8-1.7v-13c-3.5-.3-6 .2-8 1.7z"/><path d="M12 6.5v13"/>' },
  { key: 'listening', label: 'Listening', group: 'Skills', words: 'listen headphones audio hear', svg: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.5" y="13.5" width="4" height="6.5" rx="1.5"/><rect x="16.5" y="13.5" width="4" height="6.5" rx="1.5"/>' },
  { key: 'speaking', label: 'Speaking', group: 'Skills', words: 'speak talk speech bubble say', svg: '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-7l-4.5 4v-4H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5z"/>' },
  { key: 'writing', label: 'Writing', group: 'Skills', words: 'write pencil pen draft', svg: '<path d="M15.5 4.5l4 4L9 19l-4.8.8L5 15z"/><path d="M13.5 6.5l4 4"/>' },
  { key: 'ear', label: 'Ear', group: 'Skills', words: 'ear hear sound listen', svg: '<path d="M7 9a5 5 0 0 1 10 0c0 3-2.5 4-3.2 6-.5 1.6-.8 3.5-3 4.3-1.6.6-3-.3-3.3-1.5"/><path d="M10 9.5a2 2 0 0 1 4 0c0 1.3-1.5 1.7-1.5 3"/>' },
  { key: 'mouth', label: 'Mouth', group: 'Skills', words: 'mouth lips say pronounce', svg: '<path d="M3 12c3-4 6-4.5 9-3 3-1.5 6-1 9 3-3 4.5-6 5.5-9 5.5S6 16.5 3 12z"/><path d="M3 12h18"/>' },
  { key: 'eye', label: 'Look', group: 'Skills', words: 'eye look watch see observe', svg: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>' },
  { key: 'keyboard', label: 'Typing', group: 'Skills', words: 'type keyboard computer write', svg: `<rect x="2.5" y="6" width="19" height="12" rx="2"/>${dot(6.5, 10, .9)}${dot(10, 10, .9)}${dot(13.5, 10, .9)}${dot(17, 10, .9)}<path d="M7.5 14.5h9"/>` },
  { key: 'notes', label: 'Note-taking', group: 'Skills', words: 'notes notebook spiral jot', svg: '<rect x="5.5" y="3.5" width="14" height="17" rx="1.5"/><path d="M3.5 7h3M3.5 12h3M3.5 17h3M10 8h6M10 12h6M10 16h4"/>' },

  // Language
  { key: 'pronunciation', label: 'Pronunciation', group: 'Language', words: 'pronunciation sound wave voice phonemes', svg: '<path d="M3 12h2M7 8v8M11 4.5v15M15 8v8M19 10.5v3M21 12h0"/>' },
  { key: 'grammar', label: 'Grammar', group: 'Language', words: 'grammar rules structure blocks', svg: '<rect x="3.5" y="13" width="7.5" height="7" rx="1"/><rect x="13" y="13" width="7.5" height="7" rx="1"/><rect x="8.2" y="4" width="7.5" height="7" rx="1"/>' },
  { key: 'vocabulary', label: 'Vocabulary', group: 'Language', words: 'vocabulary words lexis abc', svg: '<path d="M3 17.5 6.5 7l3.5 10.5M4.2 14h4.6"/><path d="M12.5 7h3.2a2.5 2.5 0 0 1 0 5h-3.2zM12.5 12h3.8a2.75 2.75 0 0 1 0 5.5h-3.8z"/>' },
  { key: 'spelling', label: 'Spelling', group: 'Language', words: 'spelling letters abc tiles', svg: '<rect x="2.5" y="8" width="5.5" height="7" rx="1"/><rect x="9.25" y="8" width="5.5" height="7" rx="1"/><rect x="16" y="8" width="5.5" height="7" rx="1"/><path d="M4 13l1.25-3.2 1.25 3.2M11 9.8v3.4h1.3a.85.85 0 0 0 0-1.7H11M19.9 10.2a1.5 1.5 0 1 0 0 2.6"/>' },
  { key: 'stress', label: 'Word stress', group: 'Language', words: 'stress syllable dots big small', svg: `${dot(5, 14, 1.4)}<circle cx="12" cy="12.5" r="3.5"/>${dot(19, 14, 1.4)}` },
  { key: 'intonation', label: 'Intonation', group: 'Language', words: 'intonation rise fall tune voice arrow', svg: '<path d="M3 15c2.5 0 3.5-6 6.5-6s3.5 7 6.5 7c1.8 0 2.8-2.2 3.5-4.5"/><path d="m17.5 11.5 2-0.3.7 2"/>' },
  { key: 'phonetics', label: 'Phonetics', group: 'Language', words: 'phonetics ipa symbol slash schwa', svg: '<path d="M7 4 4 20M20 4l-3 16"/><path d="M9.5 11.5a3 3 0 1 1 5.6 1.5c-.6 2.6-2.5 3.7-4.6 3.2M9.8 13h5.4"/>' },
  { key: 'collocation', label: 'Collocation', group: 'Language', words: 'collocation link chain pair together', svg: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' },
  { key: 'functions', label: 'Functional language', group: 'Language', words: 'functional language phrases toolbox handy', svg: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/><path d="M3.5 7.5h6M3.5 11h3.5M3.5 14.5h2"/>' },
  { key: 'tenses', label: 'Tenses', group: 'Language', words: 'tenses time line past present future', svg: `<path d="M2.5 12h19M18.5 9l3 3-3 3"/>${dot(6, 12, 1.4)}${dot(12, 12, 1.4)}<path d="M12 6v3M6 15v3"/>` },
  { key: 'translation', label: 'Translation', group: 'Language', words: 'translation mediation language swap', svg: '<path d="M3.5 5h8M7.5 3.5V5M5 5c.6 3 2.6 5.3 5.5 6.5M10 5c-.5 3.2-2.4 5.7-6 7"/><path d="m12.5 20.5 4-9 4 9M13.8 17.5h5.4"/>' },
  { key: 'dictionary', label: 'Dictionary', group: 'Language', words: 'dictionary look up definition book', svg: '<path d="M5.5 4.5A1.5 1.5 0 0 1 7 3h12v15H7a1.5 1.5 0 0 0-1.5 1.5z"/><path d="M5.5 19.5A1.5 1.5 0 0 0 7 21h12v-3"/><path d="m10 13 2-5.5 2 5.5M10.7 11.2h2.6"/>' },
  { key: 'quote', label: 'Useful phrases', group: 'Language', words: 'quote phrases expression say chunk', svg: '<path d="M5 17.5c2.5-1 3.5-3 3.5-5.5H5V6.5h5.5V12c0 3.5-2 6-5.5 7"/><path d="M13.5 17.5c2.5-1 3.5-3 3.5-5.5h-3.5V6.5H19V12c0 3.5-2 6-5.5 7"/>' },

  // Interaction
  { key: 'pairs', label: 'Pair work', group: 'Interaction', words: 'pair work two partner people', svg: '<circle cx="8.5" cy="8" r="2.8"/><circle cx="16" cy="9" r="2.4"/><path d="M3.5 19a5 5 0 0 1 10 0M13.8 15a4 4 0 0 1 6.7 3.5"/>' },
  { key: 'groups', label: 'Group work', group: 'Interaction', words: 'group team three people', svg: '<circle cx="12" cy="7.5" r="2.6"/><circle cx="5.8" cy="10" r="2"/><circle cx="18.2" cy="10" r="2"/><path d="M7.5 19a4.5 4.5 0 0 1 9 0M2.5 18a3.4 3.4 0 0 1 4.7-3.1M21.5 18a3.4 3.4 0 0 0-4.7-3.1"/>' },
  { key: 'individual', label: 'On your own', group: 'Interaction', words: 'individual alone single person self', svg: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>' },
  { key: 'wholeclass', label: 'Whole class', group: 'Interaction', words: 'whole class everyone circle all', svg: `<circle cx="12" cy="12" r="7.5" stroke-dasharray="2 3"/>${dot(12, 4.5, 1.6)}${dot(19.5, 12, 1.6)}${dot(12, 19.5, 1.6)}${dot(4.5, 12, 1.6)}` },
  { key: 'mingle', label: 'Mingle', group: 'Interaction', words: 'mingle walk around move find someone', svg: '<circle cx="7" cy="6" r="2"/><circle cx="17" cy="6" r="2"/><path d="M7 8.5v5l-2 6M7 13.5l2 6M17 8.5v5l2 6M17 13.5l-2 6M4 11l3-2 3 2M14 11l3-2 3 2"/>' },
  { key: 'roleplay', label: 'Role-play', group: 'Interaction', words: 'role play drama theatre masks act', svg: '<path d="M3 4.5h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M5.5 8h1M8.5 8h1M5.8 11.5a1.8 1.8 0 0 0 3.4 0"/><path d="M12 9.5h9V15a4.5 4.5 0 0 1-9 0"/><path d="M14.5 13h1M17.5 13h1M14.8 17a1.8 1.8 0 0 1 3.4 0"/>' },
  { key: 'infogap', label: 'Information gap', group: 'Interaction', words: 'information gap split half cards A B', svg: '<rect x="2.5" y="5" width="8" height="14" rx="1.5"/><rect x="13.5" y="5" width="8" height="14" rx="1.5"/><path d="M5 9h3M5 12h3M16 12h3M16 15h3"/>' },
  { key: 'discussion', label: 'Discussion', group: 'Interaction', words: 'discussion debate chat bubbles conversation', svg: '<path d="M3.5 5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5V13H3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M14.5 9h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H19v2.5L16 17h-5.5a1 1 0 0 1-1-1v-3"/>' },
  { key: 'debate', label: 'Debate', group: 'Interaction', words: 'debate argue opinion scales balance for against', svg: '<path d="M12 3.5v17M8 20.5h8M4.5 7h15"/><path d="M4.5 7 2 13a2.5 2.5 0 0 0 5 0zM19.5 7 17 13a2.5 2.5 0 0 0 5 0z"/>' },
  { key: 'interview', label: 'Interview', group: 'Interaction', words: 'interview microphone ask question', svg: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>' },
  { key: 'survey', label: 'Survey', group: 'Interaction', words: 'survey poll questionnaire ask chart', svg: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>' },
  { key: 'feedback', label: 'Feedback', group: 'Interaction', words: 'feedback comment response message', svg: '<path d="M4 4.5h16A1.5 1.5 0 0 1 21.5 6v9.5A1.5 1.5 0 0 1 20 17h-8.5L7 20.5V17H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z"/><path d="M7.5 9h9M7.5 12.5h6"/>' },
  { key: 'handshake', label: 'Agreement', group: 'Interaction', words: 'agree deal handshake negotiate', svg: '<path d="m11 7.5-2-2-6 6 2 2M13 7.5l2-2 6 6-2 2"/><path d="m5 13.5 4.5 4.5a1.4 1.4 0 0 0 2-2l1 1a1.4 1.4 0 0 0 2-2l.5.5a1.4 1.4 0 0 0 2-2L13 7.5h-2L8.5 10a1.4 1.4 0 0 0 2 2l1.5-1.5"/>' },

  // Thinking
  { key: 'idea', label: 'Idea', group: 'Thinking', words: 'idea light bulb think inspire', svg: '<path d="M9 17.5h6M10 20.5h4"/><path d="M8.5 14.5a5.5 5.5 0 1 1 7 0c-.8.7-1 1.4-1 3h-5c0-1.6-.2-2.3-1-3z"/>' },
  { key: 'brain', label: 'Think', group: 'Thinking', words: 'brain think mind memory critical thinking', svg: '<path d="M12 5.5V19M12 5.5A2.8 2.8 0 0 0 6.6 5a3 3 0 0 0-2.2 4.4A3.2 3.2 0 0 0 5 15a3 3 0 0 0 3.3 3.7A2.8 2.8 0 0 0 12 19M12 5.5A2.8 2.8 0 0 1 17.4 5a3 3 0 0 1 2.2 4.4A3.2 3.2 0 0 1 19 15a3 3 0 0 1-3.3 3.7A2.8 2.8 0 0 1 12 19"/><path d="M8.5 10.5c1 0 1.8.6 2 1.5M15.5 10.5c-1 0-1.8.6-2 1.5"/>' },
  { key: 'question', label: 'Question', group: 'Thinking', words: 'question ask why curious', svg: `<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7"/>${dot(12, 17, .95)}` },
  { key: 'search', label: 'Find out', group: 'Thinking', words: 'search find investigate magnifier research', svg: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>' },
  { key: 'puzzle', label: 'Puzzle', group: 'Thinking', words: 'puzzle solve problem jigsaw piece', svg: '<path d="M4 8h3.5a2 2 0 1 1 4 0H15v3.5a2 2 0 1 1 0 4V19h-3.5a2 2 0 1 0-4 0H4v-3.5a2 2 0 1 0 0-4z"/>' },
  { key: 'target', label: 'Goal', group: 'Thinking', words: 'goal target aim objective bullseye', svg: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>${dot(12, 12, 1.3)}` },
  { key: 'compass', label: 'Explore', group: 'Thinking', words: 'explore compass discover direction', svg: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>' },
  { key: 'sort', label: 'Sorting', group: 'Thinking', words: 'sort categorise classify order filter', svg: '<path d="M4 6h16M7 12h10M10 18h4"/>' },
  { key: 'ranking', label: 'Ranking', group: 'Thinking', words: 'rank order podium first second third', svg: '<path d="M9 20V8h6v12M3 20v-7h6M15 20v-9.5h6V20M2.5 20h19"/><path d="M12 5.5v-2"/>' },
  { key: 'compare', label: 'Compare', group: 'Thinking', words: 'compare contrast difference same arrows', svg: '<path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5M20 16H6M9.5 12.5 6 16l3.5 3.5"/>' },
  { key: 'predict', label: 'Predict', group: 'Thinking', words: 'predict guess crystal ball future', svg: '<circle cx="12" cy="10.5" r="6.5"/><path d="M7 20.5h10M8.5 16.5 7.5 20.5M15.5 16.5l1 4M9.5 8a3 3 0 0 1 2.5-1.5"/>' },
  { key: 'mindmap', label: 'Mind map', group: 'Thinking', words: 'mind map brainstorm ideas network', svg: '<circle cx="12" cy="12" r="2.8"/><circle cx="4.5" cy="5.5" r="2"/><circle cx="19.5" cy="5.5" r="2"/><circle cx="4.5" cy="18.5" r="2"/><circle cx="19.5" cy="18.5" r="2"/><path d="m6 7 4 3M18 7l-4 3M6 17l4-3M18 17l-4-3"/>' },
  { key: 'check', label: 'Check', group: 'Thinking', words: 'check tick correct done right', svg: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' },
  { key: 'lightning', label: 'Quick', group: 'Thinking', words: 'quick fast lightning speed snap', svg: '<path d="M4 6l7 6-7 6zM12.5 6l7 6-7 6z"/>' },

  // Games
  { key: 'game', label: 'Game', group: 'Games', words: 'game controller play fun', svg: `<path d="M7 7.5h10a4.5 4.5 0 0 1 4.3 5.8l-1 3.3a2.3 2.3 0 0 1-4 .8L15 16H9l-1.3 1.4a2.3 2.3 0 0 1-4-.8l-1-3.3A4.5 4.5 0 0 1 7 7.5z"/><path d="M7.5 10.5v3M6 12h3"/>${dot(15.5, 11, .95)}${dot(17.5, 13, .95)}` },
  { key: 'dice', label: 'Dice', group: 'Games', words: 'dice die random roll chance board game', svg: `<rect x="4" y="4" width="16" height="16" rx="3"/>${dot(8.5, 8.5, 1.2)}${dot(15.5, 8.5, 1.2)}${dot(12, 12, 1.2)}${dot(8.5, 15.5, 1.2)}${dot(15.5, 15.5, 1.2)}` },
  { key: 'cards', label: 'Cards', group: 'Games', words: 'cards deck pelmanism memory flashcards', svg: '<rect x="8" y="3.5" width="11" height="15" rx="1.6" transform="rotate(10 13.5 11)"/><rect x="4.5" y="5.5" width="11" height="15" rx="1.6"/><path d="m10 10.5 1.5 2-1.5 2-1.5-2z"/>' },
  { key: 'bingo', label: 'Bingo', group: 'Games', words: 'bingo grid card numbers', svg: `<rect x="3.5" y="3.5" width="17" height="17" rx="1.8"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>${dot(6.35, 6.35, 1.3)}${dot(12, 12, 1.3)}${dot(17.65, 17.65, 1.3)}` },
  { key: 'domino', label: 'Dominoes', group: 'Games', words: 'dominoes domino tile match', svg: `<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M7 12h10"/>${dot(10, 6, 1)}${dot(14, 8.5, 1)}${dot(12, 15.5, 1)}${dot(10, 18, 1)}${dot(14, 18, 1)}` },
  { key: 'timer', label: 'Timed', group: 'Games', words: 'timer stopwatch time limit race clock', svg: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5"/>' },
  { key: 'trophy', label: 'Competition', group: 'Games', words: 'trophy win competition prize cup', svg: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5M12 13v3.5M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5"/>' },
  { key: 'star', label: 'Star', group: 'Games', words: 'star favourite best award', svg: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z"/>' },
  { key: 'medal', label: 'Medal', group: 'Games', words: 'medal award winner prize', svg: '<path d="M8 3h3l1.5 5M16 3h-3l-1.5 5"/><circle cx="12" cy="14.5" r="5.5"/><path d="m12 12 .9 1.7 1.8.3-1.3 1.2.3 1.8-1.7-.9-1.7.9.3-1.8-1.3-1.2 1.8-.3z"/>' },
  { key: 'treasure', label: 'Treasure hunt', group: 'Games', words: 'treasure hunt map x marks quest', svg: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/><path d="m11 10 2.5 2.5M13.5 10 11 12.5"/>' },
  { key: 'buzzer', label: 'Quiz', group: 'Games', words: 'quiz buzzer bell answer fast', svg: '<path d="M4 17.5h16M6 17.5a6 6 0 0 1 12 0M12 11.5V9M10.5 9h3"/><path d="M5 5l1.8 1.8M19 5l-1.8 1.8M12 3v2"/>' },
  { key: 'taboo', label: 'Taboo', group: 'Games', words: 'taboo forbidden no not allowed', svg: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>' },
  { key: 'whisper', label: 'Secret', group: 'Games', words: 'secret whisper private hidden quiet', svg: '<path d="M3 12s3.5-6 9-6c1.8 0 3.3.6 4.6 1.4M21 12s-1.3 2.2-3.6 4M9.5 17.6c.8.3 1.6.4 2.5.4 5.5 0 9-6 9-6M4 20 20 4"/><path d="M9.4 14.2A3.5 3.5 0 0 1 14 9.6"/>' },

  // Media
  { key: 'video', label: 'Video', group: 'Media', words: 'video film watch play clip', svg: '<rect x="2.5" y="6" width="13.5" height="12" rx="2"/><path d="m16 10.5 5.5-3v9l-5.5-3z"/>' },
  { key: 'audio', label: 'Audio', group: 'Media', words: 'audio speaker sound volume recording', svg: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a7.5 7.5 0 0 1 0 11"/>' },
  { key: 'music', label: 'Song', group: 'Media', words: 'song music sing note', svg: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>' },
  { key: 'picture', label: 'Picture', group: 'Media', words: 'picture image photo describe', svg: `<rect x="3" y="4.5" width="18" height="15" rx="2"/>${dot(8.5, 9.5, 1.6)}<path d="m3.5 17 5-5 4 4 2.5-2.5 5.5 5.5"/>` },
  { key: 'camera', label: 'Photo', group: 'Media', words: 'camera photo take picture', svg: '<path d="M4 7.5h3l1.5-2.5h7L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5z"/><circle cx="12" cy="13" r="3.5"/>' },
  { key: 'podcast', label: 'Podcast', group: 'Media', words: 'podcast broadcast radio signal', svg: `${dot(12, 11, 1.8)}<path d="M8.5 14.5a5 5 0 1 1 7 0M5.8 17.2a8.8 8.8 0 1 1 12.4 0M12 14v7"/>` },
  { key: 'news', label: 'News', group: 'Media', words: 'news newspaper article journalism', svg: '<path d="M4 4.5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M17 8.5h3v10a2 2 0 0 1-2 2M7 8h7M7 11.5h7M7 15h4"/>' },
  { key: 'web', label: 'Online', group: 'Media', words: 'online web internet globe browser', svg: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>' },
  { key: 'phone', label: 'Phone', group: 'Media', words: 'phone mobile device text message', svg: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M10.5 18.5h3"/>' },
  { key: 'print', label: 'Print', group: 'Media', words: 'print paper photocopy worksheet', svg: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="7.5" rx="1.5"/><path d="M7 14h10v6.5H7z"/>' },
  { key: 'scissors', label: 'Cut out', group: 'Media', words: 'cut out scissors cards craft', svg: '<circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5"/><path d="M8 8l12 9M8 16 20 7"/>' },
  { key: 'board', label: 'Board', group: 'Media', words: 'whiteboard board class write', svg: '<rect x="3" y="4" width="18" height="12.5" rx="1.5"/><path d="M8 20.5 10 16.5M16 20.5l-2-4M7 8.5l3 3 2.5-2.5 4 4"/>' },

  // Topics
  { key: 'travel', label: 'Travel', group: 'Topics', words: 'travel plane holiday flight trip', svg: '<path d="M21 4.5 3.5 11l6 2.5 2.5 6 9-15zM9.5 13.5 21 4.5"/>' },
  { key: 'food', label: 'Food', group: 'Topics', words: 'food eat meal bowl cooking', svg: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M9 4c0 1.5 1 1.5 1 3M13 3.5c0 1.5 1 1.5 1 3"/>' },
  { key: 'coffee', label: 'Café', group: 'Topics', words: 'coffee café cup drink tea', svg: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M9 3.5c0 1.2 1 1.2 1 2.5M12.5 3.5c0 1.2 1 1.2 1 2.5"/>' },
  { key: 'shopping', label: 'Shopping', group: 'Topics', words: 'shopping bag buy money shop', svg: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>' },
  { key: 'money', label: 'Money', group: 'Topics', words: 'money price coin pay cost', svg: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 2 0 2.8 5 1.6 5 4.5 0 1.2-1 2-2.5 2A2.5 2 0 0 1 9.5 15M12 6v1.5M12 16v2"/>' },
  { key: 'work', label: 'Work', group: 'Topics', words: 'work job career business briefcase', svg: '<rect x="3" y="7.5" width="18" height="12.5" rx="1.8"/><path d="M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3 12.5h18"/>' },
  { key: 'health', label: 'Health', group: 'Topics', words: 'health doctor medicine cross hospital', svg: '<path d="M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z"/>' },
  { key: 'sport', label: 'Sport', group: 'Topics', words: 'sport football ball exercise', svg: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 3-1.5 4.5h-5L8 10.5z"/><path d="M12 7.5V3.2M16 10.5l4.3-1.3M14.5 15l2.6 3.6M9.5 15l-2.6 3.6M8 10.5 3.7 9.2"/>' },
  { key: 'nature', label: 'Nature', group: 'Topics', words: 'nature tree environment forest', svg: '<path d="M12 21v-6M12 15l-3-2.5M12 13.5l3-2.5"/><path d="M12 2.5c-3.5 2.5-6 6-6 9.5a6 6 0 0 0 12 0c0-3.5-2.5-7-6-9.5z"/>' },
  { key: 'leaf', label: 'Environment', group: 'Topics', words: 'environment leaf green planet ecology', svg: '<path d="M5 19c0-9 5.5-14 15-14 0 9.5-5 15-14 15"/><path d="M5 19 14 10"/>' },
  { key: 'weather', label: 'Weather', group: 'Topics', words: 'weather cloud sun rain forecast', svg: '<path d="M7.5 18.5a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .2 6.5z"/><path d="M5.5 5.5 6.5 6.8M10 3.5v1.6M3 9.5h1.5"/>' },
  { key: 'city', label: 'City', group: 'Topics', words: 'city town buildings place urban', svg: '<path d="M3 20.5h18M5 20.5V9h5v11.5M10 20.5V4h7v16.5M17 20.5v-8h3v8"/><path d="M12.5 7.5h2M12.5 10.5h2M12.5 13.5h2M7 12h1M7 15h1"/>' },
  { key: 'family', label: 'Family', group: 'Topics', words: 'family people parents children home', svg: '<circle cx="7.5" cy="6.5" r="2.3"/><circle cx="16.5" cy="6.5" r="2.3"/><circle cx="12" cy="13" r="1.8"/><path d="M3.5 20v-4.5a4 4 0 0 1 8 0M12.5 15.5a4 4 0 0 1 8 0V20M9.5 20a2.5 2.5 0 0 1 5 0"/>' },
  { key: 'heart', label: 'Feelings', group: 'Topics', words: 'feelings love heart emotions like', svg: '<path d="M12 20s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>' },
  { key: 'smile', label: 'Wellbeing', group: 'Topics', words: 'wellbeing happy smile face mood', svg: `<circle cx="12" cy="12" r="9"/>${dot(9, 10, .95)}${dot(15, 10, .95)}<path d="M8 14c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3"/>` },
  { key: 'culture', label: 'Culture', group: 'Topics', words: 'culture museum history art building', svg: '<path d="M3 9.5 12 4l9 5.5M4.5 9.5h15M5.5 9.5v8M9.5 9.5v8M14.5 9.5v8M18.5 9.5v8M3.5 20.5h17M4 17.5h16"/>' },
  { key: 'art', label: 'Art', group: 'Topics', words: 'art paint palette colour creative', svg: `<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 1.6-2.2-.4-1.3.3-2.3 1.7-2.3H18a2.5 2.5 0 0 0 2.5-2.5c0-5.5-3.8-10-8.5-10z"/>${dot(7.5, 11, 1.2)}${dot(10, 7.5, 1.2)}${dot(14.5, 7.5, 1.2)}${dot(17, 11, 1.2)}` },
  { key: 'science', label: 'Science', group: 'Topics', words: 'science flask experiment lab chemistry', svg: '<path d="M9.5 3.5h5M10 3.5v6l-5 9a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 18.5l-5-9v-6"/><path d="M7.2 14.5h9.6"/>' },
  { key: 'technology', label: 'Technology', group: 'Topics', words: 'technology computer laptop digital', svg: '<rect x="4.5" y="5" width="15" height="10" rx="1.5"/><path d="M2.5 19h19l-1.5-4H4z"/>' },
  { key: 'transport', label: 'Transport', group: 'Topics', words: 'transport bus travel vehicle commute', svg: `<rect x="4.5" y="3.5" width="15" height="14" rx="2.5"/><path d="M4.5 11h15M7 17.5V20M17 17.5V20M8 6.5h8"/>${dot(8, 14.2, 1.1)}${dot(16, 14.2, 1.1)}` },
  { key: 'house', label: 'Home life', group: 'Topics', words: 'house home life rooms daily routine', svg: '<path d="M4 11 12 4.5l8 6.5M6 9.5V20h12V9.5"/><rect x="10" y="13" width="4" height="7"/>' },
  { key: 'calendar', label: 'Calendar', group: 'Topics', words: 'calendar date day week plans schedule', svg: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17h2M11 17h2"/>' },
  { key: 'clock', label: 'Time', group: 'Topics', words: 'time clock hours telling time daily', svg: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { key: 'pet', label: 'Animals', group: 'Topics', words: 'animals pet paw dog cat', svg: '<ellipse cx="12" cy="16" rx="4.5" ry="3.8"/><ellipse cx="5.5" cy="10.5" rx="1.8" ry="2.3"/><ellipse cx="9" cy="6" rx="1.8" ry="2.3"/><ellipse cx="15" cy="6" rx="1.8" ry="2.3"/><ellipse cx="18.5" cy="10.5" rx="1.8" ry="2.3"/>' },
  { key: 'film', label: 'Film', group: 'Topics', words: 'film cinema movie clapper', svg: '<rect x="3" y="9" width="18" height="11.5" rx="1.5"/><path d="M3 9 19.5 4.5l.8 3-17 4.5M8 7.6l1.8 2.8M13 6.2l1.8 2.8"/>' },
  { key: 'book2', label: 'Stories', group: 'Topics', words: 'stories story literature fiction tale', svg: '<path d="M6 3.5h11.5a1.5 1.5 0 0 1 1.5 1.5v15.5H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 1-1.8z"/><path d="M5 18.5a2 2 0 0 1 2-2h12M9 7.5h6"/>' },
  { key: 'school', label: 'School', group: 'Topics', words: 'school education graduation cap learn', svg: '<path d="m2.5 9.5 9.5-5 9.5 5-9.5 5z"/><path d="M6.5 11.5v4.5c3 2.5 8 2.5 11 0v-4.5M21.5 9.5v5"/>' },

  // Signs
  { key: 'exclaim', label: 'Important', group: 'Signs', words: 'important attention note warning', svg: `<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/>${dot(12, 16.5, .95)}` },
  { key: 'info', label: 'Information', group: 'Signs', words: 'info information tip about', svg: `<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/>${dot(12, 7.8, .95)}` },
  { key: 'pin', label: 'Pin', group: 'Signs', words: 'pin location place map marker', svg: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>' },
  { key: 'key', label: 'Key', group: 'Signs', words: 'key answers unlock solution', svg: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14.5 8.5l2 2"/>' },
  { key: 'lock', label: 'Private', group: 'Signs', words: 'private lock secret closed', svg: '<rect x="5" y="10.5" width="14" height="10" rx="1.8"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"/>' },
  { key: 'tag', label: 'Label', group: 'Signs', words: 'label tag name price', svg: `<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8L21 12l-9 9z"/>${dot(8, 8, 1.4)}` },
  { key: 'bookmark', label: 'Bookmark', group: 'Signs', words: 'bookmark save remember keep', svg: '<path d="M6.5 3.5h11v17L12 16l-5.5 4.5z"/>' },
  { key: 'sparkle', label: 'New', group: 'Signs', words: 'new sparkle special shine', svg: '<path d="M12 3c.6 4.3 2.2 6.3 6.5 7-4.3.7-5.9 2.7-6.5 7-.6-4.3-2.2-6.3-6.5-7 4.3-.7 5.9-2.7 6.5-7zM18.5 15.5c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3z"/>' },
  { key: 'arrow', label: 'Next', group: 'Signs', words: 'next arrow forward continue go', svg: '<path d="M4 12h15M13 6l6 6-6 6"/>' },
  { key: 'thumbsup', label: 'Well done', group: 'Signs', words: 'thumbs up good well done like', svg: '<path d="M7 11v9H4.5v-9z"/><path d="m7 11 3.5-6.5c1.3 0 2 .9 1.8 2.2L11.8 10H18a2 2 0 0 1 2 2.3l-1 5.5a2.6 2.6 0 0 1-2.6 2.2H7"/>' },
  { key: 'hand', label: 'Raise a hand', group: 'Signs', words: 'hand raise volunteer stop wave', svg: '<path d="M7.5 12.5V7.8a1.3 1.3 0 0 1 2.6 0v3.7M10.1 11V5.6a1.3 1.3 0 0 1 2.6 0V11M12.7 11V6.6a1.3 1.3 0 0 1 2.6 0v5.2M15.3 11.5v-2a1.3 1.3 0 0 1 2.6 0V14a6 6 0 0 1-6 6h-.7a5 5 0 0 1-4.1-2.2L4.6 14a1.4 1.4 0 0 1 2.2-1.6l.7.9"/>' },
  { key: 'shield', label: 'Safe', group: 'Signs', words: 'safe shield protect secure', svg: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/>' },
  { key: 'flag2', label: 'Countries', group: 'Signs', words: 'countries nation flag world', svg: '<path d="M5 21V4M5 4.5c2.5-1.5 4.5-1.5 7 0s4.5 1.5 7 0v9c-2.5 1.5-4.5 1.5-7 0s-4.5-1.5-7 0"/>' },
  { key: 'hash', label: 'Number', group: 'Signs', words: 'number hash count numbers', svg: '<path d="M9.5 3.5 7.5 20.5M16.5 3.5l-2 17M4 8.5h16.5M3.5 15.5H20"/>' },
  { key: 'layers', label: 'Levels', group: 'Signs', words: 'levels layers stack differentiate', svg: '<path d="m12 3.5 9 4.5-9 4.5L3 8z"/><path d="m3 12 9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>' },
];

export const iconOf = (key: string | undefined | null) => (key ? IDENTITY_ICONS.find((i) => i.key === key) : undefined);

// The SVG as a string, for paper and for innerHTML. `size` in any CSS unit.
export const iconSvg = (key: string | undefined | null, size = '1em', stroke = 1.9) => {
  const i = iconOf(key);
  if (!i) return '';
  return `<svg class="aid-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${i.svg}</svg>`;
};

// Search by label, group and words; every word typed must match.
export function searchIcons(q: string): IdentityIcon[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return IDENTITY_ICONS;
  return IDENTITY_ICONS.filter((i) => {
    const hay = `${i.label} ${i.group} ${i.words} ${i.key}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
