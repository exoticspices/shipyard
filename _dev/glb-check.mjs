// Pulls GLBs out of the running app via puppeteer, then validates container + content.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const cases = ['s=kestrel-4821&c=corvette&t=l', 's=vega-1234&c=hauler&t=l', 's=lyra-3307&c=surveyor&t=m', 's=quarry-2290&c=miner&t=l', 's=osprey-1180&c=fighter&t=s', 's=swift-4410&c=racer&t=l'];
let bad = 0;
for (const c of cases) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8123/#' + c, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__shipyard && window.__shipyard.ready');
  const b64 = await page.evaluate(() => window.__shipyard.glbBase64());
  const name = await page.evaluate(() => window.__shipyard.app.fileBase());
  await page.close();
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(`out/${name}.glb`, buf);
  const magic = buf.toString('ascii', 0, 4), version = buf.readUInt32LE(4), total = buf.readUInt32LE(8);
  const jlen = buf.readUInt32LE(12), jtype = buf.toString('ascii', 16, 20);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jlen));
  const binLen = buf.readUInt32LE(20 + jlen), binType = buf.toString('ascii', 24 + jlen, 28 + jlen).replace(/\0/g, '');
  const errs = [];
  if (magic !== 'glTF' || version !== 2 || total !== buf.length) errs.push('header');
  if (jtype !== 'JSON' || binType !== 'BIN') errs.push('chunks');
  const mats = json.materials.map((m) => m.name);
  const meshInfo = json.meshes.map((m) => {
    const p = m.primitives[0];
    const pos = json.accessors[p.attributes.POSITION];
    if (!('TEXCOORD_0' in p.attributes)) errs.push('no uv ' + m.name);
    if (!('NORMAL' in p.attributes)) errs.push('no normal ' + m.name);
    const tris = (p.indices !== undefined ? json.accessors[p.indices].count : pos.count) / 3;
    if (tris > 20000) errs.push('tris>20k ' + m.name);
    return { name: m.name, mat: json.materials[p.material].name, tris, min: pos.min.map((v) => +v.toFixed(1)), max: pos.max.map((v) => +v.toFixed(1)) };
  });
  // overall bbox centered?
  const mn = [0, 1, 2].map((i) => Math.min(...meshInfo.map((m) => m.min[i]))), mx = [0, 1, 2].map((i) => Math.max(...meshInfo.map((m) => m.max[i])));
  const ctr = [0, 1, 2].map((i) => (mn[i] + mx[i]) / 2);
  if (ctr.some((v) => Math.abs(v) > 0.2)) errs.push('not centered ' + ctr);
  const nodeNames = json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name + '>' + json.materials[json.meshes[n.mesh].primitives[0].material].name);
  if (nodeNames.some((s) => s.split('>')[0] !== s.split('>')[1])) errs.push('node/material name mismatch');
  // parse with three's loader as an import smoke test
  let loaded = 'n/a';
  try {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
    let n = 0; gltf.scene.traverse((o) => { if (o.isMesh) n++; });
    loaded = `${n} meshes via GLTFLoader`;
  } catch (e) { loaded = 'loader error: ' + e.message; errs.push('loader'); }
  if (errs.length) bad++;
  console.log(`${name}.glb ${(buf.length / 1024).toFixed(0)}KB  size ${mx.map((v, i) => (v - mn[i]).toFixed(1)).join('x')}m  mats[${mats.join(',')}]  maxTris/mesh ${Math.max(...meshInfo.map((m) => m.tris))}  ${loaded}  ${errs.length ? 'ERRORS: ' + errs.join('; ') : 'OK'}`);
  console.log('   extensions:', JSON.stringify(json.extensionsUsed || []));
}
await browser.close();
console.log(bad ? `${bad} BAD` : 'all GLBs valid');
