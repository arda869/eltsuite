import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/pages/timetable/dates.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { span, step, spanTitle } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
for (const zone of ['Asia/Hong_Kong', 'America/New_York', 'Europe/London']) {
  process.env.TZ = zone;
  for (const date of ['2026-10-30T12:00:00', '2026-12-31T12:00:00', '2026-03-07T12:00:00', '2026-10-24T12:00:00']) {
    const anchor = +new Date(date);
    const range = span('three-days', anchor);
    assert.equal(range.days.length, 3);
    assert.equal(range.from, range.days[0]);
    for (let i = 0; i < 3; i++) {
      const expected = new Date(anchor);
      expected.setHours(0, 0, 0, 0);
      expected.setDate(expected.getDate() + i);
      assert.equal(range.days[i], +expected, `${zone}: consecutive local dates`);
      assert.equal(new Date(range.days[i]).getHours(), 0);
    }
    assert.equal(span('three-days', step('three-days', anchor, 1)).from, range.to);
    assert.equal(step('three-days', step('three-days', anchor, 1), -1), anchor);
    assert.ok(spanTitle('three-days', anchor, true).length);
  }
}
console.log('Three-day calendar date boundaries passed in 3 time zones, including DST and year changes.');
