import { docxBlob, docBodyHtml, prepareDocumentPrint, documentStats, EXPORT_DEFAULT } from '../src/collab/export';
import { LAYOUT_DEFAULT } from '../src/collab/documentLayout';
import { unzipSync, strFromU8 } from 'fflate';
import { htmlToPdf } from '../src/lib/folderExport';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { PageBreak, DocumentSection, DocumentIndent, insertDocumentSection, changeIndent } from '../src/collab/DocumentStructure';
import { FontStyle } from '../src/collab/pages';
const status = document.querySelector('pre')!;
const results: string[] = [];
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); results.push(message); };
try {
  const layout = { ...LAYOUT_DEFAULT, orientation: 'landscape' as const, columns: 2, header: 'Research notes', footer: 'ELT course', pageNumbers: true, pageNumberStart: 4 };
  const json = { type: 'doc', content: [
    { type: 'paragraph', attrs: { indent: 2 }, content: [{ type: 'text', text: 'Read', marks: [{ type: 'bold' }] }, { type: 'text', text: 'ing notes', marks: [{ type: 'fontStyle', attrs: { family: 'Consolas', pt: 18 } }] }] },
    { type: 'docPageBreak' },
    { type: 'docSection', attrs: { columns: 3, newPage: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New section' }] }] },
  ] };
  const opts = { ...EXPORT_DEFAULT, layout };
  assert(documentStats(json).words === 4, 'Words split by formatting are counted once');
  const blob = await docxBlob(json, 'Document tools', opts);
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = strFromU8(zip['word/document.xml']);
  assert(xml.includes('w:orient="landscape"') && xml.includes('w:w="16845"'), 'Word uses landscape A4 page dimensions');
  assert(xml.includes('w:num="3"') && xml.includes('w:num="2"'), 'Word preserves document and section columns');
  assert(xml.includes('w:pageBreakBefore'), 'Word preserves page breaks');
  assert(xml.includes('Consolas') && xml.includes('w:val="36"'), 'Word preserves selected font and 18 pt text');
  assert(xml.includes('w:left="1440"'), 'Word preserves paragraph indentation');
  const headers = Object.entries(zip).filter(([path]) => /word\/header/.test(path)).map(([, data]) => strFromU8(data)).join('');
  const footers = Object.entries(zip).filter(([path]) => /word\/footer/.test(path)).map(([, data]) => strFromU8(data)).join('');
  assert(headers.includes('Research notes') && footers.includes('ELT course') && footers.includes('PAGE'), 'Word preserves headers, footers and page-number fields');
  assert(xml.includes('w:start="4"'), 'Word preserves starting page number');
  const editor = new Editor({ extensions: [StarterKit, PageBreak, DocumentSection, DocumentIndent, FontStyle], content: '<p>First paragraph</p><p>Second paragraph</p>' });
  editor.commands.setTextSelection(4);
  assert(changeIndent(editor, 1) && editor.getJSON().content?.[0].attrs?.indent === 1, 'Indent command updates the selected paragraph');
  assert(insertDocumentSection(editor, 2) && editor.getJSON().content?.some((n) => n.type === 'docSection'), 'Section break preserves text in a new section');
  assert(editor.getText().replace(/\s/g, '').includes('FirstparagraphSecondparagraph'), 'Section insertion keeps all surrounding text');
  editor.destroy();
  const question = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'I ' }, { type: 'gap', attrs: { id: 'export-gap', answers: ['secret-answer'] } }, { type: 'text', text: ' English.' }] }] };
  await prepareDocumentPrint(question);
  const questionHtml = docBodyHtml(question, 'Worksheet', opts);
  assert(questionHtml.includes('class="blank"') && !questionHtml.includes('secret-answer'), 'Inline questions print as answer blanks without revealing the key');
  const pdf = await htmlToPdf(docBodyHtml(json, 'Document tools', opts), null, layout);
  const pdfText = new TextDecoder('latin1').decode(pdf);
  assert(pdfText.includes('/MediaBox [0 0 842.25 595.5]'), 'PDF uses the selected landscape page size');
  assert((pdfText.match(/\/Type \/Page\b/g) ?? []).length >= 2, 'PDF honours explicit page and section breaks');
  status.textContent = 'PASS\n' + results.join('\n');
  document.documentElement.dataset.result = 'pass';
} catch (error) {
  status.textContent = 'FAIL\n' + (error instanceof Error ? error.stack : String(error)) + '\nPassed so far:\n' + results.join('\n');
  document.documentElement.dataset.result = 'fail';
}
