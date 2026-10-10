// Detail passes shared by all ship classes: panel plating with seam gaps,
// emissive window strips, hazard stripes, greebles, antennae, engines.
import {
  patch, rect, dist, engine, drum, cdrum, cbox, box, boxFace, concat,
} from './geom.js';

/**
 * Cover faces of a Surface with inset plates. The hull underneath should be
 * the dark 'structure' channel so the gaps read as panel seams.
 * opts: faces, bands, size (target plate size, m), gap (m), h (m),
 *       ch, alt, altChance, skip, density (0..1 greeble density slider)
 */
export function platePass(b, surf, rng, o = {}) {
  const faces = o.faces || [...Array(surf.nFaces).keys()];
  const bands = o.bands || [...Array(surf.nBands).keys()];
  const size = o.size ?? 3, gap = o.gap ?? 0.08, h = o.h ?? 0.06;
  const ch = o.ch || 'primary', alt = o.alt || 'accent';
  const density = o.density ?? 0.5;
  const skip = (o.skip ?? 0.06) * (0.4 + density * 1.2);
  const altChance = o.altChance ?? 0.06;
  const greeble = (o.greeble ?? 0.05) * density * 2;
  const out = { [ch]: [], [alt]: [], structure: [] };
  for (const j of bands) {
    for (const i of faces) {
      const q = surf.quad(i, j);
      const lu = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
      const lv = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      if (lu < gap * 4 || lv < gap * 4) continue;
      const nu = Math.max(1, Math.round(lu / size));
      const nv = Math.max(1, Math.round(lv / (size * (o.aspect ?? 1.6))));
      const gu = gap / lu / 2, gv = gap / lv / 2;
      for (let a = 0; a < nu; a++) {
        for (let c = 0; c < nv; c++) {
          const r = rng.next();
          const u0 = a / nu + gu, u1 = (a + 1) / nu - gu, v0 = c / nv + gv, v1 = (c + 1) / nv - gv;
          if (r < skip) {
            // exposed bay: sometimes fill with a small greeble block
            if (rng.chance(greeble * 4)) {
              const m = 0.25;
              out.structure.push(...patch(q, rect(u0 + (u1 - u0) * m, u1 - (u1 - u0) * m, v0 + (v1 - v0) * m, v1 - (v1 - v0) * m), h * rng.float(2, 5), h, 0.1));
            }
            continue;
          }
          const target = r < skip + altChance ? out[alt] : out[ch];
          target.push(...patch(q, rect(u0, u1, v0, v1), h, h * 1.5, o.bevel ?? 0.06));
        }
      }
    }
  }
  b.add(out, null, o.label || 'plates');
}

/** generic strip of cells along one axis of a quad. along: 'u' or 'v' */
function cellUVs(along, a0, a1, s0, s1, shear = 0) {
  return along === 'v'
    ? [[a0, s0], [a1, s0 + shear], [a1, s1 + shear], [a0, s1]]
    : [[s0, a0], [s1, a0], [s1 + shear, a1], [s0 + shear, a1]];
}

/** emissive window row on a quad. t0..t1 along the strip, a0..a1 across it */
export function windowRow(q, { along = 'v', t0 = 0.1, t1 = 0.9, a0 = 0.4, a1 = 0.6, count = 6, fill = 0.6, h = 0.04 }) {
  const out = [];
  const step = (t1 - t0) / count;
  for (let k = 0; k < count; k++) {
    const s0 = t0 + step * k + step * (1 - fill) / 2;
    out.push(...patch(q, cellUVs(along, a0, a1, s0, s0 + step * fill), h, h * 2, 0));
  }
  return out;
}

