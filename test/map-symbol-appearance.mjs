import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = async entry => (await build({ entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: entry.includes('MapToolIcons') ? 'ToolIcons' : 'Figures' })).outputFiles[0].text;

test('plain and shaded map symbols retain their chosen colour through the shared export renderer', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas width="1000" height="720"></canvas>');
    await page.addScriptTag({ content: await bundle('src/design/figures.ts') });
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const render = (icon, style, color) => {
        const figure = JSON.parse(JSON.stringify({ kind: 'map', title: '', items: [{ id: 'test', kind: 'icon', icon, x: .5, y: .5, w: .1, h: .1, iconStyle: style, iconColor: color }] }));
        Figures.drawMap(ctx, figure);
        const image = ctx.getImageData(455, 328, 90, 90).data;
        let warm = 0, cool = 0, tinted = 0;
        for (let i = 0; i < image.length; i += 4) {
          const [r,g,b] = [image[i],image[i+1],image[i+2]];
          if (r > g + 20 && r > b + 20) warm++;
          if (b > r + 20 && b > g + 10) cool++;
          if (Math.max(r,g,b) - Math.min(r,g,b) > 15) tinted++;
        }
        return { warm, cool, tinted };
      };
      return Object.fromEntries(['tree', 'shade', 'skate'].map(icon => [icon, {
        plainRed: render(icon, 'plain', '#c34c4c'),
        shadedRed: render(icon, 'shaded', '#c34c4c'),
        plainBlue: render(icon, 'plain', '#305ab6'),
        shadedBlue: render(icon, 'shaded', '#305ab6'),
      }]));
    });
    for (const [icon, result] of Object.entries(pixels)) {
      assert.ok(result.plainRed.warm > 30, `${icon}: plain symbol must use the selected red`);
      assert.ok(result.plainBlue.cool > 30, `${icon}: plain symbol must use the selected blue`);
      assert.ok(result.shadedRed.tinted > result.plainRed.tinted + 1000, `${icon}: shaded symbol needs a visible tinted background: ${JSON.stringify(result)}`);
      assert.ok(result.shadedBlue.tinted > result.plainBlue.tinted + 1000, `${icon}: shaded background must use the selected colour`);
      assert.ok(result.plainRed.tinted < result.shadedRed.tinted, `${icon}: plain symbol must have no shaded background`);
    }
  } finally { await browser.close(); }
});

test('every drawing and placement tool has its own visible vector artwork', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: await bundle('src/design/MapToolIcons.tsx') });
    const result = await page.evaluate(() => {
      const keys = ['road','river','footpath','wall','fence','zone','building','room','water','roundabout','tree','gate','bridge','compass','icon','marker','label'];
      return keys.map(kind => {
        const icon = ToolIcons.MapToolIcon({ kind, size: 20 });
        return { kind, width: icon.props.width, paths: icon.props.children.map(child => child.props.d) };
      });
    });
    assert.equal(result.length, 17);
    assert.equal(new Set(result.map(item => item.paths.join('|'))).size, result.length);
    for (const item of result) {
      assert.equal(item.width, 20);
      assert.ok(item.paths.length && item.paths.every(path => path.length > 4), `${item.kind} is missing artwork`);
    }
  } finally { await browser.close(); }
});
