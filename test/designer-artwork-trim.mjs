import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { build } from 'esbuild';

// Render the app's native editable figures without opening a browser or using mock artwork.
globalThis.Path2D = Path2D;
const sourceModule = async (entry) => {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
};
const [{ drawFigure }, { artworkBounds }] = await Promise.all([
  sourceModule('src/design/figures.ts'),
  sourceModule('src/design/trimArtwork.ts'),
]);
const white = [255, 255, 255, 255];
const scan = (canvas) => artworkBounds(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, white);
const saveCrop = async (canvas, bounds, name) => {
  const cropped = createCanvas(bounds.w, bounds.h);
  cropped.getContext('2d').drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
  await writeFile(`/tmp/${name}.png`, cropped.toBuffer('image/png'));
};

const mapPage = createCanvas(1400, 1100);
const mapContext = mapPage.getContext('2d');
mapContext.fillStyle = '#fff';
mapContext.fillRect(0, 0, mapPage.width, mapPage.height);
mapContext.save();
mapContext.translate(240, 210);
drawFigure(mapContext, {
  kind: 'map', title: 'Riverside Park', showBorder: true, items: [
    { id: 'river', kind: 'river', points: [{ x: 0, y: .2 }, { x: .4, y: .25 }, { x: 1, y: .2 }], label: 'River' },
    { id: 'tree', kind: 'icon', icon: 'tree', iconStyle: 'plain', iconColor: '#73578f', label: 'Tree', x: .3, y: .58, w: .08, h: .08 },
  ],
}, 900, 648);
mapContext.restore();
const mapBounds = scan(mapPage);
assert(mapBounds, 'A map figure should have detectable artwork');
assert(mapBounds.x > 150 && mapBounds.y > 140, 'The empty page margins around a map should be removed');
assert(mapBounds.w * mapBounds.h < mapPage.width * mapPage.height * .6, 'The map title, border and drawing should fit closely');
await saveCrop(mapPage, mapBounds, 'elt-designer-map-trim-local');

const comboPage = createCanvas(1300, 1900);
const comboContext = comboPage.getContext('2d');
comboContext.fillStyle = '#fff';
comboContext.fillRect(0, 0, comboPage.width, comboPage.height);
const bars = { kind: 'chart', chart: 'bars', title: 'Weekly spending', categories: ['Food', 'Housing', 'Travel'], series: [{ name: '1968', values: [35, 10, 8], color: '#725687' }, { name: '2018', values: [17, 19, 14], color: '#5f9ca7' }] };
const table = { kind: 'chart', chart: 'table', title: 'Police budget sources', categories: ['Government', 'Local taxes', 'Other sources'], series: [{ name: '2017', values: [175.5, 91.2, 38], color: '#725687' }, { name: '2018', values: [177.8, 102.3, 38.5], color: '#5f9ca7' }], unit: 'm' };
comboContext.save();
comboContext.translate(150, 100);
drawFigure(comboContext, bars, 1000, 700);
comboContext.restore();
comboContext.save();
comboContext.translate(150, 1020);
drawFigure(comboContext, table, 1000, 700);
comboContext.restore();
const comboBounds = scan(comboPage);
assert(comboBounds, 'A chart and table should have detectable artwork');
assert(comboBounds.y < 180 && comboBounds.y + comboBounds.h > 1350, 'The trim must preserve both figures and the space between them');
assert(comboBounds.x > 100 && comboBounds.x + comboBounds.w < 1200, 'The trim should remove only unused outer margins');
await saveCrop(comboPage, comboBounds, 'elt-designer-chart-table-trim-local');

const blank = createCanvas(400, 300);
blank.getContext('2d').fillStyle = '#fff';
blank.getContext('2d').fillRect(0, 0, 400, 300);
assert.equal(scan(blank), null, 'Blank pages should keep their full page');
const fullBleed = createCanvas(400, 300);
fullBleed.getContext('2d').fillStyle = '#73578f';
fullBleed.getContext('2d').fillRect(0, 0, 400, 300);
assert.equal(scan(fullBleed), null, 'A full-bleed design should keep its whole composition');
console.log('PASS: native map and chart/table render bounds trim only unused margins; blank pages remain whole');