/** diagonal hazard stripes (parallelograms) */
export function hazard(q, { along = 'v', t0 = 0, t1 = 1, a0 = 0, a1 = 1, n = 6, h = 0.03, shear = null }) {
  const out = [];
  const step = (t1 - t0) / n;
  const sh = shear ?? step * 0.8;
  for (let k = 0; k < n; k++) {
    const s0 = t0 + step * k;
    const s1 = s0 + step * 0.5;
    const lo = Math.max(t0, s0), hi = Math.min(t1 - sh, s1);
    if (hi <= lo) continue;
    out.push(...patch(q, cellUVs(along, a0, a1, lo, hi, sh), h, h * 2, 0));
  }
  return out;
}

/** small raised boxes scattered on a quad (vents, hatches, conduits) */
export function greebleQuad(rng, q, count, hMin, hMax) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const w = rng.float(0.08, 0.3), d = rng.float(0.08, 0.35);
    const u = rng.float(0.05, 0.95 - w), v = rng.float(0.05, 0.95 - d);
    out.push(...patch(q, rect(u, u + w, v, v + d), rng.float(hMin, hMax), hMin, 0.12));
  }
  return out;
}

/**
 * Add an engine whose aft mouth is at (x,y,zAft) and whose body runs forward.
 * body channel can vary; nozzle is structure, glow disc is engineGlow.
 */
export function addEngine(b, { x = 0, y = 0, z, r, length, seg = 10, ch = 'primary', mirror = false, bands = 1, profile, label = 'engine' }) {
  const e = engine(r, length, seg, { profile });
  const parts = { structure: e.nozzle, [ch]: e.body, engineGlow: e.glow };
  // cooling bands around the body
  if (bands > 0) {
    const extra = [];
    for (let k = 0; k < bands; k++) {
      const zz = length * (0.42 + (k * 0.32) / Math.max(1, bands));
      extra.push(...offsetZ(cdrum(r * 1.02, length * 0.06, seg, r * 0.02), zz));
    }
    parts.structure = concat(parts.structure, extra);
  }
  b.add(parts, { p: [x, y, z], mirror }, label);
  if (b.engines) {
    // glow disc sits a little inside the mouth (see geom.engine); remember it for exhaust fx
    let ry = 1;
    if (profile) { const pts = profile(1); ry = Math.max(...pts.map((p) => Math.abs(p[1]))) / Math.max(...pts.map((p) => Math.abs(p[0]))); }
    const e = { x, y, z: z + Math.min(length * 0.25, r * 0.3) * 0.98, r: r * 0.86, ry };
    b.engines.push(e);
    if (mirror) b.engines.push({ ...e, x: -x });
  }
}

export function offsetZ(soup, dz) {
  const out = soup.slice();
  for (let i = 2; i < out.length; i += 3) out[i] += dz;
  return out;
}
export function offset(soup, d) {
  const out = soup.slice();
  for (let i = 0; i < out.length; i += 3) { out[i] += d[0]; out[i + 1] += d[1]; out[i + 2] += d[2]; }
  return out;
}

/** vertical antenna mast with a small tip, base at p */
export function addAntenna(b, p, height, r = 0.06, { mirror = false, tip = true, down = false } = {}) {
  const mast = offsetZ(drum(r, height, 5), height / 2);
  const parts = { structure: mast };
  if (tip) parts.windows = offsetZ(box(r * 3, r * 3, r * 3), height);
  b.add(parts, { p, r: [down ? Math.PI / 2 : -Math.PI / 2, 0, 0], mirror }, 'antenna');
}

