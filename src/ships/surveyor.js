// Surveyor / Scanner: slim hull with a large coaxial sensor ring haloing the
// nose (twin rings at large tier), emissive hoop, sensor nodes on the ring.
// Family signature: rings x nodes.
import { torus, chamferRect, cbox, cdrum, drum, box, wingSurface, Hull, boxFace, patch, rect } from '../geom.js';
import { addEngine, addAntenna, addDish, windowRow, hazard, ribs, offset, offsetZ } from '../details.js';
import { hull, FACE8 } from './common.js';

export function buildSurveyor(b, { style, rng, tier, P }) {
  const S = {
    L: [24, 34, 48][tier] * style.float(0.9, 1.12) * P.len,
    R: style.float(0.17, 0.27), // ring radius as fraction of L
    ringPos: style.float(0.0, 1.0),
    spokes: style.pick([3, 4, 4, 6]),
    spokeRot: style.chance(0.5),
    ringProf: style.pick(['flat', 'deep', 'square']),
    body: style.pick(['needle', 'spindle', 'stepped']),
    radiators: style.pick(['cross', 'pair', 'solar', 'tanks', 'solar']),
    ringType: style.pick(['hoop', 'shroud', 'lattice', 'hoop']),
    habRing: style.chance(0.4),
    dish: style.chance(0.7),
    nEng: style.pick([1, 2, 3]),
    prof: { tw: style.float(0.4, 0.9), bw: style.float(0.4, 0.9), ct: style.float(0.3, 0.7), cb: style.float(0.3, 0.7) },
  };
  const L = S.L * rng.float(0.97, 1.03);
  const z0 = -L / 2;
  const r = L * 0.045; // hull half-size
  const dens = P.detail;
  const A = P.append;
  const rings = tier === 2 ? 2 : 1;
  const nodes = [4, 6, 8][tier];
  const pr = S.prof;

  // --- hull ---
  let secs;
  if (S.body === 'needle') {
    secs = [
      { z: z0, w: r * 1.3, h: r * 1.3 },
      { z: z0 + 0.18 * L, w: r * 1.5, h: r * 1.4 },
      { z: z0 + 0.3 * L, w: r * 0.9, h: r * 0.9 },
      { z: z0 + 0.82 * L, w: r * 0.85, h: r * 0.85 },
      { z: z0 + 0.92 * L, w: r * 1.1, h: r * 1.1 },
      { z: L / 2, w: r * 0.3, h: r * 0.3 },
    ];
  } else if (S.body === 'spindle') {
    secs = [
      { z: z0, w: r * 1.0, h: r * 1.0 },
      { z: z0 + 0.25 * L, w: r * 1.7, h: r * 1.6 },
      { z: z0 + 0.55 * L, w: r * 1.5, h: r * 1.5 },
      { z: z0 + 0.85 * L, w: r * 0.8, h: r * 0.8 },
      { z: L / 2, w: r * 0.25, h: r * 0.25 },
    ];
  } else {
    secs = [
      { z: z0, w: r * 1.5, h: r * 1.3 },
      { z: z0 + 0.3 * L, w: r * 1.5, h: r * 1.3 },
      { z: z0 + 0.33 * L, w: r * 1.05, h: r * 1.0 },
      { z: z0 + 0.62 * L, w: r * 1.05, h: r * 1.0 },
      { z: z0 + 0.65 * L, w: r * 0.75, h: r * 0.75 },
      { z: z0 + 0.9 * L, w: r * 0.75, h: r * 0.75 },
      { z: L / 2, w: r * 0.35, h: r * 0.35 },
    ];
  }
  secs = secs.map((s) => ({ ...pr, ...s }));
  const h = hull(b, secs, rng, dens, { label: 'hull', plates: { faces: [0, 1, 2, 3, 4, 5, 6, 7], size: L * 0.05, gap: L * 0.0025, h: L * 0.0015, altChance: 0.08 } });

  // window strip along the flank
  const wb = Math.max(1, Math.floor(h.nBands / 2) - 1);
  b.add('windows', windowRow(h.quad(FACE8.right, wb), { along: 'v', t0: 0.1, t1: 0.9, a0: 0.45, a1: 0.6, count: 6, fill: 0.55, h: L * 0.002 }), { mirror: true }, 'windows');

  // --- sensor ring(s) ---
  const ringZ0 = z0 + (0.68 + S.ringPos * 0.12) * L;
  const rt = S.ringType;
  for (let k = 0; k < rings; k++) {
    const rz = ringZ0 - k * L * (rt === 'shroud' ? 0.22 : 0.2);
    const hs = h.at(rz);
    const hullR = Math.max(hs.w, hs.h);
    let R, depth, thick, seg, prof;
    if (rt === 'shroud') {
      // deep, close-fitting cowl around the nose
      R = hullR + L * (0.05 + 0.12 * (S.R - 0.17)) * A * (k ? 0.85 : 1) + L * 0.03;
      depth = L * (0.11 + 0.04 * S.ringPos); thick = L * 0.03; seg = 16;
      prof = chamferRect(depth / 2, thick / 2, thick * 0.45);
    } else if (rt === 'lattice') {
      R = L * S.R * A * 1.08 * (k === 0 ? 1 : 0.82);
      depth = L * 0.028; thick = L * 0.012; seg = 40;
      prof = chamferRect(depth / 2, thick / 2, thick * 0.3);
    } else {
      R = L * S.R * A * (k === 0 ? 1 : 0.82);
      depth = L * (S.ringProf === 'deep' ? 0.06 : S.ringProf === 'square' ? 0.035 : 0.045);
      thick = L * (S.ringProf === 'square' ? 0.035 : 0.018); seg = 36;
      prof = chamferRect(depth / 2, thick / 2, Math.min(depth, thick) * 0.3);
    }
    b.add('primary', offsetZ(torus(R, prof, seg), rz), null, 'ring' + k);
    // emissive hoop on the inner face
    const hp = chamferRect(depth * (rt === 'shroud' ? 0.16 : 0.14), thick * 0.1, thick * 0.03);
    b.add('engineGlow', offsetZ(torus(R - thick / 2, hp, seg), rz), null, 'hoop' + k);
    // accent trim band at the ring's leading edge
    const tp = chamferRect(depth * 0.08, thick * 0.56, thick * 0.05);
    b.add('accent', offsetZ(torus(R, tp, seg), rz + depth * 0.42), null, 'ring-trim' + k);
    if (rt === 'lattice') {
      // inner concentric ring
      b.add('accent2', offsetZ(torus(R * 0.62, chamferRect(depth * 0.4, thick * 0.45, thick * 0.1), seg), rz), null, 'inner-ring' + k);
    }

    // spokes
    const ns = rt === 'lattice' ? 8 : rt === 'shroud' ? 4 : S.spokes;
    const rot0 = S.spokeRot ? Math.PI / ns : 0;
    const rin = Math.min(hs.w, hs.h) * 0.6;
    for (let s = 0; s < ns; s++) {
      const a = rot0 + (s / ns) * Math.PI * 2;
      const lenS = R - rin;
      const rc = (rin + R) / 2;
      const sp = cbox(L * (rt === 'lattice' ? 0.007 : 0.012), lenS, depth * (rt === 'shroud' ? 0.35 : 0.55), L * 0.002);
      b.add('structure', sp, { p: [-Math.sin(a) * rc, Math.cos(a) * rc, rz], r: [0, 0, a] }, 'spoke');
    }
    // hub collar where spokes meet the hull
    const hc = new Hull([
      { ...hs, z: rz - depth * 0.45, w: hs.w * 1.25, h: hs.h * 1.25 },
      { ...hs, z: rz + depth * 0.45, w: hs.w * 1.25, h: hs.h * 1.25 },
    ]);
    b.add('accent2', hc.tris(), null, 'hub');

    // sensor nodes on the outer rim
    const nn = Math.max(3, Math.round(nodes * (k === 0 ? 1 : 0.75)));
    for (let m = 0; m < nn; m++) {
      const a = rot0 + Math.PI / ns + (m / nn) * Math.PI * 2;
      const nr = R + thick / 2;
      const ns2 = L * 0.022 * (1 + tier * 0.15);
      const pod = cbox(ns2, ns2 * 1.1, ns2 * 1.6, ns2 * 0.2);
      const lens = offsetZ(drum(ns2 * 0.28, ns2 * 0.4, 8), ns2 * 0.8);
      b.add({ structure: offset(pod, [0, ns2 * 0.4, 0]), windows: offset(lens, [0, ns2 * 0.4, 0]) },
        { p: [-Math.sin(a) * nr, Math.cos(a) * nr, rz], r: [0, 0, a] }, 'node');
    }
  }

  // --- forward sensor head ---
  const nose = h.at(L / 2);
  b.add('glass', cdrum(r * 0.7, L * 0.04, 10, r * 0.25), { p: [0, nose.y || 0, L / 2 + L * 0.005] }, 'sensor-dome');
  b.add('structure', drum(L * 0.004, L * 0.1, 5), { p: [0, nose.y || 0, L / 2 + L * 0.06] }, 'probe');

  // --- engines ---
  const es = h.at(z0);
  const er = S.nEng === 1 ? Math.min(es.w, es.h) * 0.9 : Math.min(es.w, es.h) * 0.55;
  const epos = S.nEng === 1 ? [[0, 0]] : S.nEng === 2 ? [[er * 1.05, 0], [-er * 1.05, 0]] : [[er * 1.05, -er * 0.5], [-er * 1.05, -er * 0.5], [0, er * 0.75]];
  for (const [x, y] of epos) addEngine(b, { x, y, z: z0 - er * 0.5, r: er, length: L * 0.14, seg: 10, ch: 'structure' });

  // --- aft systems: radiator fins, solar wings or tank cluster ---
  if (S.radiators === 'cross' || S.radiators === 'pair') {
    const rz = z0 + 0.12 * L;
    const fl = L * 0.2, fs = L * 0.11 * A;
    const angles = S.radiators === 'cross' ? [Math.PI / 4, -Math.PI / 4] : [0];
    for (const a of angles) {
      const hs = h.at(rz);
      const panel = cbox(fs, L * 0.006, fl, L * 0.002);
      const q = boxFace(fs, L * 0.006, fl, '+y');
      const fins = ribs(q, 7, L * 0.002, 'v', 0.35);
      const qb = boxFace(fs, L * 0.006, fl, '-y');
      const finsB = ribs(qb, 7, L * 0.002, 'v', 0.35);
      const x = hs.w * 0.6 + fs / 2;
      const c = Math.cos(a), s = Math.sin(a);
      b.add({ accent2: panel, structure: [...fins, ...finsB] }, { p: [c * x, s * x, rz], r: [0, 0, a], mirror: true }, 'radiator');
    }
  } else if (S.radiators === 'solar') {
    const rz = z0 + 0.28 * L;
    const hs = h.at(rz);
    const span = L * 0.3 * A, pw = L * 0.13, pd = L * 0.07;
    const mastL = hs.w + span;
    b.add('structure', cbox(mastL * 2, L * 0.008, L * 0.008, L * 0.002), { p: [0, hs.y || 0, rz] }, 'solar-mast');
    for (let k = 0; k < 2; k++) {
      const cx = hs.w + L * 0.03 + pw * (k + 0.5) + k * L * 0.01;
      const frame = cbox(pw, L * 0.004, pd * 2, L * 0.001);
      const q = boxFace(pw, L * 0.004, pd * 2, '+y');
      const cells = [];
      const nu = 4, nv = 3;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) cells.push(...patch(q, rect(i / nu + 0.02, (i + 1) / nu - 0.02, j / nv + 0.03, (j + 1) / nv - 0.03), L * 0.0012, L * 0.001));
      b.add({ structure: frame, glass: cells }, { p: [cx, hs.y || 0, rz], mirror: true }, 'solar-panel');
    }
  } else if (S.radiators === 'tanks') {
    const rz = z0 + 0.22 * L;
    const hs = h.at(rz);
    const hr = Math.max(hs.w, hs.h);
    const tr = hr * 0.75 * A, tl = L * 0.2;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const a = Math.PI / 4 + (k / n) * Math.PI * 2;
      const d = hr * 0.75 + tr * 0.85;
      b.add({ accent2: cdrum(tr, tl, 10, tr * 0.35), structure: [...offsetZ(cdrum(tr * 1.04, tl * 0.05, 10, tr * 0.02), tl * 0.25), ...offsetZ(cdrum(tr * 1.04, tl * 0.05, 10, tr * 0.02), -tl * 0.25)] },
        { p: [Math.cos(a) * d, (hs.y || 0) + Math.sin(a) * d, rz] }, 'tank');
    }
  }

  // --- hab ring / mid modules ---
  const midZ = z0 + 0.45 * L;
  if (S.habRing) {
    const ms = h.at(midZ);
    const hr = Math.max(ms.w, ms.h) * 1.5;
    b.add('primary', offsetZ(torus(hr, chamferRect(L * 0.03, hr * 0.45, L * 0.008), 12), midZ), null, 'hab');
    b.add('windows', offsetZ(torus(hr * 1.45, chamferRect(L * 0.01, hr * 0.02, L * 0.002), 12), midZ), null, 'hab-windows');
  } else {
    const ms = h.at(midZ);
    const mw = ms.w * 1.4;
    const mod = cbox(mw * 2, ms.h * 2.2, L * 0.12, L * 0.006);
    b.add('primary', mod, { p: [0, ms.y || 0, midZ] }, 'module');
    const q = boxFace(mw * 2, ms.h * 2.2, L * 0.12, '+x');
    b.add('windows', windowRow(q, { along: 'u', t0: 0.1, t1: 0.9, a0: 0.55, a1: 0.68, count: 5, fill: 0.5, h: L * 0.002 }), { p: [0, ms.y || 0, midZ], mirror: true }, 'module-windows');
    b.add('accent', hazard(q, { along: 'u', t0: 0.02, t1: 0.98, a0: 0.08, a1: 0.22, n: 8, h: L * 0.002 }), { p: [0, ms.y || 0, midZ], mirror: true }, 'module-hazard');
  }
  if (S.dish) {
    const dz = z0 + 0.3 * L;
    addDish(b, [0, h.top(dz) - r * 0.1, dz], L * 0.05 * A, [-0.9, 0.5, 0]);
  }
  addAntenna(b, [0, h.bottom(z0 + 0.6 * L) + r * 0.1, z0 + 0.6 * L], L * 0.08, L * 0.002, { tip: true, down: true });
  return { signature: `${rings} ring${rings > 1 ? 's' : ''} · ${nodes} nodes`, sigValue: rings * 10 + nodes };
}
