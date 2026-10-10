// Regenerates ../og.png (1200x630 social card): Tiers view of a corvette, UI hidden, camera tightened.
import puppeteer from 'puppeteer-core';
const HASH = process.argv[2] || 's=bastion-2210&c=corvette&t=m&v=tiers&l=industrial&ui=0';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/#' + HASH, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__shipyard && window.__shipyard.ready');
await page.evaluate(() => {
  const s = window.__shipyard.stage;
  s.anim = null;
  const b = s.contentBox, c = b.getCenter(b.min.clone());
  c.y *= 0.6;
  const dir = s.camera.position.clone().sub(s.controls.target);
  s.controls.target.copy(c);
  s.camera.position.copy(c).add(dir.multiplyScalar(0.74));
  s.controls.update();
  s.dirty = true;
});
await new Promise((r) => setTimeout(r, 1800));
await page.screenshot({ path: '../og.png' });
await browser.close();
console.log('wrote og.png');
