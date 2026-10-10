// Corvette / Capital: layered slab hull, command island with bridge, turret
// batteries, flank sponsons, staggered engine nacelles.
// Family signature: turret count 2/4/6 (+ sponson mounts).
import { cbox, box, boxFace, drum, Hull, patch, rect } from '../geom.js';
import { addEngine, addAntenna, addDish, addTurret, windowRow, hazard, windowedBox, offset, greebleQuad, platePass } from '../details.js';
import { hull, FACE8 } from './common.js';

export function buildCorvette(b, { style, rng, tier, P }) {
  const S = {
    L: [55, 85, 130][tier] * style.float(0.9, 1.1) * P.len,
    bow: style.pick(['wedge', 'hammer', 'needle', 'wedge', 'split']),
    W: style.float(0.13, 0.2),
    layers: style.int(2, 3),
    island: style.pick(['aft', 'mid', 'aft']),
    islandH: style.float(0.8, 1.3),
    nacelles: style.pick(['flank', 'flank', 'outrigger', 'none']),
    sponson: style.pick(['box', 'wing', 'none', 'box']),
    keel: style.chance(0.5),
    prof: { tw: style.float(0.55, 0.85), bw: style.float(0.35, 0.7), ct: style.float(0.3, 0.6), cb: style.float(0.4, 0.8) },
  };
  const L = S.L * rng.float(0.97, 1.03);
  const z0 = -L / 2;
  const W = L * S.W;
  const H = L * 0.035;
  const dens = P.detail;
  const A = P.append;
  const nT = [2, 4, 6][tier];
  const pr = S.prof;
  const plateO = { size: L * 0.045, gap: L * 0.0016, h: L * 0.0012, altChance: 0.04 };

  // --- lower hull (main slab) ---
  let secs;
  if (S.bow === 'wedge') {
    secs = [
      { z: z0, w: W * 0.85, h: H },
      { z: z0 + 0.12 * L, w: W, h: H * 1.05 },
      { z: z0 + 0.45 * L, w: W * 0.92, h: H },
      { z: L / 2 - 0.04 * L, w: W * 0.12, h: H * 0.45, y: -H * 0.3 },
      { z: L / 2, w: W * 0.04, h: H * 0.2, y: -H * 0.4 },
    ];
  } else if (S.bow === 'hammer') {
    secs = [
      { z: z0, w: W * 0.8, h: H },
      { z: z0 + 0.15 * L, w: W * 0.85, h: H * 1.05 },
      { z: z0 + 0.6 * L, w: W * 0.6, h: H * 0.9 },
      { z: L / 2 - 0.16 * L, w: W * 0.62, h: H * 0.95 },
      { z: L / 2 - 0.1 * L, w: W * 1.05, h: H * 1.1 },
      { z: L / 2, w: W * 0.8, h: H * 0.7, y: -H * 0.2 },
    ];
  } else if (S.bow === 'split') {
    secs = [
      { z: z0, w: W * 0.8, h: H },
      { z: z0 + 0.2 * L, w: W, h: H * 1.1 },
      { z: L / 2 - 0.18 * L, w: W * 0.9, h: H },
      { z: L / 2, w: W * 0.75, h: H * 0.5, y: -H * 0.3 },
    ];
  } else {
    secs = [
      { z: z0, w: W * 0.7, h: H * 1.1 },
      { z: z0 + 0.3 * L, w: W * 0.72, h: H * 1.15 },
      { z: L / 2 - 0.25 * L, w: W * 0.4, h: H * 0.8 },
      { z: L / 2, w: W * 0.08, h: H * 0.25, y: -H * 0.2 },
    ];
  }
  secs = secs.map((s) => ({ ...pr, ...s }));
  const lower = hull(b, secs, rng, dens, { label: 'lower', plates: { ...plateO, faces: [0, 1, 2, 3, 4, 5, 6, 7] } });

  // split bow: twin prongs with a dark trench between
  if (S.bow === 'split') {
    const pz0 = L / 2 - 0.2 * L, pz1 = L / 2 + 0.12 * L;
    const prong = new Hull([
      { z: pz0, w: W * 0.28, h: H * 0.9, x: W * 0.55, ...pr },
      { z: pz1 - 0.05 * L, w: W * 0.22, h: H * 0.7, x: W * 0.55, y: -H * 0.1, ...pr },
      { z: pz1, w: W * 0.05, h: H * 0.2, x: W * 0.5, y: -H * 0.3, ...pr },
    ]);
    b.add('structure', prong.tris(), { mirror: true }, 'prong');
    platePass(b, prong, rng.fork('prong'), { ...plateO, density: dens, faces: [1, 2, 3, 4, 5] });
  }

  // --- upper slabs ---
  let deck = lower;
  let layerTops = [];
  const nL = Math.min(S.layers, tier + 2);
  for (let k = 1; k < nL; k++) {
    const f = 1 - k * 0.3;
    const za = z0 + 0.04 * L * k, zb = z0 + (0.62 - k * 0.12) * L * (S.bow === 'needle' ? 1.05 : 1);
    const yb = (z) => deck.top(z) - H * 0.25;
    const sl = hull(b, [
      { z: za, w: W * 0.7 * f, h: H * 0.6, y: yb(za) + H * 0.6, ...pr },
      { z: za + 0.1 * L, w: W * 0.75 * f, h: H * 0.65, y: yb(za + 0.1 * L) + H * 0.65, ...pr },
      { z: zb - 0.08 * L, w: W * 0.6 * f, h: H * 0.6, y: yb(zb - 0.08 * L) + H * 0.6, ...pr },
      { z: zb, w: W * 0.2 * f, h: H * 0.3, y: yb(zb) + H * 0.25, ...pr },
    ], rng.fork('layer' + k), dens, { label: 'layer' + k, plates: { ...plateO, faces: [1, 2, 3, 4, 5] } });
    // windows along each layer flank
    b.add('windows', windowRow(sl.quad(FACE8.right, 1), { along: 'v', t0: 0.04, t1: 0.96, a0: 0.4, a1: 0.56, count: Math.round(L / 6), fill: 0.5, h: L * 0.0022 }), { mirror: true }, 'layer-windows');
    layerTops.push(sl);
    deck = sl;
  }
  // window rows along the lower hull flank
  for (let j = 0; j < lower.nBands - 1; j++) {
    b.add('windows', windowRow(lower.quad(FACE8.right, j), { along: 'v', t0: 0.05, t1: 0.95, a0: 0.55, a1: 0.68, count: Math.max(3, Math.round(L / 9)), fill: 0.45, h: L * 0.0022 }), { mirror: true }, 'hull-windows');
  }

  // --- command island ---
  const iz = S.island === 'aft' ? z0 + 0.14 * L : z0 + 0.32 * L;
  const baseY = deck.top(iz) - H * 0.2;
  const ih = H * 2.2 * S.islandH;
  const iw = W * 0.28, id = L * 0.1;
  const tower = new Hull([
    { z: iz - id / 2, w: iw * 0.8, h: ih / 2, y: baseY + ih / 2, tw: 0.5, bw: 1, ct: 0.3, cb: 0.05 },
    { z: iz + id * 0.2, w: iw, h: ih / 2, y: baseY + ih / 2, tw: 0.5, bw: 1, ct: 0.3, cb: 0.05 },
    { z: iz + id / 2, w: iw * 0.6, h: ih / 2 * 0.8, y: baseY + ih * 0.4, tw: 0.5, bw: 1, ct: 0.3, cb: 0.05 },
  ]);
  b.add('primary', tower.tris(), null, 'island');
  const bw = W * (0.9 + 0.3 * rng.next()), bh = H * 0.9, bd = L * 0.05;
  const by = baseY + ih + bh * 0.3;
  b.add(windowedBox(bw, bh, bd, bh * 0.2, ['+z', '+x', '-x'], { rows: 1, pitch: L * 0.012, wh: 0.28, at: 0.55, ch: 'primary' }), { p: [0, by, iz + id * 0.15] }, 'bridge');
  b.add('accent', cbox(bw * 0.3, bh * 0.4, bd * 0.8, bh * 0.08), { p: [0, by + bh * 0.6, iz + id * 0.1] }, 'bridge-top');
  b.add('accent', hazard(boxFace(bw, bh, bd, '+z'), { along: 'u', t0: 0, t1: 1, a0: 0.05, a1: 0.22, n: 14, h: L * 0.001 }), { p: [0, by, iz + id * 0.15] }, 'bridge-hazard');
  addAntenna(b, [bw * 0.12, by + bh * 0.45, iz + id * 0.15], L * 0.06, L * 0.0016);
  addAntenna(b, [-bw * 0.1, by + bh * 0.45, iz + id * 0.15 - bd * 0.3], L * 0.04, L * 0.0012);
  addDish(b, [0, by + bh * 0.45, iz + id * 0.15 - bd * 0.3], L * 0.02);
  b.add('windows', windowRow(tower.quad(FACE8.right, 1), { along: 'v', t0: 0.1, t1: 0.9, a0: 0.45, a1: 0.6, count: 3, fill: 0.5, h: L * 0.001 }), { mirror: true }, 'island-windows');

  // --- turret batteries ---
  const tr = L * 0.018;
  const fwd = [];
  const deckTop = layerTops.length ? layerTops[layerTops.length - 1] : lower;
  // centerline turrets on the top deck, forward of the island
  const zA = iz + id * 0.9 + tr * 2, zB = deckTop.zMax - tr * 2.5;
  const nCenter = Math.min(nT, Math.max(1, Math.floor((zB - zA) / (tr * 3.2))));
  const nCL = Math.min(nCenter, Math.ceil(nT / 2));
  for (let k = 0; k < nCL; k++) {
    const z = zB - k * tr * 3.2;
    fwd.push([0, deckTop.top(z) - tr * 0.12, z, 1]);
  }
  // remaining as flank pairs on the lower hull shoulders
  let rem = nT - nCL;
  let k = 0;
  while (rem > 0) {
    const z = z0 + (0.55 - k * 0.17) * L;
    const s = lower.at(z);
    const x = s.w * Math.min(0.62, pr.tw * 0.95);
    fwd.push([x, (s.y || 0) + s.h - tr * 0.1, z, k % 2 ? -1 : 1, true]);
    rem -= 2; k++;
  }
  for (const [x, y, z, f, m] of fwd) addTurret(b, [x, y, z], tr, { barrels: tier === 2 ? 3 : 2, facing: f, mirror: !!m });
  // aft turret behind the island
  if (tier > 0) addTurret(b, [0, deck.top(z0 + 0.04 * L + tr * 2) - tr * 0.1, z0 + 0.04 * L + tr * 2.2], tr * 0.8, { barrels: 2, facing: -1 });

  // --- sponsons ---
  let sponsonCount = 0;
  if (S.sponson !== 'none') {
    const sz = z0 + 0.42 * L;
    const s = lower.at(sz);
    if (S.sponson === 'box') {
      const sw = W * 0.35 * A, sh = H * 1.2, sd = L * 0.14;
      const sx = s.w + sw * 0.3;
      b.add({ primary: cbox(sw * 1.6, sh, sd, sh * 0.2) }, { p: [sx, s.y || 0, sz], mirror: true }, 'sponson');
      b.add('accent', hazard(boxFace(sw * 1.6, sh, sd, '+z'), { along: 'u', t0: 0, t1: 1, a0: 0.1, a1: 0.3, n: 6, h: L * 0.001 }), { p: [sx, s.y || 0, sz], mirror: true }, 'sponson-hazard');
      addTurret(b, [sx + sw * 0.2, (s.y || 0) + sh / 2 - tr * 0.1, sz], tr * 0.85, { barrels: 2, mirror: true });
      sponsonCount = 2;
    } else {
      // stubby weapon wings with missile pods
      const wl = W * 0.7 * A;
      b.add('primary', cbox(wl * 2, H * 0.5, L * 0.12, H * 0.1), { p: [s.w + wl * 0.6, (s.y || 0) - H * 0.2, sz], mirror: true }, 'weapon-wing');
      const pod = cbox(W * 0.22, H * 0.8, L * 0.08, H * 0.12);
      const q = boxFace(W * 0.22, H * 0.8, L * 0.08, '+z');
      const hatches = [];
      for (let r2 = 0; r2 < 2; r2++) for (let c = 0; c < 3; c++) hatches.push(...patch(q, rect(0.1 + c * 0.28, 0.32 + c * 0.28, 0.12 + r2 * 0.42, 0.45 + r2 * 0.42), L * 0.0008, L * 0.0008));
      b.add({ accent2: pod, structure: hatches }, { p: [s.w + wl * 1.25, (s.y || 0) - H * 0.2 - H * 0.6, sz + L * 0.01], mirror: true }, 'missile-pod');
    }
  }

  // --- engines: aft bank + staggered flank nacelles ---
  const as = lower.at(z0);
  const nMain = tier + 2;
  const er = Math.min((as.w * 1.8) / nMain / 2, as.h * 0.9);
  for (let i = 0; i < nMain; i++) {
    const x = (i - (nMain - 1) / 2) * er * 2.05;
    addEngine(b, { x, y: as.y || 0, z: z0 - er * 0.5, r: er, length: L * 0.1, seg: 10, ch: 'structure', bands: 1 });
  }
  if (S.nacelles !== 'none') {
    const nn = tier + 1;
    for (let i = 0; i < nn; i++) {
      const nz = z0 + 0.04 * L + i * 0.09 * L; // staggered fore along the flank
      const s = lower.at(nz + 0.08 * L);
      const nr = H * (0.9 - i * 0.12);
      const out = S.nacelles === 'outrigger' ? W * 0.45 * A : 0;
      const nx = s.w + nr * 0.4 + out + i * nr * 0.5;
      const ny = (s.y || 0) + (i % 2 ? s.h * 0.5 : -s.h * 0.4);
      const nl = L * 0.22;
      const nh = new Hull([
        { z: nz, w: nr * 1.05, h: nr * 1.05, x: nx, y: ny, tw: 0.6, bw: 0.6, ct: 0.5, cb: 0.5 },
        { z: nz + nl * 0.8, w: nr * 1.0, h: nr, x: nx, y: ny, tw: 0.6, bw: 0.6, ct: 0.5, cb: 0.5 },
        { z: nz + nl, w: nr * 0.4, h: nr * 0.4, x: nx, y: ny, tw: 0.6, bw: 0.6, ct: 0.5, cb: 0.5 },
      ]);
      b.add('accent2', nh.tris(), { mirror: true }, 'nacelle');
      addEngine(b, { x: nx, y: ny, z: nz - nr * 0.45, r: nr * 0.92, length: nl * 0.3, seg: 10, ch: 'structure', mirror: true, bands: 0 });
      // pylon back to the hull
      const pw = nx - s.w * 0.5;
      b.add('structure', cbox(pw, nr * 0.5, nl * 0.4, nr * 0.1), { p: [s.w * 0.5 + pw / 2, ny, nz + nl * 0.45], mirror: true }, 'nacelle-pylon');
    }
  }

  // keel fin
  if (S.keel) {
    const kz = z0 + 0.3 * L;
    b.add('primary', cbox(W * 0.08, H * 1.6, L * 0.32, H * 0.1), { p: [0, lower.bottom(kz) - H * 0.6, kz] }, 'keel');
  }
  // hangar bay on the flank: dark recess with lights
  const hz = z0 + 0.6 * L;
  const hs = lower.at(hz);
  if (hs.w > W * 0.5) {
    const q = lower.quad(FACE8.right, Math.min(1, lower.nBands - 1));
    b.add('structure', patch(q, rect(0.15, 0.85, 0.35, 0.6), L * 0.002, L * 0.001), { mirror: true }, 'hangar');
    b.add('windows', windowRow(q, { along: 'v', t0: 0.35, t1: 0.6, a0: 0.86, a1: 0.9, count: 5, fill: 0.5, h: L * 0.0026 }), { mirror: true }, 'hangar-lights');
  }
  b.add('structure', greebleQuad(rng.fork('deck'), lower.quad(FACE8.top, 1), Math.round(10 + 20 * dens), L * 0.001, L * 0.005), null, 'deck-greebles');

  return { signature: `${nT} turrets${sponsonCount ? ` + ${sponsonCount} sponson` : ''}`, sigValue: nT };
}
