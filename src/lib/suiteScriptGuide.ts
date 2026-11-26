import { SUITE_SCRIPT_HEADER } from './suiteScript';

export type SuiteScriptCatalogEntry = { key: string; label: string; group: string };

// Pass the live editor registry to keep names and capitalisation in the guide
// aligned with what teachers see in the insertion menu.
export function suiteScriptGuide(commands: SuiteScriptCatalogEntry[]): string {
  const questions = commands.filter(command => command.group === 'Questions');
  const types = [...new Set(questions.map(command => command.label))];
  return `ELT Suite is a toolkit for English language teachers. Teachers use it to create and adapt lessons and activities, organise them in Classes, and find teaching materials in Resource Hub. SuiteScript is a text format for creating editable ELT Suite materials. Write for the teacher’s requested level and learning aim, and use the native activity and question types described below.

FORMAT
Start with the exact line ${SUITE_SCRIPT_HEADER}. Write ordinary lesson prose normally. Use small @ commands only for formatting or native elements. Return paste-ready SuiteScript only, with no Markdown fences or explanation.

QUOTING AND ESCAPING
Put command text in JSON-style double quotes and escape an inner quote as \\". Write @@ to show a literal @. Ordinary **, *, #, pipes, brackets, IPA and correction symbols remain literal. Never invent an asset ID, repair a damaged one or replace an unavailable asset with a similar file. Copy all ELTSUITE references verbatim.

FORMATTING
@heading("At reception") starts a heading. In a paragraph, write @bold("room number"), @italic("sorry"), @underline("important") or @strike("removed"). @stress("four", "teen", stressed: 2) uses an explicitly supplied one-based stressed syllable. Do not infer syllables from spelling. @numbered("First step", "Second step") makes a numbered list. @bullet("One", "Two") makes a bulleted list. For other native formatting and elements, copy an existing SuiteScript example from the editor; preserve its @element or @marked data exactly.

NATIVE QUESTION AND ACTIVITY NAMES
Use the exact displayed name, including punctuation and capitalisation. Current registry: ${types.join('; ')}.
For a multiple-choice question: @question(type: "Multiple choice, as a list", prompt: "Which room is ready?", options: ["Room 14", "Room 40"], teacherOnly: { answer: "Room 40" }). The answer belongs only in teacherOnly. For other question types, copy an example from ELT Suite and preserve its data: @question(type: "<exact displayed name>", data: { ... }). Never replace its type with a guess.

MEDIA AND LINKS
An authorised file uses a permanent typed reference such as @audio("ELTSUITE-6042-9173-8562-3460"). The reference identifies an exact file, not a share link or a filename. Image, video, PDF and Collab references follow the same rule. The receiving teacher and learner audience must already be allowed to use the item. Keep alt text and captions separate from the ID.

SCOPES AND PRIVACY
Pasting in a rich-text field changes only that field at the cursor. In a Learner A field it affects only Learner A; in Learner B only Learner B. Do not send a field paste with activity title, level, aim, duration or another learner version. Copy different learner versions separately. Teacher notes and answer keys remain teacher-only. Messages can show only content and assets that all recipients are permitted to see; never include private versions or teacherOnly answers in a message.

COMPLETE EXAMPLES
Inline: ${SUITE_SCRIPT_HEADER}\nListen for the @bold("room number").
Question: ${SUITE_SCRIPT_HEADER}\n@question(type: "Multiple choice, as a list", prompt: "Which room is ready?", options: ["Room 14", "Room 40"], teacherOnly: { answer: "Room 40" })
Task text: ${SUITE_SCRIPT_HEADER}\n@heading("At reception")\nListen and compare your answer.\n@numbered("Choose what matters", "Discuss both rooms", "Agree on a room")
Activity: prepare separate SuiteScript drafts for the activity instructions, each learner version and each task; place them into the matching fields. Do not include metadata in a field draft.

COMMON ERRORS
If a command has a missing quote, closing parenthesis, unknown question type or invalid stressed index, correct that line before pasting. If an ID is missing, inaccessible or has a wrong checksum, reselect the exact item from My Files. Plain text without the ${SUITE_SCRIPT_HEADER} header pastes normally.

Return paste-ready SuiteScript only.`;
}
