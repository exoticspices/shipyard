// Fighter / Interceptor: dart fuselage, canopy, swept wings, 1-3 engines.
// Family signature: engine count = tier + 1.
import { wingSurface, WING_TOP, patch, rect, drum, duct, cbox, box, Hull } from '../geom.js';
import { addEngine, addAntenna, offsetZ, offset, windowRow, hazard } from '../details.js';
import { hull, FACE8 } from './common.js';

export function buildFighter(b, { style, rng, tier, P }) {
  const S = {
    L: [9, 12.5, 17][tier] * style.float(0.88, 1.12) * P.len,
    wing: style.pick(['swept', 'delta', 'forward', 'cranked', 'xwing', 'swept', 'delta']),
    W: style.float(0.075, 0.115), H: style.float(0.05, 0.08),
    nose: style.pick(['needle', 'blunt', 'shovel', 'needle']),
    tail: style.pick(['single', 'twin', 'canted', 'none']),
    canopy: style.float(0, 1),
    pods: style.chance(0.45),
    intake: style.chance(0.6),
    tip: style.pick(['guns', 'fins', 'missiles', 'plain']),
    stripe: style.chance(0.6),
    spine: style.chance(0.45),
    wingY: style.pick([-0.45, -0.1, 0.35]),
    dih: style.float(-0.12, 0.16),
    prof: { tw: style.float(0.35, 0.8), bw: style.float(0.4, 0.85), ct: style.float(0.3, 0.7), cb: style.float(0.3, 0.7) },
    span: style.float(0.85, 1.15),
  };
  const L = S.L * rng.float(0.97, 1.03);
  // tiers scale the silhouette, not just the size: S = nimble single-seat dart,
  // L = heavy two-seater with side nacelles, dorsal deck, twin tails, canards
  const small = tier === 0, big = tier === 2;
  const W = S.W * L * [0.94, 1, 1.12][tier], H = S.H * L * [0.96, 1, 1.06][tier];
  if (small && S.tail === 'twin') S.tail = 'single';
  if (big && (S.tail === 'single' || S.tail === 'none')) S.tail = S.tail === 'single' ? 'twin' : 'canted';
  if (big) S.intake = true;
  if (small) S.intake = false;
  const z0 = -L / 2;
  const n = tier + 1;
  const A = P.append;
  const dens = P.detail;

  // --- engine layout ---
  const pods = (S.pods && n >= 2) || big;
  let eng = [];
  let re;
  if (pods) {
    re = W * (n === 2 ? 0.55 : 0.5);
    const px = W + re * 1.25 + W * 0.3 * A;
    eng = [[px, -H * 0.1], [-px, -H * 0.1]];
    if (n === 3) eng.push([0, 0]);
  } else if (n === 1) { re = Math.min(W, H) * 0.95; eng = [[0, 0]]; }
  else if (n === 2) { re = Math.min(W * 0.55, H * 0.95); eng = [[re * 1.04, 0], [-re * 1.04, 0]]; }
  else { re = Math.min(W * 0.5, H * 0.85); eng = [[re * 1.08, -re * 0.45], [-re * 1.08, -re * 0.45], [0, re * 0.62]]; }
  const buried = eng.filter(([x]) => Math.abs(x) < W * 1.5);
  let tx = W * 0.5, ty0 = -H * 0.6, ty1 = H * 0.6;
  for (const [x, y] of buried) { tx = Math.max(tx, Math.abs(x) + re * 0.92); ty0 = Math.min(ty0, y - re * 0.92); ty1 = Math.max(ty1, y + re * 0.92); }

  // --- fuselage ---
  const pr = S.prof;
  const secs = [
    { z: z0, w: tx, h: (ty1 - ty0) / 2, y: (ty1 + ty0) / 2, ...pr },
    { z: z0 + 0.16 * L, w: Math.max(W, tx), h: Math.max(H, (ty1 - ty0) / 2), y: Math.max(0, (ty1 + ty0) / 2) * 0.5, ...pr },
    { z: z0 + 0.45 * L, w: W * 1.05, h: H * 1.05, y: H * 0.05, ...pr },
    { z: z0 + 0.68 * L, w: W * 0.82, h: H * 0.92, y: H * 0.1, ...pr },
  ];
  if (S.nose === 'needle') secs.push({ z: z0 + 0.87 * L, w: W * 0.42, h: H * 0.48, y: -H * 0.02, ...pr }, { z: L / 2, w: W * 0.08, h: H * 0.08, y: -H * 0.12, ...pr });
  else if (S.nose === 'blunt') secs.push({ z: z0 + 0.88 * L, w: W * 0.62, h: H * 0.66, y: 0, ...pr }, { z: L / 2 - 0.02 * L, w: W * 0.36, h: H * 0.34, y: -H * 0.05, ...pr });
  else secs.push({ z: z0 + 0.86 * L, w: W * 0.9, h: H * 0.45, y: -H * 0.32, ...pr }, { z: L / 2, w: W * 0.72, h: H * 0.12, y: -H * 0.5, ...pr, tw: 0.9, ct: 0.4 });

  const fus = hull(b, secs, rng, dens, {
    label: 'fuselage',
    plates: { faces: [0, 1, 2, 3, 4, 5, 6], size: L * 0.075, gap: L * 0.004, h: L * 0.0025, altChance: 0.05 },
  });

  // racing stripe / dorsal spine
  if (S.stripe) {
    const st = [];
    for (let j = 1; j < fus.nBands; j++) st.push(...patch(fus.quad(FACE8.top, j), rect(0.32, 0.68, 0.02, 0.98), L * 0.004, L * 0.003));
    b.add('accent', st, null, 'stripe');
  }
  if (S.spine && tier === 1) {
    const zs = z0 + 0.12 * L, ze = z0 + 0.62 * L;
    const sp = new Hull([
      { z: zs, w: W * 0.18, h: H * 0.2, y: fus.top(zs) },
      { z: zs + 0.1 * L, w: W * 0.25, h: H * 0.35, y: fus.top(zs + 0.1 * L) },
      { z: ze, w: W * 0.12, h: H * 0.05, y: fus.top(ze) },
    ]);
    b.add('primary', sp.tris(), null, 'spine');
  }

  // --- canopy ---
  const cLen = big ? 0.3 : small ? 0.2 : 0.22;
  const cz0 = z0 + ((big ? 0.44 : 0.5) + S.canopy * (big ? 0.1 : 0.12)) * L, cz1 = cz0 + cLen * L;
  const cH = small ? 1.15 : 1;
  const cy = (z) => fus.top(z) - H * 0.1;
  const can = new Hull([
    { z: cz0, w: W * 0.32, h: H * 0.12, y: cy(cz0), tw: 0.6, bw: 1, ct: 0.6, cb: 0.1 },
    { z: cz0 + 0.08 * L, w: W * 0.5, h: H * 0.42 * cH, y: cy(cz0 + 0.08 * L), tw: 0.45, bw: 1, ct: 0.6, cb: 0.1 },
    ...(big ? [{ z: cz0 + 0.19 * L, w: W * 0.48, h: H * 0.4, y: cy(cz0 + 0.19 * L), tw: 0.45, bw: 1, ct: 0.6, cb: 0.1 }] : []),
    { z: cz1, w: W * 0.22, h: H * 0.08, y: cy(cz1), tw: 0.6, bw: 1, ct: 0.6, cb: 0.1 },
  ]);
  b.add('glass', can.tris(), null, 'canopy');
  // canopy frame rib
  b.add('structure', offsetZ(cbox(W * 1.02, H * 0.86 * cH, L * 0.012, L * 0.002), 0), { p: [0, cy(cz0 + 0.08 * L) + H * 0.02, cz0 + 0.08 * L] }, 'canopy-frame');
  if (big) b.add('structure', cbox(W * 0.98, H * 0.84, L * 0.01, L * 0.002), { p: [0, cy(cz0 + 0.19 * L) + H * 0.02, cz0 + 0.19 * L] }, 'canopy-frame2');

  // --- L: dorsal deck (second fuselage layer) running from the tail to the canopy ---
  let deck = null;
  if (big) {
    const dz = (t) => z0 + t * L;
    const ds = (z, w, h) => ({ z, w, h, y: fus.top(z) - H * 0.06, tw: 0.6, bw: 1, ct: 0.45, cb: 0.1 });
    deck = hull(b, [ds(dz(0.0), W * 0.48, H * 0.22), ds(dz(0.13), W * 0.74, H * 0.44), ds(dz(0.36), W * 0.68, H * 0.42), ds(cz0 + 0.015 * L, W * 0.34, H * 0.14)], rng, dens, {
      label: 'deck', base: 'structure', plates: { faces: [1, 2, 3, 4, 5], size: L * 0.07, gap: L * 0.004, h: L * 0.0025, altChance: 0.08 },
    });
    if (S.stripe) b.add('accent', patch(deck.quad(FACE8.top, 1), rect(0.3, 0.7, 0.02, 0.98), L * 0.004, L * 0.003), null, 'deck-stripe');
  }
  const topAt = (z) => (deck && z >= deck.zMin && z <= deck.zMax ? Math.max(deck.top(z), fus.top(z)) : fus.top(z));

  // --- engines ---
  const eLen = L * (pods ? 0.42 : 0.3);
  for (const [x, y] of eng) {
    const outboard = Math.abs(x) > W * 1.5;
    if (outboard && x < 0) continue; // mirrored below
    addEngine(b, { x, y, z: z0 - re * 0.45, r: re, length: eLen, seg: 10, ch: outboard ? 'primary' : 'structure', mirror: outboard, bands: outboard ? 2 : 1 });
    if (outboard) {
      // pod nose cone ahead of the engine body + pylon to fuselage
      const pz = z0 - re * 0.45 + eLen * 0.95;
      const cone = new Hull([
        { z: pz - re * 0.4, w: re * 0.62, h: re * 0.62, x, y, tw: 0.5, bw: 0.5, ct: 0.5, cb: 0.5 },
        { z: pz + L * 0.12, w: re * 0.35, h: re * 0.35, x, y, tw: 0.5, bw: 0.5, ct: 0.5, cb: 0.5 },
        { z: pz + L * 0.16, w: re * 0.08, h: re * 0.08, x, y, tw: 0.5, bw: 0.5, ct: 0.5, cb: 0.5 },
      ]);
      b.add({ accent: cone.tris() }, { mirror: true }, 'pod-cone');
      const pyl = cbox(x, H * 0.4, L * 0.16, H * 0.06);
      b.add({ structure: pyl }, { p: [x / 2, y, z0 + 0.22 * L], mirror: true }, 'pylon');
    }
  }

  // --- wings ---
  const wy = S.wingY * H;
  const t0 = H * 0.36, t1 = t0 * 0.4;
  const span = L * 0.42 * S.span * A * [0.86, 1, 1.16][tier];
  const rx = W * 0.4;
  let wings = [];
  const wz = z0 + 0.36 * L;
  switch (S.wing) {
    case 'swept': {
      const rc = 0.4 * L;
      wings = [[{ x: rx, y: wy, z: wz, c: rc, t: t0 }, { x: rx + span, y: wy + span * S.dih, z: wz - 0.24 * L * A, c: rc * 0.32, t: t1 }]];
      break;
    }
    case 'delta': {
      const rc = 0.62 * L, tc = 0.06 * L;
      wings = [[{ x: rx, y: wy, z: wz - 0.04 * L, c: rc, t: t0 }, { x: rx + span * 0.85, y: wy + span * S.dih * 0.5, z: wz - 0.04 * L - rc / 2 + tc / 2 + 0.02 * L, c: tc, t: t1 }]];
      break;
    }
    case 'forward': {
      const rc = 0.34 * L;
      wings = [[{ x: rx, y: wy, z: wz - 0.08 * L, c: rc, t: t0 }, { x: rx + span, y: wy + span * S.dih, z: wz + 0.06 * L * A, c: rc * 0.45, t: t1 }]];
      break;
    }
    case 'cranked': {
      const rc = 0.58 * L;
      wings = [[
        { x: rx, y: wy, z: wz, c: rc, t: t0 },
        { x: rx + span * 0.42, y: wy + span * 0.1 * S.dih, z: wz - 0.12 * L, c: 0.3 * L, t: t0 * 0.7 },
        { x: rx + span, y: wy + span * S.dih, z: wz - 0.26 * L * A, c: 0.1 * L, t: t1 },
      ]];
      break;
    }
    case 'xwing': {
      const rc = 0.3 * L;
      const zx = z0 + 0.26 * L;
      for (const sgn of [1, -1]) {
        wings.push([{ x: rx, y: sgn * H * 0.35, z: zx, c: rc, t: t0 * 0.8 }, { x: rx + span * 0.95, y: sgn * (H * 0.35 + span * 0.32), z: zx - 0.05 * L, c: rc * 0.6, t: t1 }]);
      }
      break;
    }
  }
  wings.forEach((ws, k) => {
    const ws2 = wingSurface(ws);
    b.add({ primary: ws2.tris() }, { mirror: true }, 'wing' + k);
    const last = ws2.nBands - 1;
    const deco = [];
    deco.push(...patch(ws2.quad(WING_TOP, last), rect(0.12, 0.88, 0.62, 0.8), L * 0.003, L * 0.003));
    if (S.stripe) deco.push(...patch(ws2.quad(WING_TOP, 0), rect(0.15, 0.85, 0.15, 0.24), L * 0.003, L * 0.003));
    b.add({ accent: deco }, { mirror: true }, 'wing-deco');
    // flap seams in structure on the upper skin
    b.add({ structure: patch(ws2.quad(WING_TOP, 0), rect(0.02, 0.2, 0.08, 0.55 + 0.4 * (ws2.nBands - 1)), L * 0.002, L * 0.002) }, { mirror: true }, 'flap');

    // underwing loadout grows with tier
    const tip = ws[ws.length - 1];
    if (S.wing !== 'xwing') {
      const root = ws[0];
      for (let m = 0; m < tier * 1; m++) {
        const f = 0.38 + 0.26 * m;
        const mx = root.x + (tip.x - root.x) * f, my = root.y + (tip.y - root.y) * f;
        const mzc = root.z + (tip.z - root.z) * f;
        const tt = root.t + (tip.t - root.t) * f;
        const mr = L * 0.011, ml = L * 0.15;
        b.add({ accent2: drum(mr, ml, 6, { r2: mr * 0.35 }), structure: offset(box(mr * 0.6, tt * 0.6 + mr, ml * 0.5), [0, mr + tt * 0.2, 0]) },
          { p: [mx, my - tt * 0.45 - mr, mzc + ml * 0.1], mirror: true }, 'pylon-missile');
      }
    }
    if (S.tip === 'guns' || S.wing === 'xwing') {
      const gl = L * 0.36, gr = Math.max(t1 * 0.7, L * 0.008);
      const g = offsetZ(drum(gr, gl, 6), 0);
      const mz = offsetZ(drum(gr * 0.45, gl * 0.4, 5), gl * 0.65);
      b.add({ structure: g, accent2: mz }, { p: [tip.x, tip.y, tip.z + gl * 0.15], mirror: true }, 'tip-gun');
    } else if (S.tip === 'missiles') {
      for (let m = 0; m < 2; m++) {
        const mr = L * 0.012, ml = L * 0.16;
        b.add({ accent2: drum(mr, ml, 6, { r2: mr * 0.4 }) }, { p: [tip.x - L * 0.02 * (m + 1) - span * 0.12 * m, tip.y - t1 * 0.5 - mr * 0.6, tip.z + 0.01 * L], mirror: true }, 'missile');
      }
    } else if (S.tip === 'fins') {
      const fin = wingSurface([{ x: 0, y: 0, z: 0, c: tip.c * 1.1, t: t1 }, { x: L * 0.06 * A, y: 0, z: -tip.c * 0.3, c: tip.c * 0.45, t: t1 * 0.6 }]);
      b.add({ accent: fin.tris() }, { p: [tip.x - t1 * 0.2, tip.y, tip.z], r: [0, 0, Math.PI / 2 - 0.15], mirror: true }, 'tip-fin');
    }
  });

  // --- tail fins ---
  if (S.tail !== 'none' && S.wing !== 'xwing') {
    const fz = z0 + 0.14 * L;
    const fh = L * 0.17 * A;
    const fin = wingSurface([{ x: 0, y: 0, z: 0, c: 0.22 * L, t: H * 0.18 }, { x: fh, y: 0, z: -0.12 * L, c: 0.08 * L, t: H * 0.08 }]);
    if (S.tail === 'single') {
      b.add({ primary: fin.tris() }, { p: [0, fus.top(fz) - H * 0.15, fz], r: [0, 0, Math.PI / 2] }, 'fin');
      b.add({ accent: patch(fin.quad(WING_TOP, 0), rect(0.1, 0.9, 0.7, 0.86), L * 0.003, L * 0.003) }, { p: [0, fus.top(fz) - H * 0.15, fz], r: [0, 0, Math.PI / 2] }, 'fin-deco');
    } else {
      const cant = S.tail === 'twin' ? 0.12 : 0.55;
      const fx = Math.min(tx, W) * 0.7;
      const fx2 = big ? W * 0.62 : fx;
      b.add({ primary: fin.tris() }, { p: [fx2, (big ? topAt(fz) - H * 0.12 : fus.top(fz) - H * 0.25), fz], r: [0, 0, Math.PI / 2 - cant], s: big ? 0.95 : 0.85, mirror: true }, 'fin');
      if (big) b.add({ accent: patch(fin.quad(WING_TOP, 0), rect(0.1, 0.9, 0.7, 0.86), L * 0.003, L * 0.003) }, { p: [fx2, topAt(fz) - H * 0.12, fz], r: [0, 0, Math.PI / 2 - cant], s: 0.95, mirror: true }, 'fin-deco');
    }
  }

  // --- L extras: canards ahead of the wing, ventral fins under the tail ---
  if (big && S.wing !== 'xwing' && S.wing !== 'forward') {
    const cz = Math.min(cz1 + 0.02 * L, z0 + 0.8 * L);
    const cs = fus.at(cz);
    const can = wingSurface([{ x: cs.w * 0.7, y: (cs.y || 0) - H * 0.05, z: cz, c: 0.12 * L, t: H * 0.18 }, { x: cs.w + L * 0.08 * A, y: (cs.y || 0) + L * 0.012, z: cz - 0.05 * L, c: 0.045 * L, t: H * 0.08 }]);
    b.add({ primary: can.tris() }, { mirror: true }, 'canard');
  }
  if (big) {
    const vz = z0 + 0.12 * L;
    const vs = fus.at(vz);
    const vf = wingSurface([{ x: 0, y: 0, z: 0, c: 0.16 * L, t: H * 0.14 }, { x: L * 0.075 * A, y: 0, z: -0.07 * L, c: 0.06 * L, t: H * 0.06 }]);
    b.add({ structure: vf.tris() }, { p: [vs.w * 0.55, (vs.y || 0) - vs.h * 0.7, vz], r: [0, 0, -Math.PI / 2 + 0.45], mirror: true }, 'ventral-fin');
  }

  // --- intakes ---
  if (S.intake) {
    const ihw = W * 0.28, ihh = H * 0.42, il = 0.24 * L;
    const d = duct(ihw, ihh, il, { wall: ihw * 0.22, depth: il * 0.5 });
    const iz = z0 + 0.6 * L;
    const s = fus.at(iz);
    b.add({ primary: d.outer, structure: [...d.inner, ...d.back, ...d.lip] }, { p: [s.w * 0.92, -H * 0.15 + (s.y || 0), iz], r: [0, Math.PI, 0], mirror: true }, 'intake');
  }

  // --- small details ---
  if (S.nose === 'needle') {
    b.add({ structure: drum(L * 0.006, L * 0.12, 5) }, { p: [0, -H * 0.12, L / 2 + L * 0.05] }, 'pitot');
  } else {
    // chin gun
    const gs = fus.at(L / 2 - 0.1 * L);
    b.add({ structure: drum(L * 0.012, L * 0.16, 6) }, { p: [0, (gs.y || 0) - gs.h * 0.85, L / 2 - 0.06 * L] }, 'chin-gun');
  }
  addAntenna(b, [0, topAt(z0 + 0.3 * L) - H * 0.05, z0 + 0.3 * L], L * 0.06, L * 0.0035);
  // hazard chevrons near the canopy hinge + nav strip
  const hq = fus.quad(FACE8.upR, 2);
  b.add({ accent2: hazard(hq, { along: 'v', t0: 0.75, t1: 0.98, a0: 0.15, a1: 0.85, n: 3, h: L * 0.003 }) }, { mirror: true }, 'chevrons');
  b.add({ windows: windowRow(fus.quad(FACE8.right, 1), { along: 'v', t0: 0.2, t1: 0.8, a0: 0.42, a1: 0.52, count: 3, fill: 0.5, h: L * 0.004 }) }, { mirror: true }, 'navlights');

  return { length: L, signature: `${n} engine${n > 1 ? 's' : ''}${tier && S.wing !== 'xwing' ? ` · ${tier * 2} missiles` : ''}`, sigValue: n };
}
