// Copy the locked, locally installed OCR engine and its English model into public/ocr, so reading
// a scanned PDF happens in the teacher's browser: no page is sent to a service.
import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url), out = new URL('public/ocr/', root);
await mkdir(out, { recursive: true });
const copy = (from, to) => copyFile(new URL('node_modules/' + from, root), new URL(to, out));
await copy('tesseract.js/dist/worker.min.js', 'worker.min.js');
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.js', 'tesseract-core-simd-lstm.js']) await copy('tesseract.js-core/' + f, f);
await copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz');
await copy('tesseract.js/LICENSE.md', 'tesseract.js-LICENSE.md').catch(() => copy('tesseract.js/LICENSE', 'tesseract.js-LICENSE'));
await copy('tesseract.js-core/LICENSE', 'tesseract.js-core-LICENSE').catch(() => {});
