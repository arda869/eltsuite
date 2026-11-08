import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { extractPdfText, findTeacherPdfs, pdfAccess } from '../../functions/ai/coach-pdfs.js';

test('a PDF in Resources yields searchable text across pages', async () => {
  const source = new jsPDF();
  source.text('Holiday planning and listening practice', 15, 20);
  source.addPage();
  source.text('Reading a short travel dialogue', 15, 20);
  const text = await extractPdfText(Buffer.from(source.output('arraybuffer')));
  assert.match(text, /Page 1: Holiday planning/);
  assert.match(text, /Page 2: Reading a short travel dialogue/);
});

test('Companion reads only accessible PDFs and does not reuse revoked sources', async () => {
  const rows = [
    { id: 'holiday', value: { kind: 'pdf', owner: 'teacher', title: 'Holiday listening' } },
    { id: 'shared', value: { kind: 'pdf', owner: 'other', memberIds: ['teacher'], title: 'Travel dialogue' } },
    { id: 'revoked', value: { kind: 'pdf', owner: 'other', memberIds: [], title: 'Private journal' } },
    { id: 'trashed', value: { kind: 'pdf', owner: 'teacher', deletedAt: 1, title: 'Old exam' } },
  ].map(row => ({ id: row.id, data: () => row.value, get: key => row.value[key], ref: { update: async () => {} } }));
  const db = { collection: () => ({ where: (field) => ({ get: async () => ({ docs: rows.filter(row => field === 'owner' ? row.data().owner === 'teacher' : row.data().memberIds?.includes('teacher')) }) }) }) };
  const opened = [];
  const result = await findTeacherPdfs(db, 'teacher', 'holiday listening', { read: async row => { opened.push(row.id); return row.id === 'holiday' ? 'Page 1: Holiday listening practice' : 'Page 1: Dialogue about travel'; } });
  assert.deepEqual(new Set(opened), new Set(['holiday', 'shared']));
  assert.equal(result.pdfs[0].title, 'Holiday listening');
  assert.equal(result.pdfs.some(row => row.id === 'revoked' || row.id === 'trashed'), false);
  assert.equal(pdfAccess(rows[2].data(), 'teacher'), false);
});
