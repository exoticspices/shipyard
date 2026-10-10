// Mash Space in single + fleet view; report geometry count, heap, frame timing. Also exercise download buttons.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve('out') }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve('out') }));
await page.goto('http://127.0.0.1:8123/#s=kestrel-4821&c=hauler&t=l', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__shipyard && window.__shipyard.ready');
const stat = () => page.evaluate(() => { window.gc && window.gc(); const i = window.__shipyard.stage.renderer.info; return { geos: i.memory.geometries, tex: i.memory.textures, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }; });
console.log('start', await stat());
for (const view of ['ship', 'fleet']) {
  await page.evaluate((v) => window.__shipyard.app.set({ view: v }), view);
  const t0 = Date.now();
  for (let i = 0; i < (view === 'ship' ? 150 : 25); i++) {
    await page.keyboard.press('Space');
    if (i % 5 === 0) await page.keyboard.press(String(1 + (i % 6)));
  }
  await new Promise((r) => setTimeout(r, 500));
  console.log(view, 'after mashing', await stat(), `${Date.now() - t0}ms wall`);
}
// generation timing distribution (pure generation, no render)
const timing = await page.evaluate(async () => {
  const { generateShip, CLASSES } = await import('./src/ships/index.js');
  const out = {};
  for (const c of CLASSES) { let worst = 0, sum = 0; for (let i = 0; i < 30; i++) { const r = generateShip({ seed: 'perf-' + i, cls: c.id, tier: i % 3 }); worst = Math.max(worst, r.ms); sum += r.ms; Object.values(r.geometries).forEach((g) => g.dispose()); } out[c.id] = `avg ${(sum / 30).toFixed(1)} / worst ${worst.toFixed(1)} ms`; }
  return out;
});
console.log('generation', timing);
// buttons
await page.evaluate(() => window.__shipyard.app.set({ view: 'ship', seed: 'kestrel-4821', cls: 'miner', tier: 1 }));
await page.click('#glbBtn');
await page.click('#pngBtn');
await new Promise((r) => setTimeout(r, 2500));
console.log('toast:', await page.$eval('#toast', (e) => e.textContent), '| hash:', await page.evaluate(() => location.hash));
await page.click('#zipBtn');
await page.waitForFunction(() => /Saved .*fleet.zip/.test(document.getElementById('toast').textContent), { timeout: 60000 }).catch(() => logs.push('zip toast never appeared'));
console.log('zip toast:', await page.$eval('#toast', (e) => e.textContent));
console.log(logs.length ? 'console:\n  ' + [...new Set(logs)].join('\n  ') : 'console clean');
await browser.close();
