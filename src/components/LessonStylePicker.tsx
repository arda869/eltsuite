import type { LessonStyle } from '../lib/lessonStyle';
import './lessonStylePicker.css';

const styles: { value: LessonStyle; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'exam', label: 'Exam Prep' },
  { value: 'young', label: 'Young learner' },
  { value: 'teen', label: 'Teenagers' },
];

function StylePreview({ style }: { style: LessonStyle }) {
  return <span className={`lesson-style-preview lesson-style-preview--${style}`} aria-hidden="true">
    {style === 'adult' && <>
      <span className="lesson-style-preview__heading">A new conversation</span>
      <span className="lesson-style-preview__rule" />
      <span className="lesson-style-preview__body">1&nbsp; Read and choose the best answer.</span>
      <span className="lesson-style-preview__choices"><i>A</i><i>B</i><i>C</i></span>
    </>}
    {style === 'exam' && <>
      <span className="lesson-style-preview__eyebrow">PART 1&nbsp; · &nbsp;QUESTIONS 1–3</span>
      <span className="lesson-style-preview__heading">Reading</span>
      <span className="lesson-style-preview__rule" />
      <span className="lesson-style-preview__body">Choose the correct answer.</span>
      <span className="lesson-style-preview__choices"><i>A</i><i>B</i><i>C</i></span>
    </>}
    {style === 'young' && <>
      <span className="lesson-style-preview__young-head"><b>1</b> Look and choose</span>
      <span className="lesson-style-preview__pictures"><i>★</i><i>●</i><i>◆</i></span>
      <span className="lesson-style-preview__body">Which one is right?</span>
    </>}
    {style === 'teen' && <>
      <span className="lesson-style-preview__heading">What would you do?</span>
      <span className="lesson-style-preview__rule" />
      <span className="lesson-style-preview__body">1&nbsp; Talk it through. Then choose.</span>
      <span className="lesson-style-preview__choices"><i>A</i><i>B</i><i>C</i></span>
    </>}
  </span>;
}

export function LessonStylePicker({ value, onChange }: { value: LessonStyle; onChange: (value: LessonStyle) => void }) {
  return <fieldset className="lesson-style-picker">
    <legend>Lesson style</legend>
    <div className="lesson-style-options">
      {styles.map(style => <label className={`lesson-style-option${value === style.value ? ' selected' : ''}`} key={style.value}>
        <input type="radio" name="lesson-style" value={style.value} aria-label={style.label} checked={value === style.value} onChange={() => onChange(style.value)} />
        <StylePreview style={style.value} />
        <span className="lesson-style-option__label">{style.label}</span>
      </label>)}
    </div>
    <span className="hint">Changes how lessons and PDFs look. Lesson content and saved answers stay the same.</span>
  </fieldset>;
}
