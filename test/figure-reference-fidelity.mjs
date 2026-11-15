import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = async (entry, name) => (await build({
  entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: name,
})).outputFiles[0].text;

test('castle starter exports a visible bridge and change tables keep their entered values', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas width="1000" height="720"></canvas>');
    await page.addScriptTag({ content: await bundle('src/design/figures.ts', 'Figures') });
    await page.addScriptTag({ content: await bundle('src/design/figureTemplates.ts', 'Presets') });
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const castle = Presets.MAP_PRESETS.find(p => p.id === 'castle').figure;
      const bridge = castle.items.find(item => item.kind === 'bridge');
      const point = bridge?.points?.[0];
      let bridgeInk = false;
      if (point) {
        const x = Math.round(40 + (point.x + .02) * 920);
        const y = Math.round(88 + point.y * 570);
        Figures.drawMap(ctx, { ...castle, items: [] });
        const before = [...ctx.getImageData(x, y, 1, 1).data];
        Figures.drawMap(ctx, { ...castle, items: [bridge] });
        const after = [...ctx.getImageData(x, y, 1, 1).data];
        bridgeInk = before.slice(0, 3).every((value, i) => value - after[i] > 20);
      }

      const table = Presets.CHART_COMBINATIONS.find(p => p.id === 'export-change').bottom;
      const labels = [];
      const fillText = ctx.fillText.bind(ctx);
      ctx.fillText = (value, ...args) => { labels.push(String(value)); fillText(value, ...args); };
      Figures.drawChart(ctx, table);
      return { bridgeHasPath: !!point && bridge.points.length >= 2, bridgeInk, labels };
    });
    assert.ok(result.bridgeHasPath, 'the castle bridge needs a drawable route, not just a label');
    assert.ok(result.bridgeInk, 'the shared map export renderer needs visible bridge artwork');
    for (const value of ['3%', '8.5%', '-5.18%', '0.81%', '15.24%']) {
      assert.ok(result.labels.includes(value), `change table lost the entered value ${value}`);
    }
  } finally { await browser.close(); }
});
