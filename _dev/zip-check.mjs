// Pulls the fleet .zip out of the running app and validates it independently
// (zlib.crc32 for CRCs, every entry must be a valid GLB container).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import zlib from 'node:zlib';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const cases = process.argv[2] ? process.argv.slice(2) : ['s=kestrel-4821&c=corvette&t=l', 's=swift-4410&c=racer&t=s'];
let bad = 0;
for (const c of cases) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8123/#' + c, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__shipyard && window.__shipyard.ready');
  const { name, b64 } = await page.evaluate(() => window.__shipyard.fleetZipBase64());
  await page.close();
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync('out/' + name, buf);
  const errs = [];
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd !== buf.length - 22) errs.push('eocd');
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
  if (cdOff + cdSize !== eocd) errs.push('cd bounds');
  let p = cdOff;
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) { errs.push('cd sig ' + i); break; }
    const crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), lho = buf.readUInt32LE(p + 42);
    const fname = buf.toString('utf8', p + 46, p + 46 + nl);
    if (buf.readUInt32LE(lho) !== 0x04034b50) errs.push('local sig ' + fname);
    const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
    const data = buf.subarray(lho + 30 + lnl + lel, lho + 30 + lnl + lel + size);
    if (zlib.crc32(data) >>> 0 !== crc) errs.push('crc ' + fname);
    if (fname.endsWith('.glb') && (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(8) !== data.length)) errs.push('glb ' + fname);
    names.push(`${fname}(${(size / 1024).toFixed(0)}K)`);
    p += 46 + nl;
  }
  if (errs.length) bad++;
  console.log(`${name} ${(buf.length / 1024).toFixed(0)}KB ${count} entries ${errs.length ? 'ERRORS: ' + errs.join('; ') : 'OK'}\n   ${names.join(' ')}`);
}
await browser.close();
console.log(bad ? `${bad} BAD` : 'all zips valid');
