// Structural left/right symmetry: every sizeable part must be self-symmetric
// about x=0 or have a mirrored twin. (Random plate skipping / accent panels are
// livery noise and are ignored by only looking at part bounding boxes.)
// usage: node --import ./register.mjs sym-test.mjs [count=400] [classes]
import { generateShip, CLASSES } from '../src/ships/index.js';
import { randomSeed } from '../src/rng.js';
const N = +(process.argv[2] || 400);
const only = process.argv[3] ? process.argv[3].split(',') : CLASSES.map((c) => c.id);
const P = [{ len: 1, detail: 0.5, append: 1 }, { len: 0.8, detail: 1, append: 1.4 }, { len: 1.3, detail: 0, append: 0.7 }];
const FIXED = ['kestrel-4821', 'vega-1234', 'anvil-9001', 'rook-5555', 'ember-2020', 'lumen-7777', 'quarry-3141', 'onyx-2718', 'swift-4410', 'bastion-2210'];
let racerBad = 0;
for (const cls of only) {
  let bad = 0; const labels = {}; let example = '';
  for (let i = 0; i < N; i++) {
    const seed = i < FIXED.length ? FIXED[i] : randomSeed();
    for (const tier of [0, 1, 2]) {
      const params = P[i % P.length];
      const r = generateShip({ seed, cls, tier, params });
      const parts = r.partList;
      let size = 0;
      for (const p of parts) size = Math.max(size, p.bb[3] - p.bb[0], p.bb[5] - p.bb[2]);
      const tol = size * 0.03;
      const lop = [];
      for (const p of parts) {
        const b = p.bb;
        if (Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) < size * 0.08) continue; // greebles
        const m = [-b[3], b[1], b[2], -b[0], b[4], b[5]];
        const ok = parts.some((q) => q.bb.every((v, k) => Math.abs(v - m[k]) < tol));
        if (!ok) lop.push(p.label);
      }
      if (lop.length) { bad++; for (const l of new Set(lop)) labels[l] = (labels[l] || 0) + 1; if (!example) example = `${seed} t${tier} ${JSON.stringify(params)}`; }
      Object.values(r.geometries).forEach((g) => g.dispose());
    }
  }
  if (cls === 'racer') racerBad = bad;
  console.log(`${cls.padEnd(9)} ${N * 3} ships, lopsided: ${bad}${bad ? `  parts: ${JSON.stringify(labels)}  e.g. ${example}` : ''}`);
}
process.exitCode = racerBad ? 1 : 0;
