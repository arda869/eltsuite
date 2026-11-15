import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundled = await build({
  stdin: {
    contents: `import { drawChart } from './src/design/figures.ts'; window.drawChart = drawChart;`,
    resolveDir: process.cwd(),
    sourcefile: 'chart-legend-probe.ts',
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  write: false,
});

test('three-row chart legend stays clear of the footnote and plot', async () => {
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 850, height: 620 } });
    await page.setContent('<canvas width="800" height="560"></canvas>');
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    const calls = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const g = canvas.getContext('2d');
      const draws = [];
      const original = g.fillText.bind(g);
      g.fillText = (text, x, y, maxWidth) => {
        draws.push({ text, x, y, font: g.font });
        return original(text, x, y, maxWidth);
      };
      window.drawChart(g, {
        kind: 'chart', chart: 'lines', title: 'A chart with many series',
        categories: ['2021', '2022', '2023'],
        series: Array.from({ length: 9 }, (_, i) => ({
          name: `Long series label number ${i + 1}`,
          values: [i + 1, i + 2, i + 3],
          color: '#443a40',
        })),
        max: 20, step: 5, xLabel: 'Year', footnote: 'Figures are illustrative.',
      });
      return draws;
    });
    const legends = calls.filter(item => item.text.startsWith('Long series label number '));
    const rowYs = [...new Set(legends.map(item => item.y))].sort((a, b) => a - b);
    assert.equal(legends.length, 9);
    assert.ok(rowYs.length >= 3, 'the fixture must make at least three legend rows');
    const footnote = calls.find(item => item.text === 'Figures are illustrative.');
    const axis = calls.find(item => item.text === 'Year');
    const tick = calls.find(item => item.text === '2022');
    assert.ok(footnote && axis);
    assert.ok(tick && axis.y - tick.y >= 18, 'the horizontal axis label should clear tick labels');
    assert.ok(rowYs[0] - axis.y >= 25, 'the legend should clear the horizontal axis label');
    assert.ok(footnote.y - rowYs.at(-1) >= 18, 'the last legend row should clear the footnote');
    assert.ok(rowYs.at(-1) <= 523, 'the last legend row should remain inside the canvas');
    if (process.env.CHART_LEGEND_SCREENSHOT) {
      await page.locator('canvas').screenshot({ path: process.env.CHART_LEGEND_SCREENSHOT });
    }
    const pieCalls = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const g = canvas.getContext('2d');
      const draws = [];
      const original = g.fillText.bind(g);
      g.fillText = (text, x, y, maxWidth) => {
        draws.push({ text, y });
        return original(text, x, y, maxWidth);
      };
      g.clearRect(0, 0, 800, 560);
      window.drawChart(g, {
        kind: 'chart', chart: 'pie', title: 'A pie with many categories',
        categories: Array.from({ length: 9 }, (_, i) => `Long category name ${i + 1}`),
        series: [{ name: 'Pie group', values: Array(9).fill(1), color: '#443a40' }],
        footnote: 'Source: sample figures.',
      });
      return draws;
    });
    const pieRows = [...new Set(pieCalls.filter(item => item.text.startsWith('Long category name ')).map(item => item.y))].sort((a, b) => a - b);
    assert.ok(pieRows.length >= 3, 'the pie fixture must make at least three legend rows');
    assert.ok(pieRows[0] - pieCalls.find(item => item.text === 'Pie group').y >= 25, 'pie labels should clear the legend');
    assert.ok(pieCalls.find(item => item.text === 'Source: sample figures.').y - pieRows.at(-1) >= 18, 'the pie legend should clear the footnote');
    await page.close();
  } finally {
    await browser.close();
  }
});
