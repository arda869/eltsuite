import type { SharedDoc } from '../lib/sharedDocs';
export const isImageFile = (d: SharedDoc) => d.kind==='file' && (/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(d.file?.type??'') || /\.(png|jpe?g|webp|gif|svg)$/i.test(d.file?.name??''));
