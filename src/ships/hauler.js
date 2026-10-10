// Hauler: central spine with clamped cargo containers, aft ziggurat command
// tower over an engine block with a drum bank.
// Family signature: container rows abreast (1/2/3) x container slots along length.
import { cbox, box, boxFace, Hull, cdrum, drum } from '../geom.js';
import { addEngine, addAntenna, addDish, windowRow, hazard, ribs, windowedBox, greebleQuad, offset, offsetZ, platePass } from '../details.js';
import { hull, FACE8 } from './common.js';

export function buildHauler(b, { style, rng, tier, P }) {
  const S = {
    cw: style.float(3.2, 4.4), // container width
    chf: style.float(0.75, 1.15), // container height factor
    cl: style.float(8, 12.5) * P.len, // container length
    levels: style.pick([1, 2, 2, 2]), // container layers above/below spine (1 = top only)
    bow: style.pick(['cab', 'plate', 'prow', 'cab']),
    tower: style.pick(['ziggurat', 'ziggurat', 'stack']),
    towerSteps: style.int(2, 3),
    colorMode: style.pick(['mixed', 'mixed', 'uniform', 'banded']),
    frameStyle: style.pick(['ring', 'posts']),
    engineGrid: style.pick(['wide', 'square']),
    radiators: style.chance(0.55),
    slotGap: style.float(0.12, 0.3),
    cargo: style.pick(['boxes', 'boxes', 'tanks', 'mixed']),
  };
  const A = [1, 2, 3][tier];
  const N = [3, 5, 7][tier] + rng.int(0, 1);
  const cw = S.cw, ch = cw * S.chf, cl = S.cl;
  const g = 0.35; // gap between containers
  const sh = Math.max(0.8, ch * 0.28); // spine half height
  const sw = Math.max(0.8, cw * 0.3); // spine half width
  const bundleW = A * cw + (A - 1) * g;
  const yTop = sh + ch / 2 + 0.05;
  const yBot = -(sh + ch / 2 + 0.05);
  const slotL = cl + cl * S.slotGap;
  const cargoLen = N * slotL;
  const zc0 = -cargoLen / 2; // cargo region aft end
  const zc1 = cargoLen / 2;
  const dens = P.detail;

  // --- spine (runs through engine block to bow) ---
  const blockL = Math.max(8, cl * 0.9) * (0.9 + tier * 0.1);
  const bowL = Math.max(5, cl * 0.6);
  const zs0 = zc0 - blockL * 0.6, zs1 = zc1 + bowL * 0.5;
  const sp = new Hull([
    { z: zs0, w: sw, h: sh, tw: 0.6, bw: 0.6, ct: 0.4, cb: 0.4 },
    { z: zs1, w: sw, h: sh, tw: 0.6, bw: 0.6, ct: 0.4, cb: 0.4 },
  ]);
  b.add('structure', sp.tris(), null, 'spine');
  // conduit pipes along spine sides
  b.add('accent2', offset(box(0.25, 0.25, zs1 - zs0), [sw + 0.08, sh * 0.3, (zs0 + zs1) / 2]), { mirror: true }, 'conduit');

  // --- container slots ---
  const pool = S.colorMode === 'uniform' ? [['accent', 1]] : [['primary', 3], ['accent', 3], ['accent2', 2]];
  const cr = rng.fork('cargo');
  const levelsY = S.levels === 2 ? [yTop, yBot] : [yTop];
  const outerX = bundleW / 2 + 0.3;
  const frameH = S.levels === 2 ? (yTop + ch / 2 + 0.3) * 2 : yTop + ch / 2 + 0.3 + sh + 0.3;
  const frameY = S.levels === 2 ? 0 : (yTop + ch / 2 + 0.3 - sh - 0.3) / 2;
  let containers = 0;
  for (let s = 0; s < N; s++) {
    const zMid = zc0 + slotL * (s + 0.5);
    const bandCh = S.colorMode === 'banded' ? ['primary', 'accent', 'accent2'][s % 3] : null;
    // clamp frames at both ends of the slot
    for (const fz of [zMid - cl / 2 - 0.15, zMid + cl / 2 + 0.15]) {
      if (S.frameStyle === 'ring') {
        b.add('structure', cbox(bundleW + 0.9, frameH, 0.5, 0.15), { p: [0, frameY, fz] }, 'frame');
        // hollow look: dark inner plate on the front face
      } else {
        b.add('structure', cbox(bundleW + 0.5, sh * 2, 0.6, 0.15), { p: [0, 0, fz] }, 'crossbeam');
        b.add('structure', cbox(0.5, frameH, 0.6, 0.12), { p: [outerX, frameY, fz], mirror: true }, 'post');
      }
    }
    let placed = 0;
    for (let c = 0; c < A; c++) {
      for (const y of levelsY) {
        const last = c === A - 1 && y === levelsY[levelsY.length - 1];
        if (cr.chance(0.07 + (1 - dens) * 0.04) && !(last && placed === 0)) continue;
        placed++;
        containers++;
        const x = (c - (A - 1) / 2) * (cw + g);
        const col = bandCh || cr.weighted(pool);
        const isTank = S.cargo === 'tanks' || (S.cargo === 'mixed' && s % 2 === 1);
        if (isTank) {
          // pressure tank: faceted cylinder with end caps and bands
          const tr = Math.min(cw, ch) / 2;
          const tank = cdrum(tr, cl * 0.96, 8, tr * 0.35);
          const bands = [-0.28, 0.28].flatMap((t) => offsetZ(drum(tr * 1.03, 0.4, 8), t * cl));
          const saddle = offset(box(cw * 0.7, (ch / 2) * 0.5, cl * 0.5), [0, (y > 0 ? -1 : 1) * ch * 0.38, 0]);
          b.add({ [col === 'primary' ? 'accent2' : col]: tank, structure: [...bands, ...saddle] }, { p: [x, y, zMid] }, 'tank');
          continue;
        }
        const body = cbox(cw, ch, cl, 0.12);
        const ends = [...offset(box(cw + 0.12, ch + 0.12, 0.3), [0, 0, cl / 2 - 0.15]), ...offset(box(cw + 0.12, ch + 0.12, 0.3), [0, 0, -cl / 2 + 0.15])];
        // corrugation ribs on exposed sides & top
        const rb = [];
        const nRib = Math.max(3, Math.round(cl / 2));
        const faces = [y > 0 ? '+y' : '-y'];
        if (c === A - 1) faces.push('+x');
        if (c === 0) faces.push('-x');
        for (const f of faces) rb.push(...ribs(boxFace(cw, ch, cl, f), nRib, 0.06, f.includes('y') ? 'v' : 'u', 0.45));
        b.add({ [col]: [...body, ...rb], structure: ends }, { p: [x, y, zMid] }, 'container');
      }
    }
  }

  // --- engine block (aft) ---
  const blockW = Math.max(bundleW * 0.85, 6);
  const blockH = S.levels === 2 ? (yTop + ch / 2) * 1.6 : (yTop + ch / 2) * 1.2 + sh;
  const blockY = S.levels === 2 ? 0 : (yTop + ch / 2 - sh) * 0.3;
  const bz = zc0 - blockL / 2 - 0.2;
  const blk = new Hull([
    { z: bz - blockL / 2, w: blockW / 2 * 0.9, h: blockH / 2 * 0.9, y: blockY, tw: 0.75, bw: 0.75, ct: 0.25, cb: 0.25 },
    { z: bz - blockL * 0.3, w: blockW / 2, h: blockH / 2, y: blockY, tw: 0.75, bw: 0.75, ct: 0.25, cb: 0.25 },
    { z: bz + blockL / 2, w: blockW / 2, h: blockH / 2, y: blockY, tw: 0.75, bw: 0.75, ct: 0.25, cb: 0.25 },
  ]);
  b.add('structure', blk.tris(), null, 'engine-block');
  platePass(b, blk, rng.fork('blk'), { density: dens, size: 2.6, gap: 0.12, h: 0.08, faces: [1, 2, 3, 4, 5, 0, 6] });
  // hazard band on the aft rim
  b.add('accent', hazard(blk.quad(FACE8.right, 0), { along: 'u', t0: 0.05, t1: 0.95, a0: 0.1, a1: 0.9, n: 7, h: 0.06 }), { mirror: true }, 'hazard');
  if (S.radiators) {
    for (const side of [1]) {
      const rw = blockL * 0.7, rh = blockH * 0.9;
      const rad = cbox(0.3, rh, rw, 0.05);
      const fins = [];
      const q = boxFace(0.3, rh, rw, '+x');
      fins.push(...ribs(q, Math.round(rw / 0.7), 0.12, 'u', 0.3));
      b.add({ accent2: rad, structure: fins }, { p: [side * (blockW / 2 + 0.1), blockY, bz + 0.1], mirror: true }, 'radiator');
    }
  }
  // engine drum bank
  const nE = [2, 4, 6][tier];
  const cols = S.engineGrid === 'wide' ? nE : (nE <= 2 ? 2 : nE / 2);
  const rows = Math.ceil(nE / cols);
  const er = Math.min((blockW * 0.92) / cols / 2, (blockH * 0.88) / rows / 2) * 0.95;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * er * 2.08;
      const y = blockY + (r - (rows - 1) / 2) * er * 2.08;
      addEngine(b, { x, y, z: bz - blockL / 2 - er * 0.5, r: er, length: blockL * 0.6, seg: 12, ch: 'primary', bands: 2 });
    }
  }

  // --- command tower on the block ---
  const topY = blockY + blockH / 2;
  const tw0 = blockW * 0.62, td0 = blockL * 0.7;
  let ty = topY - 0.2;
  const steps = S.tower === 'stack' ? 2 : S.towerSteps;
  for (let k = 0; k < steps; k++) {
    const f = S.tower === 'stack' ? 1 - k * 0.15 : 1 - k * (0.55 / steps);
    const w = tw0 * f, d = td0 * (S.tower === 'stack' ? 0.6 : f), h = 1.7 + (S.tower === 'stack' ? 1.6 : 0);
    const zz = bz - blockL * 0.05 + (S.tower === 'stack' ? 0 : k * 0.4);
    const parts = windowedBox(w, h, d, 0.25, ['+z', '+x', '-x'], { rows: S.tower === 'stack' ? 2 : 1, pitch: 1.6, wh: 0.12, ch: k % 2 ? 'primary' : 'accent2' });
    b.add(parts, { p: [0, ty + h / 2, zz] }, 'tower' + k);
    ty += h - 0.05;
  }
  // bridge: wide winged deck with a front window band
  const bw = tw0 * (S.tower === 'stack' ? 1.4 : 0.9);
  const bridge = windowedBox(bw, 1.8, 3.2, 0.35, ['+z'], { rows: 1, pitch: 0.9, wh: 0.3, at: 0.55, ch: 'primary' });
  b.add(bridge, { p: [0, ty + 0.85, bz + 0.6] }, 'bridge');
  addAntenna(b, [bw * 0.3, ty + 1.7, bz + 0.2], 2.5 + tier, 0.07);
  addDish(b, [-bw * 0.25, ty + 1.7, bz], 0.9 + tier * 0.15);

  // --- bow ---
  const bowZ = zc1 + 0.2;
  const bh = S.levels === 2 ? (yTop + ch / 2) * 1.2 : (yTop + ch / 2 + sh) * 0.9;
  const by = S.levels === 2 ? 0 : (yTop + ch / 2 - sh) * 0.35;
  const bwid = Math.max(4, bundleW * 0.6);
  if (S.bow === 'plate') {
    b.add('accent2', cbox(bundleW + 1.2, (S.levels === 2 ? 2 : 1.4) * (yTop + ch / 2), 1.2, 0.3), { p: [0, by, bowZ + 0.6] }, 'deflector');
    const q = boxFace(bundleW + 1.2, (S.levels === 2 ? 2 : 1.4) * (yTop + ch / 2), 1.2, '+z');
    b.add('accent', hazard(q, { along: 'u', t0: 0.0, t1: 1, a0: 0.05, a1: 0.18, n: 12, h: 0.05 }), { p: [0, by, bowZ + 0.6] }, 'bow-hazard');
    b.add('structure', cbox(sw * 2.6, sh * 2.6, bowL * 0.8, 0.2), { p: [0, 0, bowZ + bowL * 0.2] }, 'bow-hub');
    b.add('windows', windowRow(q, { along: 'u', t0: 0.3, t1: 0.7, a0: 0.8, a1: 0.86, count: 4, fill: 0.5, h: 0.06 }), { p: [0, by, bowZ + 0.6] }, 'bow-lights');
  } else {
    const prow = S.bow === 'prow';
    const bowHull = hull(b, [
      { z: bowZ - 0.3, w: bwid / 2, h: bh / 2, y: by, tw: 0.7, bw: 0.7, ct: 0.3, cb: 0.3 },
      { z: bowZ + bowL * 0.5, w: bwid / 2 * 0.95, h: bh / 2 * 0.9, y: by + bh * 0.04, tw: 0.6, bw: 0.7, ct: 0.4, cb: 0.3 },
      { z: bowZ + bowL * (prow ? 1.3 : 0.95), w: bwid / 2 * (prow ? 0.25 : 0.6), h: bh / 2 * (prow ? 0.3 : 0.55), y: by + bh * (prow ? -0.1 : 0.08), tw: 0.6, bw: 0.7, ct: 0.4, cb: 0.3 },
    ], rng, dens, { label: 'bow', plates: { size: 2.4, gap: 0.12, h: 0.07, faces: [0, 1, 2, 3, 4, 5, 6] } });
    b.add('windows', windowRow(bowHull.quad(FACE8.upR, 1), { along: 'v', t0: 0.2, t1: 0.9, a0: 0.4, a1: 0.65, count: 5, fill: 0.7, h: 0.08 }), { mirror: true }, 'bow-windows');
    b.add('accent', hazard(bowHull.quad(FACE8.right, 0), { along: 'u', t0: 0.05, t1: 0.95, a0: 0.05, a1: 0.3, n: 5, h: 0.08 }), { mirror: true }, 'bow-hazard');
  }

  // spine greebles visible in the slot gaps
  const gr = rng.fork('greeble');
  b.add('structure', greebleQuad(gr, sp.quad(FACE8.top, 0), Math.round(N * 6 * dens), 0.1, 0.4), null, 'spine-greebles');

  return { length: zs1 - zs0, signature: `${A} abreast × ${N} slots (${containers} ${S.cargo === 'tanks' ? 'tanks' : S.cargo === 'mixed' ? 'cargo units' : 'containers'})`, sigValue: A };
}

