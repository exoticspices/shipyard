// Generates many ships in Node: checks determinism, timing, tri budgets, NaNs, floating parts.
import { generateShip, CLASSES } from '../src/ships/index.js';
const seeds = process.argv[2] ? process.argv[2].split(',') : ['kestrel-4821', 'vega-1234', 'anvil-9001', 'rook-5555', 'ember-2020', 'lumen-7777', 'quarry-3141', 'onyx-2718'];
let worst = 0, maxMesh = 0, problems = 0;
for (const c of CLASSES) {
  const rows = [];
  for (const seed of seeds) for (const tier of [0, 1, 2]) {
    let r;
    try { r = generateShip({ seed, cls: c.id, tier, check: true }); }
    catch (e) { console.log('ERROR', c.id, seed, tier, e.stack); problems++; continue; }
    const r2 = generateShip({ seed, cls: c.id, tier });
    let same = r.tris === r2.tris;
    let nan = false, perMesh = {};
    const box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const [ch, g] of Object.entries(r.geometries)) {
      const p = g.attributes.position.array;
      perMesh[ch] = p.length / 9; maxMesh = Math.max(maxMesh, p.length / 9);
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { nan = true; break; }
      const bb = g.boundingBox; box[0] = Math.min(box[0], bb.min.x); box[1] = Math.min(box[1], bb.min.y); box[2] = Math.min(box[2], bb.min.z); box[3] = Math.max(box[3], bb.max.x); box[4] = Math.max(box[4], bb.max.y); box[5] = Math.max(box[5], bb.max.z);
      const pa = r2.geometries[ch].attributes.position.array;
      if (pa.length !== p.length) same = false; else for (let i = 0; i < p.length; i += 97) if (pa[i] !== p[i]) { same = false; break; }
    }
    worst = Math.max(worst, r.ms);
    const dims = [box[3] - box[0], box[4] - box[1], box[5] - box[2]].map((v) => v.toFixed(1)).join('x');
    const flag = (!same ? ' NONDET' : '') + (nan ? ' NAN' : '') + (r.floating.length ? ' FLOAT:' + [...new Set(r.floating)].slice(0, 6).join(',') : '');
    if (flag) problems++;
    rows.push(`${c.id.padEnd(9)} ${seed.padEnd(13)} t${tier} ${String(r.tris).padStart(6)} tris max/mesh ${String(Math.max(...Object.values(perMesh))).padStart(5)} ${r.ms.toFixed(1).padStart(6)}ms ${dims.padEnd(18)} ${r.meta.signature}${flag}`);
  }
  console.log(rows.join('\n'));
}
console.log(`worst gen ${worst.toFixed(1)} ms, max tris per mesh ${maxMesh}, problems ${problems}`);
