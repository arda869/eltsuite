# Phase 4 test checklist: after class and language support

Use two browsers: one as the teacher, one as a learner (or two learners). Everything below was built against a local mock of Firebase; the security rules and multi-user timing need checking on the real project.

## Homework, practice and the To do list
- [ ] Lessons and work tab: a lesson row has **Use as…**. Choose Homework: a hidden copy appears with a Due field. Set a due date and show it.
- [ ] Learner home: the homework is in **To do** with "Not started"; after answering one task it says "In progress"; after all tasks are checked, "Submitted". A late submission is flagged in Reports.
- [ ] Practice: always open, **Try again** resets the answers; wrong answers go to My mistakes (Notebook → Practise).
- [ ] Learner home sections: Lessons, Homework, Exams, Practice.

## Reports and attendance
- [ ] Reports tab: Class (per learner × item, filter by type), One learner, One item, Attendance (minutes per live lesson, correct a value, add a missing learner), Mistake areas, Discussion (posts and replies). Every view has a CSV button.
- [ ] Attendance is recorded while a lesson is live from who is in the lesson; the teacher's corrections override the recorded minutes.

## Reading comfort, read-aloud, flashcards, vocabulary quiz
- [ ] Text size control (AA) → Reading: clearer font, line focus, letter and line spacing, high contrast. They stick per person.
- [ ] Select text in a lesson → the listen button reads it aloud. Vocabulary cards have a listen button.
- [ ] Learner notebook → Practise → Flashcards: Again / Got it moves cards through five boxes (1, 3, 7, 21 days). My mistakes: a question leaves the deck after two right answers on different days.
- [ ] Teacher notebook → Vocabulary → choose words → **Make a practice**: a practice item with matching, gap fill and meanings appears.

## Worksheet export
- [ ] Lesson editor → Export → **Worksheet…**: choose tasks, name and date line, answer key on its own page. **Print or save as PDF** opens a print view; **Word file** downloads a .docx that opens in Word and Google Docs.
- [ ] Gaps are lines, choices are (a / b / c), drag-and-drop gives a word box, matching gives two lettered columns, word order gives jumbled words and a line, long answers give ruled lines, crosswords and word searches give grids. Hidden tasks are left out.

## Full copy and GIFT
- [ ] Export → **Full copy (.lessonlit.json)**; Lessons tab → **Full copy of the class**. Import a lesson copy into another class (Import a lesson → upload): tasks, answer keys, notes, board drawings and pictures come across.
- [ ] Import a Moodle GIFT file (or paste GIFT text): multiple choice, true/false, short answer, numeric, matching, essay and missing-word questions become tasks, one per `$CATEGORY`. Problems show line numbers.

## Lesson recap
- [ ] Lessons tab → a lesson's **Recap** (or editor → Export → Lesson recap…): one draft per learner with tasks and scores, new words added to the class notebook during that lesson, homework in the same topic, minutes in class. Add a comment, **Share with everyone** or with one learner.
- [ ] Learner home shows **Lesson recaps**; the recap page shows the comment, tasks, words and homework links.
- [ ] **Parent link** copies a private link (`/r/…`) that opens without signing in. **Stop the link** makes it stop working.

## Question bank
- [ ] In a task: select a question → right-click → **Save to my question bank** (with answers); task settings → **Save task to my bank**. Add tags, level and skill.
- [ ] Type `/bank` → **From my question bank…**: search and filters; picking a question inserts it with fresh ids; picking a task adds a new task after the current one.

## Co-teachers
- [ ] Class settings → Teachers: invite an email as Co-teacher or Viewer. The invited teacher signs in with that email and sees **You are invited** on their Classes page; Accept.
- [ ] Co-teacher: can edit lessons, mark, teach live (the owner's app syncs live permissions when it is open; the co-teacher may need the owner to have opened the app once after accepting). Viewer: sees lessons as learners do, no editing, no Start teaching.
- [ ] Owner can change a role or remove a teacher. Only the owner can delete the class.

## Lesson schedule
- [ ] Lessons tab: set **When** (and a video link) on a lesson. Learner home shows **Next lesson** with the time in the learner's own time zone and a Join call button (15 minutes before, or always, depending on the class meeting setting).

## Announcements board
- [ ] Send an announcement with **Pin to the class home** and another with **Send later**. Learners see pinned messages at the top of the Announcements board on their home page with an unread count; the scheduled one appears at its time (within a minute). The teacher's dialog lists the whole board with Pin, Cancel, Remind and Take back.

## Question pack 2
- [ ] `/dictation`: learners press Listen (limited replays), type the sentence, check: typed words in blue, wrong ones crossed, the sentence shown with missed words in green. 1 point per word.
- [ ] `/pairs` (minimal pairs): listen and pick ship / sheep. `/crossword` and `/wordsearch`: type words and clues or **From the class notebook…**; learners type letters (crossword) or drag across words (word search).
- [ ] Text convention: `[[dictation replays=2]]`, `[[pairs]]` with `*ship | sheep`, `[[crossword]]` and `[[wordsearch]]` with `word = clue` lines.

## Discussion boards
- [ ] Class page → Discussion → **New prompt** (teacher) or **Start a thread** (learner, if allowed). Learner home has a Discussion link with an unread count; threads open live without refreshing.
- [ ] Replies, reactions, @mentions (notice to the person tagged), links and picture addresses in posts. Task settings → **Discuss this task** makes a prompt linked to the task; learners see a "Discuss" chip on that task.
- [ ] Teacher tools: Pin, Lock, Hide, Delete, Approve (with "wait for my approval" on), Mute a learner, clear reports. Learners can Report a post and edit or delete their own.
- [ ] **Language feedback**: teacher selects words in a learner's post → correction code or private comment; only that learner sees it.
- [ ] Reports → Discussion counts threads and replies per learner (switch off in Board settings).
