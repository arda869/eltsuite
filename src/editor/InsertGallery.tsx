import { useEffect, useMemo, useState, type ReactNode } from 'react';

// A window that shows every element you can put in a task, in groups, each with a short
// explanation and a picture of what learners see. The / menu stays for quick typing.

export type GalleryCmd = { key: string; label: string; hint: string };
type Section = { title: string; blurb: string; keys: string[] };

const SECTIONS: Section[] = [
  { title: 'Questions checked by the app', blurb: 'Learners answer, press Check, and see what was right. One point each unless you say otherwise.', keys: ['gap', 'lettergap', 'wordform', 'dropdown', 'radio', 'truefalse', 'notgiven', 'match', 'drop', 'bank', 'order', 'pq-fix', 'pq-transform', 'pq-highlight', 'pq-categorise', 'pq-sentences', 'pq-gapped', 'pq-matching', 'pq-label', 'pq-odd'] },
  { title: 'Listening and pronunciation', blurb: 'Your own recordings and videos, with karaoke scripts, and tasks the browser reads aloud.', keys: ['media', 'pq-dictation', 'pq-pairs', 'ipa', 'stress'] },
  { title: 'Puzzles and games', blurb: 'For warmers, revision and a change of pace.', keys: ['pq-crossword', 'pq-wordsearch', 'drawcard', 'wheel', 'boxes'] },
  { title: 'Speaking, writing and reflection', blurb: 'Open answers you read or the class shares. The long answer is the one you mark.', keys: ['writing', 'upload', 'pq-speaking', 'survey', 'reflect', 'peer', 'board', 'postits'] },
  { title: 'Collaboration tools', blurb: 'Live, together: a shared document, shared slides or a drawing board, for the whole class, each group or each learner.', keys: ['collab', 'collab-slides', 'drawboard'] },
  { title: 'Text and layout', blurb: 'Reading texts, boxes, media and structure.', keys: ['textbox', 'info', 'reveal', 'image', 'linkcard', 'table', 'heading', 'list', 'numbered', 'quote', 'column'] },
  { title: 'Lesson boxes', blurb: 'Ready-made boxes for aims, rules, tips, useful language and more, with sample content to edit.', keys: ['b-aims', 'b-useful', 'b-dialogue', 'b-rule', 'b-notice', 'b-tip', 'b-watch', 'b-wordbox', 'b-glossary', 'b-pron', 'b-discuss', 'b-didyouknow', 'b-note', 'b-cando'] },
  { title: 'Notebook and bank', blurb: 'Links to the rest of the classroom.', keys: ['grammarlink', 'vocablink', 'bankpick'] },
];

