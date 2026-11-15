import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const result = await build({ entryPoints: ['src/design/mapSymbols.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { MAP_SYMBOLS, MAP_SYMBOL_CATEGORIES, mapSymbolGlyph } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const LEGACY_KEYS = ['tree', 'café', 'toilets', 'parking', 'playground', 'school', 'medical', 'shop', 'atm', 'train', 'car', 'plane', 'checkin', 'baggage', 'tower', 'castle', 'museum', 'factory', 'house', 'field', 'tennis', 'gym', 'flower', 'pond', 'bridge', 'gate', 'bus', 'information', 'sculpture', 'food', 'office', 'reception', 'restaurant', 'picnic', 'hotel', 'camping', 'warehouse', 'bank', 'post', 'library', 'pharmacy', 'hospital', 'police', 'fire', 'security', 'passport', 'customs', 'arrival', 'departure', 'ticket', 'ferry', 'rail', 'tram', 'bike', 'charging', 'petrol', 'taxi', 'walkway', 'stairs', 'lift', 'accessible', 'entrance', 'exit', 'emergency', 'firstaid', 'drinking', 'garden', 'forest', 'lake', 'river', 'beach', 'mountain', 'waterfall', 'fountain', 'bench', 'bin', 'notice', 'viewpoint', 'maze', 'skate', 'cricket', 'football', 'basketball', 'pool', 'stadium', 'zoo', 'aquarium', 'cinema', 'theatre', 'gallery', 'temple', 'church', 'monument', 'exhibit', 'meeting', 'boardroom', 'coffee', 'classroom', 'lab', 'courtyard', 'roundabout', 'north'];
const source = await readFile('src/design/mapSymbolInventory.tsv', 'utf8');
const inventory = source.trim().split('\n').slice(1).filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));

test('the reviewed symbol inventory stays in sync with its documentation', async () => {
  const documentation = await readFile('docs/map-symbol-inventory.md', 'utf8');
  for (const [index, [key, name, category, glyph, feature]] of inventory.entries()) {
    assert.ok(documentation.includes(`| ${index + 1} | ${category} | ${name} (\`${key}\`) | ${glyph} | ${feature} |`), `${key} documentation is stale`);
  }
});

// The entire named catalogue must resolve to its own, printable vector artwork.
test('all map symbols have unique keys, explicit pictograms and one valid category', () => {
  assert.ok(MAP_SYMBOLS.length >= 200);
  assert.equal(MAP_SYMBOLS.length, inventory.length);
  assert.equal(new Set(MAP_SYMBOLS.map(s => s.key)).size, MAP_SYMBOLS.length);
  for (const key of LEGACY_KEYS) assert.ok(MAP_SYMBOLS.some(symbol => symbol.key === key), `Original map symbol removed: ${key}`);
  const shapes = MAP_SYMBOLS.map(s => JSON.stringify([s.glyph.viewBox, s.glyph.paths, s.glyph.text || '']));
  assert.equal(new Set(shapes).size, shapes.length, 'Every map place needs visually distinct artwork');
  assert.equal(new Set(inventory.map(row => row[3])).size, MAP_SYMBOLS.length, 'No two map places should quietly share the same icon');
  const groups = new Map(MAP_SYMBOL_CATEGORIES.map(c => [c.key, c]));
  assert.ok(groups.size >= 9);
  for (const [key, name, category, sourceId, note] of inventory) {
    const symbol = MAP_SYMBOLS.find(s => s.key === key);
    assert.ok(symbol, key);
    assert.equal(symbol.name, name);
    assert.equal(symbol.category, category);
    assert.equal(symbol.glyph.source, sourceId);
    assert.ok(note.length >= 12, `${key} needs a visual audit note`);
    assert.ok(groups.get(category)?.keys.includes(key), `${key} missing from category`);
    assert.equal(groups.get(category).keys.filter(value => value === key).length, 1);
    const glyph = mapSymbolGlyph(key);
    assert.ok(glyph.viewBox === 24 || glyph.viewBox === 48);
    assert.ok(glyph.paths.length && glyph.paths.every(path => path.length >= 4), key);
    assert.notEqual(glyph.source, 'legacy:unknown');
  }
  assert.equal(mapSymbolGlyph('an-old-icon-key').source, 'legacy:unknown');
});

// These assignments are independently checked against common map meanings.
test('critical places remain in the correct map categories', () => {
  const expected = {
    pond: 'nature', lake: 'nature', river: 'nature', forest: 'nature',
    car: 'transport', taxi: 'transport', train: 'transport', tram: 'transport',
    hospital: 'services', pharmacy: 'services', bank: 'services',
    fire: 'safety', emergency: 'safety', firstaid: 'safety',
    school: 'education', library: 'education',
    castle: 'heritage', museum: 'heritage', gallery: 'heritage', temple: 'heritage',
    football: 'sports', tennis: 'sports', cricket: 'sports',
    entrance: 'wayfinding', exit: 'wayfinding', north: 'wayfinding',
  };
  for (const [key, category] of Object.entries(expected)) {
    assert.equal(MAP_SYMBOLS.find(s => s.key === key)?.category, category, key);
  }
});

test('post office and library stay visually distinct from nearby symbols', () => {
  const byKey = key => MAP_SYMBOLS.find(symbol => symbol.key === key);
  const postOffice = byKey('post');
  const postBox = byKey('postbox');
  const library = byKey('library');
  const readingRoom = byKey('reading');
  assert.equal(postOffice?.glyph.source, 'bespoke:postoffice', 'Post office needs a building, not a street mailbox');
  assert.equal(library?.glyph.source, 'bespoke:library', 'Library needs recognisable books at picker size');
  assert.notDeepEqual(postOffice.glyph.paths, postBox.glyph.paths);
  assert.notDeepEqual(library.glyph.paths, readingRoom.glyph.paths);
});

test('shaded area and skateboard ramp keep place-specific pictograms', () => {
  const shade = MAP_SYMBOLS.find(symbol => symbol.key === 'shade');
  const ramp = MAP_SYMBOLS.find(symbol => symbol.key === 'skate');
  assert.equal(shade?.name, 'Shaded area');
  assert.equal(shade?.glyph.source, 'bespoke:shadecanopy');
  assert.equal(ramp?.name, 'Skateboard ramp');
  assert.equal(ramp?.glyph.source, 'bespoke:skateramp');
  assert.notDeepEqual(shade.glyph.paths, ramp.glyph.paths);
});

test('every named symbol renders as an SVG preview and canvas path', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const body = MAP_SYMBOLS.map(s => `<svg data-key="${s.key}" viewBox="0 0 ${s.glyph.viewBox} ${s.glyph.viewBox}" width="48" height="48" fill="none" stroke="black" stroke-width="${s.glyph.viewBox === 24 ? 2 : 2.5}" stroke-linecap="round" stroke-linejoin="round">${s.glyph.paths.map(path => `<path d="${path.replaceAll('"', '&quot;')}"/>`).join('')}${s.glyph.text ? `<text x="24" y="25" fill="black" stroke="none" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="800">${s.glyph.text}</text>` : ''}</svg>`).join('');
    await page.setContent(`<!doctype html><html><body>${body}<canvas width="48" height="48"></canvas></body></html>`);
    const bad = await page.evaluate(() => {
      const failures = [];
      const rendered = [];
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      for (const svg of document.querySelectorAll('svg')) {
        const paths = [...svg.querySelectorAll('path')];
        try {
          const box = svg.getBBox();
          if (!Number.isFinite(box.width) || box.width <= 1 || box.height <= 1) failures.push(`${svg.dataset.key}: invisible SVG`);
          ctx.clearRect(0, 0, 48, 48);
          const viewBox = Number(svg.viewBox.baseVal.width);
          ctx.save(); ctx.scale(48 / viewBox, 48 / viewBox); ctx.lineWidth = viewBox === 24 ? 2 : 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          paths.forEach(path => ctx.stroke(new Path2D(path.getAttribute('d'))));
          const text = svg.querySelector('text');
          if (text) { ctx.font = '800 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.textContent, 24, 25); }
          ctx.restore();
          const pixels = ctx.getImageData(0, 0, 48, 48).data;
          if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) failures.push(`${svg.dataset.key}: empty canvas path`);
          rendered.push({ key: svg.dataset.key, mask: Uint8Array.from({ length: 48 * 48 }, (_, i) => Number(pixels[i * 4 + 3] > 100)) });
        } catch (error) { failures.push(`${svg.dataset.key}: ${error.message}`); }
      }
      for (let i = 0; i < rendered.length; i++) for (let j = i + 1; j < rendered.length; j++) {
        let common = 0, union = 0;
        for (let p = 0; p < 48 * 48; p++) {
          const a = rendered[i].mask[p], b = rendered[j].mask[p];
          if (a && b) common++;
          if (a || b) union++;
        }
        if (common / union > .9) failures.push(`${rendered[i].key} and ${rendered[j].key}: indistinguishable at picker size`);
      }
      return failures;
    });
    assert.deepEqual(bad, []);
  } finally { await browser.close(); }
});
