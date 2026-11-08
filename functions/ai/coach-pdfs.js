import { documentCandidateScore, relevantDocumentExcerpt } from './coach-forms.js';
import { relevantWriting } from './coach-context.js';

export function pdfAccess(file, uid) {
  return !!file && file.kind === 'pdf' && !file.deletedAt && !file.purgeRequestedAt && !file.purgingAt
    && (file.owner === uid || (Array.isArray(file.memberIds) && file.memberIds.includes(uid)));
}

export async function extractPdfText(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  try {
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
      if (text) pages.push(`Page ${i}: ${text}`);
      if (pages.join('\n').length >= 120000) break;
    }
    return pages.join('\n').slice(0, 120000);
  } finally { await pdf.destroy(); }
}

export async function readPdfText(file, { extract = extractPdfText } = {}) {
  const info = await file.ref.collection('pdf').doc('info').get();
  const count = Number(info.get('parts') || 0);
  if (!Number.isInteger(count) || count < 1 || count > 70 || Number(info.get('bytes') || 0) > 30 * 1024 * 1024) throw Error('Invalid PDF size');
  const parts = await Promise.all(Array.from({ length: count }, (_, i) => file.ref.collection('pdf').doc('p' + i).get()));
  if (parts.some((part, i) => !part.exists || part.get('part') !== i || typeof part.get('data') !== 'string')) throw Error('Incomplete PDF');
  return extract(Buffer.concat(parts.map(part => Buffer.from(part.get('data'), 'base64'))));
}

export async function findTeacherPdfs(db, uid, prompt, { read = readPdfText } = {}) {
  const [owned, shared] = await Promise.all([
    db.collection('sharedDocs').where('owner', '==', uid).get(),
    db.collection('sharedDocs').where('memberIds', 'array-contains', uid).get(),
  ]);
  const files = [...new Map([...owned.docs, ...shared.docs].map(s => [s.id, s])).values()]
    .filter(s => pdfAccess(s.data(), uid));
  const ranked = files.sort((a, b) => documentCandidateScore(prompt, b.data()) - documentCandidateScore(prompt, a.data()));
  const candidates = [...new Map([...ranked.filter(s => s.get('coachIndex')?.version !== 1).slice(0, 2), ...ranked.slice(0, 4)].map(s => [s.id, s])).values()].slice(0, 6);
  const rows = []; let skipped = 0;
  for (const file of candidates) {
    try {
      const text = await read(file);
      if (!text.trim()) { skipped++; continue; }
      rows.push({ id: file.id, title: String(file.get('title') || 'PDF').slice(0, 160), text: relevantDocumentExcerpt(text, prompt, 3200), at: file.get('updatedAt')?.toMillis?.() || 0 });
      if (file.get('coachIndex')?.version !== 1) await file.ref.update({ coachIndex: { version: 1, preview: text.slice(0, 1800), forms: text.slice(1800, 6000) } }).catch(() => {});
    } catch { skipped++; }
  }
  return { pdfs: relevantWriting(rows, prompt, 2).map(({ at, ...row }) => row), scope: `Considered ${files.length} accessible PDFs in Resources; read ${candidates.length - skipped} and skipped ${skipped} unavailable or image-only files. Text from scanned pages may not be searchable.` };
}
