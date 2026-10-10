import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });
await page.goto('http://127.0.0.1:8123/#s=kestrel-4821&c=hauler&t=l', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__shipyard && window.__shipyard.ready');
for (let round = 0; round < 4; round++) {
  await page.evaluate(() => { for (let i = 0; i < 100; i++) window.__shipyard.app.newSeed(); });
  await new Promise((r) => setTimeout(r, 300));
  const s = await page.evaluate(() => { window.gc(); window.gc(); const i = window.__shipyard.stage.renderer.info; return { geos: i.memory.geometries, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }; });
  console.log('after', (round + 1) * 100, s);
}
await browser.close();
