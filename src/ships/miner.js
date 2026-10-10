// Miner / Industrial: boxy segmented hull with collars, hooded intake maw with
// grinder rollers at the bow, ore pods, crane arm.
// Family signature: hull segment count 2/3/4.
import { duct, drum, cdrum, cbox, box, boxFace, patch, rect, Hull, ngon, loft } from '../geom.js';
import { addEngine, addAntenna, windowRow, hazard, windowedBox, offset, offsetZ, ribs, greebleQuad } from '../details.js';
import { hull, FACE8 } from './common.js';

const SHAPES = {
  box: { tw: 0.86, bw: 0.86, ct: 0.18, cb: 0.18 },
  hex: { tw: 0.5, bw: 0.5, ct: 0.55, cb: 0.55 },
  keel: { tw: 0.8, bw: 0.35, ct: 0.2, cb: 0.75 },
  slab: { tw: 0.7, bw: 0.9, ct: 0.45, cb: 0.12 },
};

export function buildMiner(b, { style, rng, tier, P }) {
  const S = {
    sw: style.float(3.0, 4.6), sh: style.float(2.3, 3.6),
    sl: style.float(6.5, 9.5) * P.len,
    shape: style.pick(Object.keys(SHAPES)),
    progression: style.pick(['uniform', 'swell', 'hunch', 'taper']),
    pods: style.pick(['flank', 'top', 'belly', 'flank']),
    cab: style.pick(['fore', 'side', 'aft']),
    crane: style.chance(0.55),
    rollers: style.int(2, 3),
    mawFlare: style.float(1.05, 1.3),
    mawLen: style.float(0.7, 1.1),
    nEng: style.pick([2, 3, 4]),
    bow: style.pick(['maw', 'maw', 'drill', 'jaws']),
  };
  const nSeg = tier + 2;
  const A = P.append;
  const dens = P.detail;
  const shape = SHAPES[S.shape];
  const cg = 1.2; // neck gap between segments
  const sl = S.sl * rng.float(0.95, 1.05);
  const mawL = S.sw * 2 * S.mawLen * A;
  const total = nSeg * sl + (nSeg - 1) * cg + mawL * 0.85;
  const zAft = -total / 2;

  // per-segment size factors (index 0 = aft)
  const fac = [];
  for (let k = 0; k < nSeg; k++) {
    const t = nSeg === 1 ? 0 : k / (nSeg - 1);
    let f = 1;
    if (S.progression === 'swell') f = 1.12 - 0.22 * t;
    else if (S.progression === 'hunch') f = 0.9 + 0.22 * Math.sin(Math.PI * t);
    else if (S.progression === 'taper') f = 0.88 + 0.16 * t;
    fac.push(f * rng.float(0.97, 1.03));
  }

  const segs = [];
  for (let k = 0; k < nSeg; k++) {
    const z0 = zAft + k * (sl + cg), z1 = z0 + sl;
    const w = S.sw * fac[k], h = S.sh * fac[k];
    const c = Math.min(0.8, sl * 0.1);
    const yk = (h - S.sh) * 0.3;
    const hs = hull(b, [
      { z: z0, w: w * 0.86, h: h * 0.86, y: yk, ...shape },
      { z: z0 + c, w, h, y: yk, ...shape },
      { z: z1 - c, w, h, y: yk, ...shape },
      { z: z1, w: w * 0.86, h: h * 0.86, y: yk, ...shape },
    ], rng.fork('seg' + k), dens, { label: 'segment' + k, plates: { faces: [0, 1, 2, 3, 4, 5, 6, 7], bands: [1], size: 2.4, gap: 0.12, h: 0.09, altChance: 0.1 } });
    segs.push({ hull: hs, z0, z1, w, h, y: yk });
    // vent ribs / greebles on top
    b.add('structure', greebleQuad(rng.fork('g' + k), hs.quad(FACE8.top, 1), Math.round(3 + 8 * dens), 0.12, 0.45), null, 'seg-greeble');
  }
  // necks + collars
  for (let k = 0; k < nSeg - 1; k++) {
    const a = segs[k], c = segs[k + 1];
    const zm = (a.z1 + c.z0) / 2;
    const nw = Math.min(a.w, c.w) * 0.72, nh = Math.min(a.h, c.h) * 0.72;
    const ny = (a.y + c.y) / 2;
    const neck = new Hull([{ z: a.z1 - 0.6, w: nw, h: nh, y: ny, ...shape }, { z: c.z0 + 0.6, w: nw, h: nh, y: ny, ...shape }]);
    b.add('structure', neck.tris(), null, 'neck');
    const col = new Hull([
      { z: zm - 0.35, w: nw * 1.32, h: nh * 1.32, y: ny, ...shape },
      { z: zm + 0.35, w: nw * 1.32, h: nh * 1.32, y: ny, ...shape },
    ]);
    b.add('accent2', col.tris(), null, 'collar');
    b.add('accent', hazard(col.quad(FACE8.right, 0), { along: 'u', t0: 0, t1: 1, a0: 0.1, a1: 0.9, n: 4, h: 0.05 }), { mirror: true }, 'collar-hazard');
    b.add('accent', hazard(col.quad(FACE8.top, 0), { along: 'u', t0: 0, t1: 1, a0: 0.1, a1: 0.9, n: 5, h: 0.05 }), null, 'collar-hazard-top');
  }

  if (S.bow === 'maw') {
    // --- maw ---
    const fore = segs[nSeg - 1];
    const hw = fore.w * 0.98, hh = fore.h * 0.92;
    const wall = Math.min(hw, hh) * 0.16;
    const depth = mawL * 0.72;
    const d = duct(hw, hh, mawL, { wall, depth, flare: S.mawFlare, chamfer: Math.min(hw, hh) * 0.3 });
    const mz = fore.z1 + mawL * 0.85; // mouth z
    const xfM = { p: [0, fore.y, mz], r: [0, Math.PI, 0] };
    b.add({ primary: d.outer, structure: [...d.inner, ...d.back], accent2: d.lip }, xfM, 'maw');
    // hazard stripes on the lip (top, sides)
    const hz = [];
    for (const i of [1, 3, 5, 7]) hz.push(...hazard(d.lipSurface.quad(i, 0), { along: 'u', t0: 0.02, t1: 0.98, a0: 0.15, a1: 0.85, n: i === 3 || i === 7 ? 8 : 6, h: 0.05 }));
    b.add('accent', hz, xfM, 'maw-hazard');
    // ribs along the hood top
    b.add('structure', ribs(d.outerSurface.quad(3, 0), 5, 0.12, 'v', 0.25), xfM, 'hood-ribs');
    // spotlights on the hood brow
    const sl0 = [];
    for (const sx of [-0.6, -0.2, 0.2, 0.6]) sl0.push(...offset(box(0.45, 0.3, 0.3), [sx * hw * S.mawFlare, hh * S.mawFlare + 0.12, 0.25]));
    b.add('windows', sl0, { p: [0, fore.y, mz - 0.4] }, 'spotlights');

    // grinder rollers inside the maw, spanning the inner width
    const nR = S.rollers;
    const innerW = (hw - wall) * 0.95;
    const innerH = (hh - wall) * 0.9;
    const rr = (innerH / nR) * 0.78;
    const teethN = 8;
    for (let k = 0; k < nR; k++) {
      const y = fore.y + (k - (nR - 1) / 2) * (innerH * 2 / nR);
      const z = mz - depth * (0.4 + 0.2 * (k % 2));
      const rollLen = innerW * 2;
      const core = drum(rr * 0.85, rollLen, 10);
      const teeth = [];
      const rows = Math.max(3, Math.round(rollLen / (rr * 1.3)));
      for (let t = 0; t < teethN; t++) {
        for (let j = 0; j < rows; j++) {
          const a = ((t + (j % 2) * 0.5) / teethN) * Math.PI * 2, da = 0.18;
          const zc = -rollLen / 2 + (j + 0.5) * (rollLen / rows), dz = rollLen / rows * 0.25;
          const P2 = (aa, zz) => [Math.cos(aa) * rr * 0.83, Math.sin(aa) * rr * 0.83, zz];
          const q = [P2(a - da, zc - dz), P2(a + da, zc - dz), P2(a + da, zc + dz), P2(a - da, zc + dz)];
          teeth.push(...patch(q, rect(0, 1, 0, 1), rr * 0.22, rr * 0.05, 0.4));
        }
      }
      const caps = [...offsetZ(cdrum(rr * 0.5, 0.3, 8), rollLen / 2), ...offsetZ(cdrum(rr * 0.5, 0.3, 8), -rollLen / 2)];
      b.add({ structure: [...core, ...caps], primary: teeth }, { p: [0, y, z], r: [0, Math.PI / 2, 0] }, 'roller');
    }

  } else if (S.bow === 'drill') {
    // bearing housing + twisted drill cone
    const fore = segs[nSeg - 1];
    const R0 = Math.min(fore.w, fore.h) * 0.92;
    const dl = Math.max(fore.w, fore.h) * 2.1 * S.mawLen * A;
    const hz0 = fore.z1 - 0.6, hz1 = fore.z1 + 1.4;
    const house = new Hull([
      { z: hz0, w: fore.w * 0.92, h: fore.h * 0.9, y: fore.y, ...shape },
      { z: hz1 - 0.4, w: fore.w * 0.92, h: fore.h * 0.9, y: fore.y, ...shape },
      { z: hz1, w: R0 * 1.05, h: R0 * 1.05, y: fore.y, tw: 0.42, bw: 0.42, ct: 0.58, cb: 0.58 },
    ]);
    b.add('accent2', house.tris(), null, 'drill-housing');
    b.add('accent', hazard(house.quad(FACE8.right, 0), { along: 'u', t0: 0.05, t1: 0.95, a0: 0.15, a1: 0.85, n: 5, h: 0.06 }), { mirror: true }, 'drill-hazard');
    b.add('accent', hazard(house.quad(FACE8.top, 0), { along: 'u', t0: 0.05, t1: 0.95, a0: 0.15, a1: 0.85, n: 6, h: 0.06 }), null, 'drill-hazard-top');
    const rings = [];
    const steps = 7, seg = 8;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const r = Math.max(R0 * 0.05, R0 * Math.pow(1 - t, 0.85));
      rings.push(ngon(r, seg, t * 1.9).map(([x, y]) => [x, y + fore.y, hz1 - 0.3 + t * dl]));
    }
    const cone = loft(rings, { capStart: true, capEnd: true });
    // helical cutting blades: raised strips stepping one face per band
    const blades = [];
    for (let j = 0; j < steps - 1; j++) {
      for (const off of [0, seg / 2]) {
        const q = [rings[j][(j + off) % seg], rings[j][(j + off + 1) % seg], rings[j + 1][(j + off + 1) % seg], rings[j + 1][(j + off) % seg]];
        blades.push(...patch(q, rect(0.1, 0.9, 0, 1), R0 * 0.08, R0 * 0.02, 0.3));
      }
    }
    b.add({ primary: cone, structure: blades }, null, 'drill');
    // spotlights around the housing face
    const lights = [];
    for (const sx of [-1, 1]) lights.push(...offset(box(0.5, 0.35, 0.3), [sx * fore.w * 0.7, fore.y + fore.h * 0.7, hz1 - 0.25]));
    b.add('windows', lights, null, 'spotlights');
  } else {
    // jaws: two toothed mandibles hinged on a head block, furnace glow between
    const fore = segs[nSeg - 1];
    const jl = Math.max(fore.w, fore.h) * 1.6 * S.mawLen * A;
    const head = cbox(fore.w * 2 * 0.95, fore.h * 2 * 0.95, 2.4, 0.4);
    b.add('accent2', head, { p: [0, fore.y, fore.z1 + 0.6] }, 'jaw-head');
    const throat = boxFace(fore.w * 2 * 0.95, fore.h * 2 * 0.95, 2.4, '+z');
    b.add('structure', patch(throat, rect(0.2, 0.8, 0.35, 0.65), 0.05, 0.05, 0), { p: [0, fore.y, fore.z1 + 0.6] }, 'throat');
    b.add('windows', patch(throat, rect(0.26, 0.74, 0.43, 0.57), 0.12, 0.05, 0), { p: [0, fore.y, fore.z1 + 0.6] }, 'furnace');
    for (const sy of [1, -1]) {
      const jw = new Hull([
        { z: 0, w: fore.w * 0.9, h: fore.h * 0.28, tw: 0.8, bw: 0.8, ct: 0.3, cb: 0.3 },
        { z: jl * 0.6, w: fore.w * 0.85, h: fore.h * 0.22, tw: 0.8, bw: 0.8, ct: 0.3, cb: 0.3 },
        { z: jl, w: fore.w * 0.55, h: fore.h * 0.08, y: -sy * fore.h * 0.08, tw: 0.8, bw: 0.8, ct: 0.3, cb: 0.3 },
      ]);
      const inner = sy > 0 ? FACE8.bottom : FACE8.top;
      const teeth = [];
      for (let j = 0; j < 2; j++) {
        const q = jw.quad(inner, j);
        const nt = 5;
        for (let i = 0; i < nt; i++) teeth.push(...patch(q, rect(i / nt + 0.03, (i + 1) / nt - 0.03, 0.15, 0.75), fore.h * 0.14, 0.05, 0.42));
      }
      const xf = { p: [0, fore.y + sy * fore.h * 0.58, fore.z1 + 1.2], r: [-sy * 0.2, 0, 0] };
      b.add({ primary: jw.tris(), structure: teeth }, xf, 'jaw');
      b.add('accent', hazard(jw.quad(sy > 0 ? FACE8.top : FACE8.bottom, 1), { along: 'u', t0: 0.05, t1: 0.95, a0: 0.2, a1: 0.8, n: 6, h: 0.06 }), xf, 'jaw-hazard');
    }
    b.add('structure', drum(fore.h * 0.3, fore.w * 2.1, 10), { p: [0, fore.y, fore.z1 + 1.2], r: [0, Math.PI / 2, 0] }, 'jaw-hinge');
  }

  // --- ore pods ---
  const pr = rng.fork('pods');
  for (let k = 0; k < nSeg - (S.pods === 'top' ? 0 : 1); k++) {
    const sg = segs[k];
    const zc = (sg.z0 + sg.z1) / 2;
    const plen = sl * 0.78;
    if (S.pods === 'flank') {
      const r = sg.h * 0.55 * A;
      const pod = cdrum(r, plen, 10, r * 0.3);
      const bands = [...offsetZ(cdrum(r * 1.05, 0.4, 10, 0.08), -plen * 0.25), ...offsetZ(cdrum(r * 1.05, 0.4, 10, 0.08), plen * 0.25)];
      b.add({ accent2: pod, structure: bands }, { p: [sg.w + r * 0.45, sg.y - sg.h * 0.15, zc], mirror: true }, 'ore-pod');
    } else if (S.pods === 'top') {
      const r = sg.w * 0.42 * A;
      const pod = cdrum(r, plen, 10, r * 0.3);
      b.add({ accent2: pod, structure: offsetZ(cdrum(r * 1.05, 0.4, 10, 0.08), 0) }, { p: [r * 1.02, sg.y + sg.h + r * 0.55, zc], mirror: true }, 'ore-pod');
    } else {
      const hp = new Hull([
        { z: zc - plen / 2, w: sg.w * 0.7, h: sg.h * 0.4 * A, y: sg.y - sg.h, tw: 1, bw: 0.4, ct: 0.1, cb: 0.8 },
        { z: zc + plen / 2, w: sg.w * 0.7, h: sg.h * 0.4 * A, y: sg.y - sg.h, tw: 1, bw: 0.4, ct: 0.1, cb: 0.8 },
      ]);
      b.add('accent2', hp.tris(), null, 'hopper');
      b.add('accent', hazard(hp.quad(FACE8.right, 0), { along: 'v', t0: 0.05, t1: 0.95, a0: 0.2, a1: 0.8, n: 6, h: 0.05 }), { mirror: true }, 'hopper-hazard');
    }
  }

  // --- cab / bridge ---
  const cabSeg = S.cab === 'aft' ? segs[0] : segs[nSeg - 1];
  const cw = Math.min(cabSeg.w * 1.1, 5), ch = 2.2, cd = 3.2;
  const cx = S.cab === 'side' ? cabSeg.w * 0.55 : 0;
  const cz = S.cab === 'aft' ? cabSeg.z0 + cd * 0.7 : cabSeg.z1 - cd * 0.75;
  const cy = cabSeg.y + cabSeg.h + ch / 2 - 0.15;
  b.add(windowedBox(cw, ch, cd, 0.3, ['+z', '+x', '-x'], { rows: 1, pitch: 0.9, wh: 0.26, at: 0.6, ch: 'primary' }), { p: [cx, cy, cz] }, 'cab');
  b.add('structure', cbox(cw * 0.6, 0.8, cd * 0.6, 0.15), { p: [cx, cy + ch / 2 + 0.3, cz - 0.3] }, 'cab-roof');
  addAntenna(b, [cx + cw * 0.3, cy + ch / 2 + 0.6, cz - 0.6], 3 + tier, 0.07);

  // --- crane arm ---
  if (S.crane) {
    const sg = segs[Math.max(0, nSeg - 2)];
    const bz = (sg.z0 + sg.z1) / 2;
    const by = sg.y + sg.h;
    const bx = S.cab === 'side' ? -sg.w * 0.45 : sg.w * 0.45;
    const l1 = sl * 0.7 * A, l2 = sl * 0.6 * A, aw = 0.55;
    const ph1 = 0.55, ph2 = 0.5;
    b.add('structure', cdrum(0.9, 0.8, 10, 0.15), { p: [bx, by + 0.2, bz], r: [-Math.PI / 2, 0, 0] }, 'crane-base');
    const j0 = [bx, by + 0.55, bz];
    const d1 = [0, Math.sin(ph1), Math.cos(ph1)];
    const c1 = [j0[0], j0[1] + d1[1] * l1 / 2, j0[2] + d1[2] * l1 / 2];
    b.add('accent', cbox(aw, aw, l1, 0.1), { p: c1, r: [-ph1, 0, 0] }, 'crane-arm1');
    const j1 = [j0[0], j0[1] + d1[1] * l1, j0[2] + d1[2] * l1];
    b.add('structure', drum(aw * 0.8, aw * 1.6, 8), { p: j1, r: [0, Math.PI / 2, 0] }, 'crane-joint');
    const d2 = [0, -Math.sin(ph2), Math.cos(ph2)];
    const c2 = [j1[0], j1[1] + d2[1] * l2 / 2, j1[2] + d2[2] * l2 / 2];
    b.add('accent', cbox(aw * 0.8, aw * 0.8, l2, 0.08), { p: c2, r: [ph2, 0, 0] }, 'crane-arm2');
    const j2 = [j1[0], j1[1] + d2[1] * l2, j1[2] + d2[2] * l2];
    b.add('structure', [...offset(box(0.25, 0.9, 0.5), [-0.3, -0.35, 0]), ...offset(box(0.25, 0.9, 0.5), [0.3, -0.35, 0]), ...box(0.9, 0.3, 0.6)], { p: j2 }, 'crane-claw');
  }

  // --- engines on the aft face ---
  const aft = segs[0];
  const ne = S.nEng;
  const er = Math.min(aft.w * (ne >= 3 ? 0.4 : 0.5), aft.h * 0.55);
  const pos = ne === 2 ? [[-er * 1.1, 0], [er * 1.1, 0]] : ne === 3 ? [[-er * 1.15, -er * 0.5], [er * 1.15, -er * 0.5], [0, er * 0.75]] : [[-er * 1.05, -er * 1.05], [er * 1.05, -er * 1.05], [-er * 1.05, er * 1.05], [er * 1.05, er * 1.05]];
  const sc = ne === 4 ? Math.min(1, (aft.h * 0.86) / (er * 2.1)) : 1;
  for (const [x, y] of pos) addEngine(b, { x: x * sc, y: aft.y + y * sc, z: aft.z0 - er * sc * 0.45, r: er * sc, length: sl * 0.5, seg: 8, ch: 'structure', bands: 2 });
  b.add('accent', hazard(aft.hull.quad(FACE8.right, 0), { along: 'u', t0: 0.05, t1: 0.95, a0: 0.1, a1: 0.9, n: 5, h: 0.05 }), { mirror: true }, 'aft-hazard');

  return { signature: `${nSeg} segments`, sigValue: nSeg };
}
