// Racer: a multi-hull speedster. One dominant cockpit hull carries a dorsal
// spine + canopy; subordinate engine nacelles are arranged per layout
// (arrowhead / catamaran-with-pod / bundle), shorter and set back the further
// out they sit, and tied together by one continuous swept wing or strakes.
// Family signature: hull count 3/5/7 (every hull ends in its own engine).
import { Hull, wingSurface, WING_TOP, patch, rect, cbox, drum, loft, ringZ, profile8, ngon } from '../geom.js';
import { addEngine } from '../details.js';
import { hull, collar, FACE8 } from './common.js';

export function buildRacer(b, { style, rng, tier, P }) {
  const S = {
    L: [11, 14.5, 18.5][tier] * style.float(0.9, 1.1) * P.len,
    layout: style.weighted([['arrow', 4], ['cat', 3], ['bundle', 2]]),
    r: style.float(0.05, 0.064),
    ha: style.float(0.68, 0.92), // hull height / width
    falloff: style.float(0.17, 0.24), // each step outward: this much shorter
    setback: style.float(0.03, 0.07), // ...and this much further aft
    spread: style.float(1.5, 2.0),
    drop: style.pick([-0.45, -0.25, 0, 0.2]),
    noseMain: style.pick(['needle', 'chisel', 'needle']),
    noseOuter: style.pick(['intake', 'intake', 'chisel', 'needle']),
    fins: style.pick(['twin', 'dorsal', 'spoiler', 'canted']),
    spineH: style.float(0.6, 0.9),
    canopyAt: style.float(0.52, 0.62),
    tipFins: style.chance(0.5),
    stripe: style.chance(0.75),
    prof: { tw: style.float(0.45, 0.75), bw: style.float(0.5, 0.8), ct: style.float(0.35, 0.6), cb: style.float(0.35, 0.6) },
  };
  const n = [3, 5, 7][tier];
  const L = S.L * rng.float(0.97, 1.03);
  const A = P.append;
  const dens = P.detail;
  const R = L * S.r;
  const zT = -L / 2; // tail station of the main hull

  // ---- hull placements: {x, y, len, r, zt, nose, main?, role} ----
  const H = [];
  const spacing = (ra, rb, f = 1) => (ra + rb) * S.spread * A * f;
  if (S.layout === 'arrow') {
    H.push({ x: 0, y: 0, len: L, r: R, zt: zT, nose: S.noseMain, main: true });
    let x = 0, rp = R;
    for (let k = 1; k <= (n - 1) / 2; k++) {
      const r = R * (0.76 - 0.1 * (k - 1));
      x += spacing(rp, r);
      const len = L * (1 - S.falloff * k);
      H.push({ x, y: S.drop * R * k, len, r, zt: zT - L * S.setback * k, nose: S.noseOuter, pair: k });
      rp = r;
    }
  } else if (S.layout === 'cat') {
    // cockpit pod in the middle, long pontoons outboard, extra hulls further out / underslung
    const pr = R;
    H.push({ x: 0, y: R * 0.3, len: L * 0.8, r: pr, zt: zT + L * 0.2, nose: S.noseMain, main: true });
    const r1 = R * 0.86;
    const X1 = spacing(pr, r1, 1.2);
    H.push({ x: X1, y: -R * 0.1, len: L * 0.86, r: r1, zt: zT, nose: S.noseOuter, pair: 1 });
    if (n >= 5) {
      const r2 = R * 0.62;
      H.push({ x: X1 + spacing(r1, r2), y: S.drop * R - R * 0.15, len: L * (0.86 - S.falloff * 1.6), r: r2, zt: zT - L * S.setback * 1.5, nose: S.noseOuter, pair: 2 });
    }
    if (n >= 7) {
      const r3 = R * 0.52;
      H.push({ x: X1 * 0.5, y: -R * 1.05, len: L * 0.5, r: r3, zt: zT + L * 0.04, nose: 'needle', pair: 3, under: true });
    }
  } else {
    // bundle: main hull on top, nacelles stacked below/outboard in a wedge
    H.push({ x: 0, y: 0, len: L, r: R, zt: zT, nose: S.noseMain, main: true });
    const rows = [
      { x: 1.2, y: -0.72, r: 0.82, k: 1 },
      { x: 2.25, y: -1.05, r: 0.64, k: 2 },
      { x: 0.62, y: -1.62, r: 0.6, k: 2.6 },
    ];
    for (let i = 0; i < (n - 1) / 2; i++) {
      const q = rows[i];
      H.push({ x: q.x * R * (0.85 + 0.15 * A), y: q.y * R, len: L * (1 - S.falloff * q.k), r: R * q.r, zt: zT - L * S.setback * q.k, nose: S.noseOuter, pair: i + 1 });
    }
  }

  // ---- hulls: each outboard pair is built once at +x and mirrored, so the two
  // sides are exact mirror images (plating and accent panels included) ----
  const hulls = [];
  const plateOpts = { faces: [1, 2, 3, 4, 5], size: L * 0.085, aspect: 2.4, gap: L * 0.003, h: L * 0.0022, altChance: 0.07, skip: 0.04 };
  const mb = mirrorBuilder(b);
  H.forEach((p, idx) => {
    hulls.push(nacelle(p.main ? b : mb, rng.fork('h' + idx), dens, p, S, L, plateOpts, `hull${idx}`));
  });
  const main = hulls[0];
  const outer = hulls.filter((h) => h.pair && h.x > 0 && !h.under).sort((a, b2) => a.x - b2.x);
  const outmost = outer[outer.length - 1];

  // ---- underslung hull pylons (catamaran, 7 hulls) ----
  for (const h of hulls.filter((q) => q.under)) {
    const top = h.y + h.rh * 0.6, wingY = R * 0.12;
    b.add('structure', cbox(h.r * 0.5, wingY - top + R * 0.3, h.len * 0.38, h.r * 0.1), { p: [h.x, (top + wingY) / 2, h.zt + h.len * 0.45], mirror: true }, 'under-pylon');
  }

  // ---- main wing / strakes: one continuous swept surface through the hulls ----
  const ws = [];
  const tW = (h) => h.rh * 0.36;
  if (S.layout === 'bundle') {
    // low strakes from the lowest-outboard nacelle
    const lo = outer.reduce((a, h) => (h.x > a.x ? h : a), outer[0]);
    ws.push({ x: lo.x * 0.5, y: lo.y - lo.rh * 0.2, z: lo.zt + lo.len * 0.45, c: lo.len * 0.6, t: tW(lo) });
    ws.push({ x: lo.x, y: lo.y - lo.rh * 0.2, z: lo.zt + lo.len * 0.4, c: lo.len * 0.52, t: tW(lo) });
    ws.push({ x: lo.x + lo.r + L * 0.13 * A, y: lo.y - lo.rh * 0.2 + S.drop * L * 0.04, z: lo.zt + lo.len * 0.12, c: lo.len * 0.16, t: tW(lo) * 0.35 });
  } else {
    const inner = main;
    ws.push({ x: 0, y: inner.y - inner.rh * 0.05, z: inner.zt + inner.len * (S.layout === 'cat' ? 0.4 : 0.44), c: inner.len * (S.layout === 'cat' ? 0.58 : 0.6), t: tW(inner) });
    for (const h of outer) ws.push({ x: h.x, y: h.y - h.rh * 0.05, z: h.zt + h.len * 0.4, c: h.len * 0.52, t: tW(h) });
    ws.push({ x: outmost.x + outmost.r + L * 0.07 * A, y: outmost.y - outmost.rh * 0.05 + S.drop * L * 0.03, z: outmost.zt + outmost.len * 0.2, c: outmost.len * 0.2, t: tW(outmost) * 0.4 });
  }
  const wing = wingSurface(ws);
  b.add('primary', wing.tris(), { mirror: true }, 'wing');
  const lastBand = wing.nBands - 1;
  // chevron on the outboard panel + trailing-edge flap seams
  b.add('accent', patch(wing.quad(WING_TOP, lastBand), rect(0.12, 0.9, 0.55, 0.78), L * 0.003, L * 0.002), { mirror: true }, 'wing-chevron');
  b.add('structure', patch(wing.quad(WING_TOP, 0), rect(0.03, 0.18, 0.15, 0.85), L * 0.002, L * 0.002), { mirror: true }, 'wing-flap');
  const tip = ws[ws.length - 1];
  if (S.tipFins) {
    const fin = wingSurface([{ x: 0, y: 0, z: 0, c: tip.c * 1.1, t: tip.t * 0.8 }, { x: L * 0.05 * A, y: 0, z: -tip.c * 0.35, c: tip.c * 0.5, t: tip.t * 0.5 }]);
    b.add('accent', fin.tris(), { p: [tip.x - tip.t * 0.3, tip.y, tip.z], r: [0, 0, Math.PI / 2 + 0.25], mirror: true }, 'tip-fin');
  }

  // bundle: fairing collars binding the nacelles to the main hull
  if (S.layout === 'bundle') {
    let ext = 0, lo = 0;
    for (const h of hulls) { ext = Math.max(ext, Math.abs(h.x) + h.r * 0.9); lo = Math.min(lo, h.y - h.rh * 0.9); }
    for (const t of [0.18, 0.5]) {
      const z = zT + L * t - L * 0.02;
      const hh = (main.rh * 0.95 - lo) / 2;
      const yc = (main.rh * 0.95 + lo) / 2;
      const sec = (zz) => ({ z: zz, w: ext * 1.04, h: hh * 1.04, y: yc, tw: 0.35, bw: 0.55, ct: 0.6, cb: 0.4 });
      const strap = new Hull([sec(z - L * 0.022), sec(z + L * 0.022)]);
      b.add('accent2', strap.tris(), null, 'fairing');
    }
  }

  // ---- dorsal spine + canopy on the main hull ----
  {
    const h = main, l = h.len, z0 = h.zt;
    const sh = h.rh * S.spineH;
    const ca = S.canopyAt;
    const secs = [
      { z: z0 + l * 0.06, w: h.r * 0.28, h: sh * 0.25 },
      { z: z0 + l * 0.3, w: h.r * 0.46, h: sh * 0.85 },
      { z: z0 + l * (ca - 0.02), w: h.r * 0.5, h: sh },
      { z: z0 + l * (ca + 0.14), w: h.r * 0.42, h: sh * 0.6 },
      { z: z0 + l * (ca + 0.27), w: h.r * 0.16, h: sh * 0.06 },
    ].map((s) => ({ ...s, x: h.x, y: h.h.top(s.z) - h.rh * 0.08, tw: 0.55, bw: 1, ct: 0.55, cb: 0.1 }));
    const spine = new Hull(secs);
    b.add('primary', spine.tris(), null, 'spine');
    if (S.stripe) {
      const st = [];
      for (let j = 0; j < 2; j++) st.push(...patch(spine.quad(FACE8.top, j), rect(0.2, 0.8, 0, 1), L * 0.003, L * 0.002));
      b.add('accent', st, null, 'spine-stripe');
    }
    // canopy
    const c0 = z0 + l * (ca - 0.01), c1 = z0 + l * (ca + 0.22);
    const cy = (z) => spine.top(z) - sh * 0.12;
    const cm = c0 + (c1 - c0) * 0.4;
    const canopy = new Hull([
      { z: c0, w: h.r * 0.36, h: sh * 0.12, x: h.x, y: cy(c0), tw: 0.5, bw: 1, ct: 0.6, cb: 0.1 },
      { z: cm, w: h.r * 0.46, h: sh * 0.45, x: h.x, y: cy(cm), tw: 0.45, bw: 1, ct: 0.6, cb: 0.1 },
      { z: c1, w: h.r * 0.14, h: sh * 0.06, x: h.x, y: Math.max(cy(c1), h.h.top(c1) - h.rh * 0.1), tw: 0.5, bw: 1, ct: 0.6, cb: 0.1 },
    ]);
    b.add('glass', canopy.tris(), null, 'canopy');
    b.add('structure', cbox(h.r * 0.95, sh * 0.5, L * 0.008, L * 0.002), { p: [h.x, cy(cm) + sh * 0.1, cm] }, 'canopy-frame');
    main.spine = spine; main.sh = sh;
  }

  // racing stripes on the main hull nose
  if (S.stripe) {
    const st = [];
    const j0 = main.h.nBands - 2;
    for (let j = Math.max(1, j0 - 1); j <= j0; j++) st.push(...patch(main.h.quad(FACE8.top, j), rect(0.15, 0.85, 0, 1), L * 0.003, L * 0.002));
    b.add('accent', st, null, 'nose-stripe');
  }

  // canards on big racers
  if (tier === 2 && S.layout !== 'bundle') {
    const cz = main.zt + main.len * 0.8;
    const can = wingSurface([{ x: main.r * 0.5, y: main.y, z: cz, c: L * 0.07, t: main.rh * 0.22 }, { x: main.r + L * 0.06 * A, y: main.y + L * 0.006, z: cz - L * 0.03, c: L * 0.03, t: main.rh * 0.1 }]);
    b.add('primary', can.tris(), { mirror: true }, 'canard');
  }

  // ---- fins ----
  const finSurf = (hgt, chord, t) => wingSurface([{ x: 0, y: 0, z: 0, c: chord, t }, { x: hgt, y: 0, z: -chord * 0.45, c: chord * 0.38, t: t * 0.45 }]);
  if (S.fins === 'dorsal' || (S.fins === 'twin' && S.layout === 'bundle')) {
    const fz = main.zt + main.len * 0.12;
    const f = finSurf(L * 0.13 * A, L * 0.2, main.rh * 0.3);
    const xf = { p: [main.x, main.spine.top(fz) - main.sh * 0.3, fz], r: [0, 0, Math.PI / 2] };
    b.add('primary', f.tris(), xf, 'dorsal-fin');
    b.add('accent', patch(f.quad(WING_TOP, 0), rect(0.1, 0.9, 0.7, 0.86), L * 0.003, L * 0.002), xf, 'fin-stripe');
  } else if (S.fins === 'twin' || S.fins === 'canted') {
    const h = S.fins === 'twin' ? outmost : outer[0];
    const cant = S.fins === 'twin' ? 0.12 : 0.5;
    const fz = h.zt + h.len * 0.1;
    const f = finSurf(L * (S.fins === 'twin' ? 0.09 : 0.1) * A, h.len * 0.2, h.rh * 0.35);
    const xf = { p: [h.x, h.h.top(fz) - h.rh * 0.25, fz], r: [0, 0, Math.PI / 2 - cant], mirror: true };
    b.add('primary', f.tris(), xf, 'fin');
    b.add('accent', patch(f.quad(WING_TOP, 0), rect(0.1, 0.9, 0.7, 0.86), L * 0.003, L * 0.002), xf, 'fin-stripe');
  } else {
    // spoiler on struts spanning the inner hulls
    const h = outer[0];
    const sz = main.zt + L * 0.05;
    const sy = Math.max(main.h.top(sz), h.h.top(sz)) + R * 1.0;
    const half = Math.max(h.x, R * 2.2) + h.r * 0.8;
    const sp = wingSurface([{ x: 0, y: 0, z: 0, c: L * 0.1, t: R * 0.22 }, { x: half, y: R * 0.15, z: -L * 0.012, c: L * 0.085, t: R * 0.18 }]);
    b.add('accent', sp.tris(), { p: [0, sy, sz], mirror: true }, 'spoiler');
    const sx = S.layout === 'bundle' ? R * 0.6 : h.x;
    const base = S.layout === 'bundle' ? main.h.top(sz) : h.h.top(sz);
    b.add('structure', cbox(R * 0.18, sy - base + R * 0.3, L * 0.06, R * 0.05), { p: [sx, (sy + base) / 2, sz], mirror: true }, 'spoiler-strut');
    // endplates
    b.add('accent2', cbox(R * 0.1, R * 0.9, L * 0.11, R * 0.03), { p: [half, sy + R * 0.15, sz - L * 0.006], mirror: true }, 'spoiler-plate');
  }

  return { length: L, signature: `${n} hulls`, sigValue: n, layout: S.layout };
}