// Longer explanations than the / menu hints: what learners do and how it is marked.
const ABOUT: Record<string, string> = {
  gap: 'A blank inside a sentence. Learners type the missing word. Accept several answers with |; case can matter if you want.',
  lettergap: 'A gap with one short line for each letter, so learners know how long the word is. Works for a single word or a whole sentence; you can show the first letters.',
  wordform: 'A gap with the stem word in capitals next to it, Cambridge style: "She is a famous ____ (WRITE)".',
  dropdown: 'Options inside the sentence, like go / goes / going. Learners circle one. Can have more than one right answer.',
  radio: 'A question with options listed underneath. Feedback per option and an explanation after checking.',
  truefalse: 'A statement with True / False after it.',
  notgiven: 'True, false or not given, for reading tasks.',
  match: 'Items on the left, matches on the right, shuffled for learners. Tap one, then tap its partner. One point per pair. You can add extra right-hand items as distractors.',
  drop: 'A gap learners fill by dragging a word from the word bank. Every drag gap in the task shares the bank.',
  bank: 'The box of words for drag-and-drop gaps. Add extra words that fit nowhere.',
  order: 'Write the correct sentence; learners see the words jumbled and put them in order.',
  'pq-fix': 'A sentence with one mistake. Learners tap the wrong word (1 point) and type the correction (1 point).',
  'pq-transform': 'Key word transformation: a first sentence, a word in capitals, and a second sentence with a gap to complete using that word, within a word limit.',
  'pq-highlight': 'A text where learners tap every word or phrase that matches your instruction, for example every past participle.',
  'pq-categorise': 'Words sorted into columns you name, for example countable and uncountable.',
  'pq-sentences': 'Sentences or paragraphs shown shuffled; learners drag them into order.',
  'pq-gapped': 'A text with sentences removed. Learners put each removed sentence back, with extra sentences as distractors.',
  'pq-matching': 'Multiple matching: statements matched to texts or people A, B, C, D.',
  'pq-label': 'A picture with numbered points. Learners drag labels onto the right points.',
  'pq-odd': 'A row of words; learners pick the one that does not belong, and can say why.',
  'pq-dictation': 'Learners press Listen (you set how many times), type the sentence, and see it marked word by word.',
  'pq-pairs': 'Minimal pairs: learners hear one word and pick it from similar-sounding options, like ship / sheep.',
  ipa: 'A phonemic transcription with a chart to type it, British or American, and a listen button (computer voice or your recording).',
  stress: 'A word split into syllables with the stressed one marked.',
  'pq-crossword': 'A crossword built from your words and clues, or from the class notebook. Learners type the letters; one point per word.',
  'pq-wordsearch': 'A grid of letters. Learners read each clue and drag across the word.',
  drawcard: 'A pile of cards with your content on each. Learners draw one at random. Good for speaking prompts.',
  wheel: 'The same cards on a wheel learners spin.',
  boxes: 'The same cards hidden behind boxes learners open.',
  writing: 'A long answer with a word count and an optional model answer. You mark it, with a Cambridge-style or custom rubric if you like, and correction codes.',
  collab: 'A shared document, written live like Google Docs: the whole class together, each group, or each learner and then their group. Learners edit, suggest changes or comment; you lock, accept and see who wrote what.',
  upload: 'Learners hand in files: a photo of their work, a Word or PowerPoint file, a recording or a short video. You choose which kinds, how large and how many, and open each one when you mark.',
  'pq-speaking': 'A speaking card with photos, questions and a timer, for pairs or solo.',
  survey: 'Ratings, faces, choices, ranking or open answers. Anonymous if you want. Results as live charts you can share.',
  reflect: 'Learners rate how they did: stars, faces, scales or a can-do list. Answers come to you.',
  peer: 'Learners choose a classmate and rate how they did, with an optional message to them.',
  board: 'A message board inside the task where learners post and the class reads.',
  postits: 'A wall of sticky notes learners add to.',
  textbox: 'A styled box for a reading text, an email, a web page, a note, a speech bubble or paper.',
  info: 'An information box with a label and a symbol: grammar rules, tips, useful language.',
  reveal: 'Content hidden behind a button until a learner opens it: hints, answers, extra help.',
  media: 'A sound or video: record it in the app, upload a sound, or link to YouTube. Add a script that lights up word by word as it plays. Kept in your media archive, and on worksheets as a QR code.',
  linkcard: 'A card for a YouTube video, an audio file or a web page, played in place.',
  image: 'Pictures from your computer, your media archive or a web address. Crop them, change the colour, or cover them for learners to reveal.',
  table: 'A table with a header row. Cells can be coloured and rows striped.',
  heading: 'A small heading inside the task.',
  list: 'A bulleted list.',
  numbered: 'A numbered list, with numbering styles.',
  quote: 'A passage set apart from the rest.',
  column: 'Starts the second column of a two-column layout, for example text on the left and questions on the right.',
  'b-aims': '"In this lesson you will…" with can-do lines.',
  'b-useful': 'Phrases grouped by function.',
  'b-dialogue': 'A model dialogue in speech bubbles with speaker names.',
  'b-rule': 'A short grammar rule with the form.',
  'b-notice': 'Guided discovery: a question about examples, with the answer in a reveal box.',
  'b-tip': 'A study, exam or learning tip.',
  'b-watch': 'A common mistake crossed out, and the correct form.',
  'b-wordbox': 'Words and phrases for the task in a box.',
  'b-glossary': 'Meanings of words in a reading text.',
  'b-pron': 'A pronunciation box with stress, IPA and listening.',
  'b-discuss': 'Discussion questions for pairs or groups.',
  'b-didyouknow': 'A culture or fact box.',
  'b-note': 'A sticky note for examples or a list.',
  'b-cando': 'An end-of-lesson self-assessment; answers go to you.',
  'collab-slides': 'Shared slides, made live like Google Slides: text boxes, pictures, shapes, layouts and backgrounds. The whole class, each group or each learner; learners can each make their own slides in one deck. Present full screen; download as PowerPoint or PDF.',
  drawboard: 'A drawing board, live: draw, write and add pictures. One for the whole class, each group or each learner; lock it, show everyone’s cursor, use the pointer.',
  grammarlink: 'A card that opens a grammar page in the class notebook.',
  vocablink: 'A card that opens a vocabulary page in the class notebook.',
  bankpick: 'Insert a question or a task you saved to your personal bank.',
};

