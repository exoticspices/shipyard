// Headless screenshots + console capture. usage: node shoot.mjs name=hash[@WxH] ...
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8123/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const jobs = process.argv.slice(2);
for (const job of jobs) {
  const i0 = job.indexOf('='); const name = job.slice(0, i0), rest = job.slice(i0 + 1);
  let [hash, size] = (rest || '').split('@');
  const [w, h] = (size || '1400x900').split('x').map(Number);
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => logs.push('reqfail: ' + r.url()));
  await page.goto(BASE + '#' + hash, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__shipyard && window.__shipyard.ready', { timeout: 20000 }).catch(() => logs.push('NOT READY'));
  if (process.env.EVAL) await page.evaluate(process.env.EVAL);
  await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 2500)));
  const info = await page.evaluate(() => window.__shipyard?.info?.()).catch(() => null);
  await page.screenshot({ path: `screens/${name}.png` });
  console.log(name, JSON.stringify(info), logs.length ? '\n  ' + logs.join('\n  ') : '');
  await page.close();
}
await browser.close();