/** dish antenna on a stalk standing on p; rot orients the dish (opens toward local +Z) */
export function addDish(b, p, radius, rot = [-1.0, 0.6, 0], { mirror = false } = {}) {
  const stalkH = radius * 0.9;
  b.add({ structure: offsetZ(drum(radius * 0.1, stalkH, 6), stalkH / 2) }, { p, r: [-Math.PI / 2, 0, 0], mirror }, "dish-stalk");
  b.add({ accent2: loftDish(radius), structure: offsetZ(drum(radius * 0.04, radius * 0.7, 5), radius * 0.3) },
    { p: [p[0], p[1] + stalkH, p[2]], r: rot, mirror }, "dish");
}
function loftDish(R) {
  // shallow cone opening toward +Z, both sides visible (inner + outer skin)
  const seg = 12;
  const out = [];
  const ring = (r, z) => { const pts = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, z]); } return pts; };
  const a = ring(R * 0.15, 0), bb = ring(R, R * 0.35), a2 = ring(R * 0.15, -R * 0.06), b2 = ring(R * 1.0, R * 0.3);
  for (let i = 0; i < seg; i++) {
    const i2 = (i + 1) % seg;
    // inner (faces +Z / inward)
    out.push(...[a[i], bb[i], bb[i2]].flat(), ...[a[i], bb[i2], a[i2]].flat());
    // outer (faces -Z)
    out.push(...[a2[i], b2[i2], b2[i]].flat(), ...[a2[i], a2[i2], b2[i2]].flat());
  }
  return out;
}

/**
 * Gun turret centered at p on a deck, barrels pointing toward +Z (or -Z if
 * facing = -1). size = base radius (m). barrels = 1..3
 */
export function addTurret(b, p, size, { barrels = 2, facing = 1, mirror = false, label = 'turret' } = {}) {
  const r = size;
  const base = offsetZ(cdrum(r, r * 0.5, 10, r * 0.1), 0); // axis Z -> rotate to Y
  b.add({ structure: base }, { p: [p[0], p[1] + r * 0.15, p[2]], r: [-Math.PI / 2, 0, 0], mirror }, label + '-ring');
  const hw = r * 0.85, hh = r * 0.55, hd = r * 1.5;
  const house = cbox(hw * 2, hh * 2, hd, r * 0.22);
  const ry = facing > 0 ? 0 : Math.PI;
  const hy = p[1] + r * 0.35 + hh * 0.8;
  b.add({ primary: house }, { p: [p[0], hy, p[2]], r: [0, ry, 0], mirror }, label);
  const bl = r * 2.6, br = r * 0.11;
  const out = [];
  for (let k = 0; k < barrels; k++) {
    const bx = (k - (barrels - 1) / 2) * r * 0.42;
    out.push(...offset(drum(br, bl, 6), [bx, 0, hd / 2 + bl / 2 - r * 0.4]));
    out.push(...offset(drum(br * 1.6, bl * 0.18, 6), [bx, 0, hd / 2]));
  }
  b.add({ structure: out }, { p: [p[0], hy, p[2]], r: [0, ry, 0], mirror }, label + '-guns');
}

/** row of thin radiator fins on a box face — returns soup in face coords */
export function ribs(q, n, h, along = 'u', fill = 0.35) {
  const out = [];
  const step = 1 / n;
  for (let k = 0; k < n; k++) {
    const s0 = step * k + step * (1 - fill) / 2;
    out.push(...patch(q, cellUVs(along, 0.06, 0.94, s0, s0 + step * fill), h, h, 0));
  }
  return out;
}

/** chamfered box with window rows on chosen faces; returns channel map in local coords */
export function windowedBox(w, h, d, c, faces, { rows = 1, pitch = 1.4, wh = 0.14, ch = "primary", at = 0.62 } = {}) {
  const parts = { [ch]: cbox(w, h, d, c), windows: [] };
  for (const f of faces) {
    const q = boxFace(w, h, d, f);
    const fw = f.includes("x") ? d : w; // horizontal extent of that face
    const count = Math.max(2, Math.round((fw * 0.8) / pitch));
    for (let r = 0; r < rows; r++) {
      const mid = rows === 1 ? at : 0.3 + (0.45 * r) / (rows - 1);
      parts.windows.push(...windowRow(q, { along: "u", t0: 0.1, t1: 0.9, a0: mid - wh / 2, a1: mid + wh / 2, count, fill: 0.6, h: Math.min(w, h, d) * 0.01 + 0.02 }));
    }
  }
  return parts;
}