// Small schematic pictures. They use the same colours as the real elements.
const Line = ({ w = '100%', faint }: { w?: string; faint?: boolean }) => <span className={'gl-line' + (faint ? ' faint' : '')} style={{ width: w }} />;
const Gap = ({ w = 34, pen }: { w?: number; pen?: string }) => <span className="gl-gap" style={{ width: w }}>{pen}</span>;
const Chip = ({ children, on, pen }: { children: ReactNode; on?: boolean; pen?: boolean }) => <span className={'gl-chip' + (on ? ' on' : '') + (pen ? ' pen' : '')}>{children}</span>;
const Sent = ({ children }: { children: ReactNode }) => <span className="gl-sent">{children}</span>;
const Box = ({ label, tone = 'sand', children, sym }: { label?: string; tone?: string; children?: ReactNode; sym?: string }) => (
  <span className={'gl-box t-' + tone}>
    {label && (
      <span className="gl-box-label">
        {sym && <b>{sym}</b>}
        {label}
      </span>
    )}
    {children ?? (
      <>
        <Line w="90%" faint />
        <Line w="70%" faint />
      </>
    )}
  </span>
);
const Lines = ({ n = 3 }: { n?: number }) => (
  <span className="gl-lines">
    {Array.from({ length: n }, (_, i) => (
      <Line key={i} w={['92%', '80%', '60%', '85%'][i % 4]} faint />
    ))}
  </span>
);
const Radio = ({ on, children }: { on?: boolean; children: ReactNode }) => (
  <span className="gl-radio">
    <i className={on ? 'on' : ''} />
    {children}
  </span>
);
const Speaker = () => <span className="gl-speaker">▶</span>;
const Grid = ({ cells, cols, dark }: { cells: string[]; cols: number; dark?: boolean }) => (
  <span className="gl-grid" style={{ gridTemplateColumns: `repeat(${cols}, 14px)` }}>
    {cells.map((c, i) => (
      <i key={i} className={c === '#' ? 'blk' : c === '.' ? '' : 'on'} style={dark && c !== '#' ? { background: '#fff' } : undefined}>
        {c !== '#' && c !== '.' ? c : ''}
      </i>
    ))}
  </span>
);
const Cards = ({ kind }: { kind: 'cards' | 'wheel' | 'boxes' }) =>
  kind === 'wheel' ? (
    <span className="gl-wheel" />
  ) : (
    <span className="gl-cards">
      {[0, 1, 2].map((i) => (
        <i key={i} className={kind === 'boxes' ? 'box' : ''} style={{ transform: kind === 'cards' ? `rotate(${(i - 1) * 6}deg)` : undefined }}>
          {kind === 'boxes' ? '?' : ''}
        </i>
      ))}
    </span>
  );

