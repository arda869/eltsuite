import type { LessonStyle } from '../lib/lessonStyle';

export function LessonStylePicker({ value, onChange }: { value: LessonStyle; onChange: (value: LessonStyle) => void }) {
  return <label className="field">
    Lesson style
    <select value={value} onChange={e => onChange(e.target.value as LessonStyle)}>
      <option value="adult">Adult</option>
      <option value="young">Young learner</option>
    </select>
    <span className="hint">Changes how lessons and PDFs look. Lesson content and saved answers stay the same.</span>
  </label>;
}