/**
 * One racer hull. Main hull gets a pointed nose; nacelles may get an open
 * intake. Each ends in an engine sized to the hull.
 */
/** builder proxy: every part added through it also gets an X-mirrored copy */
function mirrorBuilder(b) {
  return {
    engines: { push: (e) => b.engines.push(e, { ...e, x: -e.x }) },
    add(chOrMap, a, c, d) {
      if (typeof chOrMap === 'string') return b.add(chOrMap, a, { ...(c || {}), mirror: true }, d);
      return b.add(chOrMap, { ...(a || {}), mirror: true }, c);
    },
  };
}

function nacelle(b, rng, dens, p, S, L, plateOpts, label) {
  const { x, y, len, r, zt } = p;
  const ha = S.ha;
  const rh = r * ha;
  const zn = zt + len;
  const pr = { ...S.prof, x, y };
  const sec = (z, w, h, dy = 0, extra = {}) => ({ z, w, h, ...pr, y: y + dy, ...extra });
  const secs = [sec(zt, r * 0.9, rh * 0.9), sec(zt + len * 0.08, r, rh), sec(zt + len * 0.5, r * 1.04, rh * 1.02)];
  let intake = false;
  switch (p.nose) {
    case 'needle':
      secs.push(sec(zn - len * 0.3, r * 0.9, rh * 0.86), sec(zn - len * 0.1, r * 0.42, rh * 0.36, -rh * 0.12), sec(zn, r * 0.06, rh * 0.05, -rh * 0.18));
      break;
    case 'chisel':
      secs.push(sec(zn - len * 0.28, r * 0.98, rh * 0.8, -rh * 0.05), sec(zn - len * 0.08, r * 0.8, rh * 0.32, -rh * 0.25), sec(zn, r * 0.58, rh * 0.07, -rh * 0.35, { tw: 0.9, bw: 0.9 }));
      break;
    default: // intake: nacelle tapers to a smaller, slightly drooped mouth
      secs.push(sec(zn - len * 0.3, r * 0.98, rh * 0.96), sec(zn - len * 0.06, r * 0.8, rh * 0.74, -rh * 0.06), sec(zn, r * 0.76, rh * 0.7, -rh * 0.08));
      intake = true;
  }
  const h = hull(b, secs, rng, dens, { label, capEnd: !intake, plates: plateOpts });
  if (intake) {
    const last = secs[secs.length - 1];
    const outerRing = ringZ(profile8(last.w, last.h, last), zn, x, last.y);
    const k = 0.78, d = r * 0.6;
    const lipRing = ringZ(profile8(last.w * 1.04, last.h * 1.04, last), zn + r * 0.04, x, last.y);
    const inner = ringZ(profile8(last.w * k, last.h * k, last), zn + r * 0.04, x, last.y);
    const deep = ringZ(profile8(last.w * k * 0.92, last.h * k * 0.92, last), zn - d, x, last.y);
    // bright lip ring proud of the hull, dark throat behind it
    b.add('accent2', loft([outerRing, lipRing, inner], { capStart: false, capEnd: false }), null, label + '-lip');
    b.add('structure', loft([inner, deep], { capStart: false, capEnd: true }), null, label + '-intake');
    // fan spinner
    b.add('accent2', drum(r * 0.24, r * 0.36, 8, { r2: r * 0.04 }), { p: [x, last.y, zn - d + r * 0.18] }, label + '-spinner');
  }
  // engine shaped to the hull cross-section
  const er = r * (p.main ? 0.86 : 0.82);
  const profile = (rad) => ngon(rad, 10, Math.PI / 10, rad * Math.min(1, ha * 1.02));
  addEngine(b, { x, y, z: zt - er * 0.35, r: er, length: len * 0.14, seg: 10, ch: 'structure', bands: 1, profile, label: label + '-engine' });
  if (p.main) collar(b, h, zt + len * 0.1, len * 0.03, 1.05, 'accent2', label + '-collar');
  return { h, x, y, r, rh, len, zt, zn, pair: p.pair, main: !!p.main, under: !!p.under };
}