const PREVIEW: Record<string, () => ReactNode> = {
  gap: () => (
    <Sent>
      She <Gap pen="has" /> never been to Japan.
    </Sent>
  ),
  wordform: () => (
    <Sent>
      a famous <Gap pen="writer" /> <b className="gl-stem">WRITE</b>
    </Sent>
  ),
  lettergap: () => (
    <Sent>
      I was <span className="gl-letters">r<i /><i /><i /><i /><i /><i /><i /><i /></span> to go.
    </Sent>
  ),
  dropdown: () => (
    <Sent>
      She <Chip>go</Chip>
      <Chip on>goes</Chip>
      <Chip>going</Chip> to work.
    </Sent>
  ),
  radio: () => (
    <span className="gl-col">
      <Sent>Which sentence is correct?</Sent>
      <Radio>He don't like tea.</Radio>
      <Radio on>He doesn't like tea.</Radio>
    </span>
  ),
  truefalse: () => (
    <Sent>
      London is in France. <Chip>True</Chip>
      <Chip on>False</Chip>
    </Sent>
  ),
  notgiven: () => (
    <Sent>
      <Chip>True</Chip>
      <Chip>False</Chip>
      <Chip on>Not given</Chip>
    </Sent>
  ),
  match: () => (
    <span className="gl-two">
      <span className="gl-col">
        <Chip>happy</Chip>
        <Chip>big</Chip>
      </span>
      <span className="gl-arrows">→</span>
      <span className="gl-col">
        <Chip pen>joyful</Chip>
        <Chip pen>large</Chip>
      </span>
    </span>
  ),
  drop: () => (
    <span className="gl-col">
      <Sent>
        Yesterday I <Gap pen="went" /> to the shop.
      </Sent>
      <span className="gl-bank">
        <Chip>bought</Chip>
        <Chip>go</Chip>
      </span>
    </span>
  ),
  bank: () => (
    <span className="gl-bank">
      <Chip>went</Chip>
      <Chip>bought</Chip>
      <Chip>go</Chip>
      <Chip>buy</Chip>
    </span>
  ),
  order: () => (
    <span className="gl-col">
      <span className="gl-bank">
        <Chip>been</Chip>
        <Chip>I</Chip>
        <Chip>have</Chip>
        <Chip>there</Chip>
      </span>
      <Sent>
        <Chip pen>I</Chip>
        <Chip pen>have</Chip>
        <Gap w={60} />
      </Sent>
    </span>
  ),
  'pq-fix': () => (
    <Sent>
      She <Chip on>have</Chip> never been there. → <Gap pen="has" />
    </Sent>
  ),
  'pq-transform': () => (
    <span className="gl-col">
      <Sent>I last saw him in May.</Sent>
      <b className="gl-stem">SINCE</b>
      <Sent>
        I <Gap pen="haven't seen him since" w={90} /> May.
      </Sent>
    </span>
  ),
  'pq-highlight': () => (
    <Sent>
      I have <Chip on>eaten</Chip> sushi and <Chip on>seen</Chip> Mount Fuji.
    </Sent>
  ),
  'pq-categorise': () => (
    <span className="gl-two">
      <Box label="Countable">
        <Chip pen>apple</Chip>
      </Box>
      <Box label="Uncountable">
        <Chip pen>rice</Chip>
      </Box>
    </span>
  ),
  'pq-sentences': () => (
    <span className="gl-col">
      <span className="gl-row-num">
        <b>1</b>
        <Line w="80%" />
      </span>
      <span className="gl-row-num">
        <b>2</b>
        <Line w="65%" />
      </span>
      <span className="gl-row-num">
        <b>3</b>
        <Line w="75%" />
      </span>
    </span>
  ),
  'pq-gapped': () => (
    <span className="gl-col">
      <Lines n={2} />
      <Sent>
        <Gap pen="B" w={22} /> …and that was the end.
      </Sent>
      <span className="gl-bank">
        <Chip>A</Chip>
        <Chip on>B</Chip>
        <Chip>C</Chip>
      </span>
    </span>
  ),
  'pq-matching': () => (
    <span className="gl-col">
      <Sent>
        Who regrets a decision? <Chip>A</Chip>
        <Chip on>B</Chip>
        <Chip>C</Chip>
      </Sent>
      <Sent>
        Who moved abroad? <Chip>A</Chip>
        <Chip>B</Chip>
        <Chip on>C</Chip>
      </Sent>
    </span>
  ),
  'pq-label': () => (
    <span className="gl-pic">
      <i className="dot" style={{ left: '20%', top: '30%' }}>
        1
      </i>
      <i className="dot" style={{ left: '65%', top: '55%' }}>
        2
      </i>
      <span className="gl-bank" style={{ position: 'absolute', right: 4, bottom: 4 }}>
        <Chip>roof</Chip>
        <Chip>door</Chip>
      </span>
    </span>
  ),
  'pq-odd': () => (
    <Sent>
      <Chip>apple</Chip>
      <Chip>pear</Chip>
      <Chip on>carrot</Chip>
      <Chip>plum</Chip>
    </Sent>
  ),
  'pq-dictation': () => (
    <span className="gl-col">
      <span className="gl-row">
        <Speaker /> <span className="gl-hint">2 plays left</span>
      </span>
      <Gap w={150} pen="She has never be to Japan" />
    </span>
  ),
  'pq-pairs': () => (
    <span className="gl-col">
      <span className="gl-row">
        <Speaker /> <Chip on>ship</Chip>
        <Chip>sheep</Chip>
      </span>
      <span className="gl-row">
        <Speaker /> <Chip>live</Chip>
        <Chip on>leave</Chip>
      </span>
    </span>
  ),
  ipa: () => (
    <Sent>
      photograph <span className="gl-ipa">/ˈfəʊtəɡrɑːf/</span> <Speaker />
    </Sent>
  ),
  stress: () => (
    <Sent>
      <span className="gl-stress">
        <b>pho</b>to<span>graph</span>
      </span>
    </Sent>
  ),
  'pq-crossword': () => <Grid cols={5} cells={['#', '1', '.', '.', '#', '2', 'A', 'P', 'P', 'L', '#', 'T', '#', '.', '#', '#', '.', '#', '.', '#']} />,
  'pq-wordsearch': () => <Grid cols={5} cells={['Q', 'B', 'R', 'E', 'A', 'A', 'P', 'K', 'T', 'U', 'C', 'H', 'E', 'E', 'S', 'J', 'M', 'I', 'L', 'K']} dark />,
  drawcard: () => <Cards kind="cards" />,
  wheel: () => <Cards kind="wheel" />,
  boxes: () => <Cards kind="boxes" />,
  writing: () => (
    <span className="gl-col">
      <Sent>Describe your last holiday.</Sent>
      <span className="gl-textarea">
        <span className="gl-pen">Last summer I went to…</span>
      </span>
      <span className="gl-hint">42 words · up to 150</span>
    </span>
  ),
  'pq-speaking': () => (
    <span className="gl-two">
      <span className="gl-photo" />
      <span className="gl-photo" />
      <span className="gl-timer">0:60</span>
    </span>
  ),
  survey: () => (
    <span className="gl-col">
      <Sent>How confident are you?</Sent>
      <span className="gl-row">
        <Chip>1</Chip>
        <Chip>2</Chip>
        <Chip on>3</Chip>
        <Chip>4</Chip>
        <Chip>5</Chip>
      </span>
    </span>
  ),
  reflect: () => (
    <span className="gl-col">
      <Sent>How did it go?</Sent>
      <span className="gl-stars">★★★★☆</span>
    </span>
  ),
  peer: () => (
    <span className="gl-col">
      <Sent>
        Rate <Chip on>Mia</Chip>
      </Sent>
      <span className="gl-stars">★★★★★</span>
    </span>
  ),
  board: () => (
    <span className="gl-col">
      <span className="gl-post">
        <b>Mia</b> I think the second one is right.
      </span>
      <span className="gl-post">
        <b>Tom</b> Agree! Because of "ever".
      </span>
    </span>
  ),
  postits: () => (
    <span className="gl-row">
      <span className="gl-sticky y">travel</span>
      <span className="gl-sticky p">food</span>
      <span className="gl-sticky g">music</span>
    </span>
  ),
  textbox: () => (
    <Box tone="paper">
      <Lines n={4} />
    </Box>
  ),
  info: () => (
    <Box label="Grammar" sym="!" tone="sand">
      <Sent>have / has + past participle</Sent>
    </Box>
  ),
  reveal: () => (
    <span className="gl-reveal">
      <Chip on>Show the answer ▾</Chip>
    </span>
  ),
  linkcard: () => (
    <span className="gl-link">
      <i>▶</i>
      <span className="gl-col">
        <Line w="70%" />
        <Line w="40%" faint />
      </span>
    </span>
  ),
  image: () => <span className="gl-photo wide" />,
  collab: () => (
    <span className="gl-col">
      <span className="gl-collab">
        <i style={{ background: '#3d6fb6' }} />
        <i style={{ background: '#b8508f' }} />
        <i style={{ background: '#c7772f' }} />
      </span>
      <span className="gl-kara">
        We went <b>to the beach</b> and <s>swam</s> swam.
      </span>
    </span>
  ),
  'collab-slides': () => (
    <span className="gl-col">
      <span className="gl-collab">
        <i style={{ background: '#3d6fb6' }} />
        <i style={{ background: '#7a5cb8' }} />
      </span>
      <span className="gl-slides">
        <i className="on" />
        <i />
        <b>
          <em />
          <u />
        </b>
      </span>
    </span>
  ),
  upload: () => (
    <span className="gl-col">
      <span className="gl-upload">
        <i />
        <span className="gl-col">
          <Line w="70%" />
          <Line w="40%" faint />
        </span>
      </span>
    </span>
  ),
  media: () => (
    <span className="gl-col">
      <span className="gl-media">
        <i />
        <span className="gl-media-track">
          <span />
        </span>
      </span>
      <span className="gl-kara">
        <b>She has never</b> been to Japan.
      </span>
    </span>
  ),
  table: () => (
    <span className="gl-table">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={i < 3 ? 'h' : ''} />
      ))}
    </span>
  ),
  heading: () => (
    <span className="gl-col">
      <b className="gl-h">Reading</b>
      <Lines n={2} />
    </span>
  ),
  list: () => (
    <span className="gl-col">
      <span className="gl-row-num">
        <b>•</b>
        <Line w="70%" />
      </span>
      <span className="gl-row-num">
        <b>•</b>
        <Line w="55%" />
      </span>
    </span>
  ),
  numbered: () => (
    <span className="gl-col">
      <span className="gl-row-num">
        <b>1.</b>
        <Line w="70%" />
      </span>
      <span className="gl-row-num">
        <b>2.</b>
        <Line w="55%" />
      </span>
    </span>
  ),
  quote: () => (
    <span className="gl-quote">
      <Lines n={2} />
    </span>
  ),
  column: () => (
    <span className="gl-two">
      <Lines n={4} />
      <span className="gl-col">
        <Sent>
          1 <Gap w={30} />
        </Sent>
        <Sent>
          2 <Gap w={30} />
        </Sent>
      </span>
    </span>
  ),
  'b-aims': () => (
    <Box label="In this lesson you will" sym="→" tone="sky">
      <Lines n={2} />
    </Box>
  ),
  'b-useful': () => (
    <Box label="Useful language" sym="✎" tone="sage">
      <Lines n={2} />
    </Box>
  ),
  'b-dialogue': () => (
    <span className="gl-col">
      <span className="gl-bubble l">Have you ever been to Japan?</span>
      <span className="gl-bubble r">Yes, I have.</span>
    </span>
  ),
  'b-rule': () => (
    <Box label="Remember" sym="!" tone="sand">
      <Sent>have / has + past participle</Sent>
    </Box>
  ),
  'b-notice': () => (
    <Box label="Notice" sym="?" tone="grey">
      <Lines n={1} />
      <Chip on>Show the answer ▾</Chip>
    </Box>
  ),
  'b-tip': () => (
    <Box label="Exam tip" sym="★" tone="sage">
      <Lines n={2} />
    </Box>
  ),
  'b-watch': () => (
    <Box label="Watch out" sym="≠" tone="rose">
      <Sent>
        <s>I have seen him yesterday.</s>
      </Sent>
    </Box>
  ),
  'b-wordbox': () => (
    <Box label="Word box" tone="grey">
      <Sent>journey · luggage · passport</Sent>
    </Box>
  ),
  'b-glossary': () => (
    <Box label="Glossary" tone="grey">
      <Sent>
        <b>reluctant</b> (adj.) not wanting to
      </Sent>
    </Box>
  ),
  'b-pron': () => (
    <Box label="Pronunciation" sym="♪" tone="sky">
      <Sent>
        <span className="gl-ipa">/ˈfəʊtəɡrɑːf/</span> <Speaker />
      </Sent>
    </Box>
  ),
  'b-discuss': () => (
    <Box label="Talk about it" sym="✎" tone="sand">
      <Lines n={2} />
    </Box>
  ),
  'b-didyouknow': () => (
    <Box label="Did you know?" sym="i" tone="sky">
      <Lines n={2} />
    </Box>
  ),
  'b-note': () => (
    <span className="gl-sticky y big">
      milk
      <br />
      eggs
    </span>
  ),
  'b-cando': () => (
    <span className="gl-col">
      <Radio on>I can talk about experiences</Radio>
      <Radio>I can use ever and never</Radio>
    </span>
  ),
  drawboard: () => (
    <span className="gl-board">
      <svg viewBox="0 0 120 50" width="120" height="50" aria-hidden="true">
        <path d="M8 40 C 30 5, 50 45, 70 15 S 100 30, 112 12" fill="none" stroke="#b5683b" strokeWidth="3" strokeLinecap="round" />
        <rect x="80" y="28" width="28" height="16" rx="3" fill="none" stroke="#777" strokeWidth="2" />
      </svg>
    </span>
  ),
  grammarlink: () => (
    <span className="gl-link">
      <i>§</i>
      <span className="gl-col">
        <Sent>Present perfect</Sent>
        <span className="gl-hint">Grammar bank →</span>
      </span>
    </span>
  ),
  vocablink: () => (
    <span className="gl-link">
      <i>Aa</i>
      <span className="gl-col">
        <Sent>Travel words</Sent>
        <span className="gl-hint">Vocabulary bank →</span>
      </span>
    </span>
  ),
  bankpick: () => (
    <span className="gl-col">
      <span className="gl-post">
        <b>Question</b> have / has + past participle
      </span>
      <span className="gl-post">
        <b>Task</b> Talk about it · B1 · speaking
      </span>
    </span>
  ),
};

