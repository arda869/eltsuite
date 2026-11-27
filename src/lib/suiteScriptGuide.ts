import { SUITE_SCRIPT_HEADER } from './suiteScript';

export type SuiteScriptCatalogEntry = { key: string; label: string; group: string; hint?: string };

// Pass the live editor registry to keep names and capitalisation in the guide
// aligned with what teachers see in the insertion menu.
export function suiteScriptGuide(commands: SuiteScriptCatalogEntry[]): string {
  const questions = commands.filter(command => command.group === 'Questions');
  const types = [...new Set(questions.map(command => command.label))];
  const groups = [...new Set(commands.map(command => command.group))];
  const completeCatalog = groups.map(group => {
    const entries = commands.filter(command => command.group === group);
    return `${group.toUpperCase()} (${entries.length})\n${entries.map(command => `- ${command.label} [${command.key}]${command.hint ? `: ${command.hint}` : ''}`).join('\n')}`;
  }).join('\n\n');
  return `ELT Suite is a toolkit for English language teachers. Teachers use it to create and adapt lessons and activities, organise them in Classes, and find teaching materials in Resource Hub. SuiteScript is a text format for creating editable ELT Suite materials. Write for the teacher’s requested level and learning aim, and use the native activity and question types described below.

FORMAT
Start with the exact line ${SUITE_SCRIPT_HEADER}. Write ordinary lesson prose normally. Use small @ commands only for formatting or native elements. Return paste-ready SuiteScript only, with no Markdown fences or explanation.

QUOTING AND ESCAPING
Put command text in JSON-style double quotes and escape an inner quote as \\". Write @@ to show a literal @. Ordinary **, *, #, pipes, brackets, IPA and correction symbols remain literal. Never invent an asset ID, repair a damaged one or replace an unavailable asset with a similar file. Copy all ELTSUITE references verbatim.

FORMATTING
@heading("At reception") starts a heading. In a paragraph, write @bold("room number"), @italic("sorry"), @underline("important") or @strike("removed"). @stress("four", "teen", stressed: 2) uses an explicitly supplied one-based stressed syllable. Do not infer syllables from spelling. @numbered("First step", "Second step") makes a numbered list. @bullet("One", "Two") makes a bulleted list. For other native formatting and elements, copy an existing SuiteScript example from the editor; preserve its @element or @marked data exactly.

COMPLETE INSERT CATALOGUE
This catalogue comes from the live editor insertion registry. It covers every native question, communicative activity, diagram, media tool, text/layout element, and teacher-training block in that registry. Use the exact displayed name, including punctuation and capitalisation. The bracketed key identifies the insertion template; it is not text to show learners. A name alone is not a valid node schema.
${completeCatalog}

Question and activity types that use @question: ${types.join('; ')}.
For a multiple-choice question: @question(type: "Multiple choice, as a list", prompt: "Which room is ready?", options: ["Room 14", "Room 40"], teacherOnly: { answer: "Room 40" }). The answer belongs only in teacherOnly. For other question types, copy an example from ELT Suite and preserve its data: @question(type: "<exact displayed name>", data: { ... }). Never replace its type with a guess.

COMPLEX NATIVE ELEMENTS
The editor inserts complete, editable templates for the catalogue entries. For a complex element, use its actual template from the editor; do not improvise Tiptap node types or required fields. A single @element(data: { ... }) or @question(type: "<exact displayed name>", data: { ... }) can span multiple source lines. Keep teacher-only values in their private fields. The editor generates internal element IDs; omit them from teacher-facing timeline code.
Timeline example:
@timeline(
  title: "Past perfect",
  sentence: "The film had started when we arrived.",
  now: 600,
  showNow: true,
  ends: true,
  marks: [
    { kind: "event", x: 220, label: "The film started", side: "above" },
    { kind: "period", x: 220, x2: 430, label: "Before we arrived", side: "below" },
    { kind: "event", x: 430, label: "We arrived", side: "above" }
  ]
)
Timeline mark kinds are event, point, wave, period, repeat, arrow and question. x and x2 are positions from 30 to 970; wave, period, repeat and arrow need both. A repeat mark may use count from 2 to 12. The editor supplies IDs in the background.

MEDIA AND LINKS
An authorised file uses a permanent typed reference such as @audio("ELTSUITE-6042-9173-8562-3460"). The reference identifies an exact file, not a share link or a filename. Image, video, PDF and Collab references follow the same rule. The receiving teacher and learner audience must already be allowed to use the item. Keep alt text and captions separate from the ID.

SCOPES AND PRIVACY
Pasting in a rich-text field changes only that field at the cursor. In a Learner A field it affects only Learner A; in Learner B only Learner B. Do not send a field paste with activity title, level, aim, duration or another learner version. Copy different learner versions separately. Teacher notes and answer keys remain teacher-only. Messages can show only content and assets that all recipients are permitted to see; never include private versions or teacherOnly answers in a message.

WHOLE TASKS AND ACTIVITIES
Use a structural draft only in the whole-task or whole-activity action, never as a field paste. Start with @task("Title", kind: "task") and end with @endtask(). Between them use @instructions(), @content(), @teacherNotes() and @paperInstructions() to separate the four bodies. A full activity wraps one or more tasks in @activity("Title", level: "A2", aim: "...", minutes: 30, summary: "...", focus: "...") and @endactivity(). The currently selected learner version is the only version changed when a task draft is applied; the script must not specify a different version. All teacher notes stay teacher-only. Whole activities applied to Classes create tasks inside the selected lesson; Resource Hub activity drafts retain their title, level, summary, focus and duration.

COMPLETE EXAMPLES
Inline: ${SUITE_SCRIPT_HEADER}\nListen for the @bold("room number").
Question: ${SUITE_SCRIPT_HEADER}\n@question(type: "Multiple choice, as a list", prompt: "Which room is ready?", options: ["Room 14", "Room 40"], teacherOnly: { answer: "Room 40" })
Task text: ${SUITE_SCRIPT_HEADER}\n@heading("At reception")\nListen and compare your answer.\n@numbered("Choose what matters", "Discuss both rooms", "Agree on a room")
Whole task: ${SUITE_SCRIPT_HEADER}\n@task("Welcome exchange", kind: "task")\n@instructions()\nAsk your partner.\n@content()\nWhere do you live?\n@teacherNotes()\nModel one question first.\n@paperInstructions()\nWrite your partner's answer.\n@endtask()
Whole activity: ${SUITE_SCRIPT_HEADER}\n@activity("Meeting people", level: "A2", aim: "Ask where people live", minutes: 30, summary: "A pair exchange", focus: "Questions")\n@task("Interview", kind: "task")\n@content()\nAsk your partner where they live.\n@endtask()\n@endactivity()

COMMON ERRORS
If a command has a missing quote, closing parenthesis, unknown question type or invalid stressed index, correct that line before pasting. If an ID is missing, inaccessible or has a wrong checksum, reselect the exact item from My Files. Plain text without the ${SUITE_SCRIPT_HEADER} header pastes normally.

Return paste-ready SuiteScript only.`;
}