export function InsertGallery({ commands, onPick, onClose }: { commands: GalleryCmd[]; onPick: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [section, setSection] = useState(0);
  const byKey = useMemo(() => Object.fromEntries(commands.map((c) => [c.key, c])), [commands]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const query = q.trim().toLowerCase();
  const sections = SECTIONS.map((s) => ({ ...s, items: s.keys.map((k) => byKey[k]).filter(Boolean).filter((c) => !query || `${c.label} ${c.hint} ${ABOUT[c.key] ?? ''}`.toLowerCase().includes(query)) })).filter((s) => s.items.length);
  const shown = query ? sections : sections.filter((_, i) => i === section);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog wide gallery" role="dialog" aria-label="Add to the task" onClick={(e) => e.stopPropagation()}>
        <div className="gallery-head">
          <h2 style={{ margin: 0 }}>Add to the task</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, for example “match” or “listen”" aria-label="Search" autoFocus />
          <button type="button" className="btn small-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="gallery-body">
          {!query && (
            <nav className="gallery-nav" aria-label="Groups">
              {SECTIONS.map((s, i) => (
                <button key={s.title} type="button" className={section === i ? 'on' : ''} onClick={() => setSection(i)}>
                  {s.title}
                  <span className="hint">{s.keys.filter((k) => byKey[k]).length}</span>
                </button>
              ))}
              <span className="hint gallery-tip">Tip: type / in the text for the quick menu.</span>
            </nav>
          )}
          <div className="gallery-main">
            {!shown.length && <p className="hint">Nothing matches.</p>}
            {shown.map((s) => (
              <section key={s.title} className="gallery-sec">
                <h3>{s.title}</h3>
                <p className="hint">{s.blurb}</p>
                <div className="gallery-grid">
                  {s.items.map((c) => (
                    <button key={c.key} type="button" className="gallery-card" onClick={() => onPick(c.key)} title="Add this">
                      <span className="gallery-pic" aria-hidden="true">
                        {PREVIEW[c.key]?.() ?? <Lines n={3} />}
                      </span>
                      <span className="gallery-title">{c.label}</span>
                      <span className="gallery-about">{ABOUT[c.key] ?? c.hint}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
