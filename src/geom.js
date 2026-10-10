// Low-level mesh toolkit. Every primitive returns a "triangle soup": a flat
// number array [ax,ay,az, bx,by,bz, cx,cy,cz, ...] with counter-clockwise
// front faces. Flat normals and UVs are computed later when the builder
// merges soups per material channel.
//
// Conventions: meters, +Y up, ship nose points to +Z.
// Profiles are 2D point lists (CCW). A "ring" is a profile placed in 3D.
// loft(rings) skins consecutive rings; rings must be CCW when viewed from
// the end the loft travels toward.

// ---------- vector helpers (plain [x,y,z] arrays) ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const centroid = (pts) => {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return mul(c, 1 / pts.length);
};

// ---------- triangle emitters ----------
export function tri(out, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * nx + ny * ny + nz * nz < 1e-14) return; // degenerate
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}
export function quad(out, a, b, c, d) { tri(out, a, b, c); tri(out, a, c, d); }

/** fan-triangulate a convex ring; normal follows the ring's CCW sense (or the reverse) */
export function fan(out, ring, reverse = false) {
  const c = centroid(ring), n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    if (reverse) tri(out, c, b, a); else tri(out, c, a, b);
  }
  return out;
}

// ---------- profiles (2D, CCW) ----------
export function ccw(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s < 0 ? pts.slice().reverse() : pts;
}

export function ngon(r, n, rot = Math.PI / n, ry = r) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * ry]);
  }
  return pts;
}

export function rectProfile(hw, hh) {
  return [[hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]];
}

export function chamferRect(hw, hh, c) {
  c = Math.min(c, hw * 0.95, hh * 0.95);
  return [
    [hw - c, -hh], [hw, -hh + c], [hw, hh - c], [hw - c, hh],
    [-hw + c, hh], [-hw, hh - c], [-hw, -hh + c], [-hw + c, -hh],
  ];
}

/**
 * The hull workhorse: 8 points, half-width w, half-height h.
 * tw/bw = fraction of w kept flat on top/bottom, ct/cb = fraction of h used by
 * the upper/lower chamfers. Point index 0 is bottom-right, going CCW, so the
 * faces are: 0 lower-right chamfer, 1 right side, 2 upper-right chamfer, 3 top,
 * 4 upper-left chamfer, 5 left side, 6 lower-left chamfer, 7 bottom.
 */
export function profile8(w, h, s = {}) {
  const tw = s.tw ?? 0.7, bw = s.bw ?? 0.7, ct = s.ct ?? 0.35, cb = s.cb ?? 0.35;
  return [
    [bw * w, -h], [w, -h + cb * h], [w, h - ct * h], [tw * w, h],
    [-tw * w, h], [-w, h - ct * h], [-w, -h + cb * h], [-bw * w, -h],
  ];
}
export const FACE8 = { lowR: 0, right: 1, upR: 2, top: 3, upL: 4, left: 5, lowL: 6, bottom: 7 };

// ---------- rings ----------
/** place a 2D profile at depth z (frame X,Y; loft direction +Z) */
export function ringZ(profile, z, x0 = 0, y0 = 0) {
  return profile.map(([x, y]) => [x0 + x, y0 + y, z]);
}
/** place a 2D profile in an arbitrary frame; loft direction is U x V */
export function ringUV(profile, o, U, V) {
  return profile.map(([a, b]) => [
    o[0] + a * U[0] + b * V[0], o[1] + a * U[1] + b * V[1], o[2] + a * U[2] + b * V[2],
  ]);
}

// ---------- loft ----------
export function loft(rings, { capStart = true, capEnd = true, closed = false } = {}) {
  const out = [];
  const n = rings[0].length;
  const R = closed ? [...rings, rings[0]] : rings;
  for (let j = 0; j < R.length - 1; j++) {
    const A = R[j], B = R[j + 1];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      quad(out, A[i], A[i2], B[i2], B[i]);
    }
  }
  if (!closed) {
    if (capStart) fan(out, rings[0], true);
    if (capEnd) fan(out, rings[rings.length - 1], false);
  }
  return out;
}

/** A lofted surface that remembers its rings so detail passes can patch faces. */
export class Surface {
  constructor(rings, opts = {}) { this.rings = rings; this.opts = opts; }
  get nFaces() { return this.rings[0].length; }
  get nBands() { return this.rings.length - 1; }
  /** quad corners A,B,C,D: u runs A->B along the profile, v runs A->D along the loft */
  quad(i, j) {
    const A = this.rings[j], B = this.rings[j + 1], n = A.length, i2 = (i + 1) % n;
    return [A[i], A[i2], B[i2], B[i]];
  }
  tris() { return loft(this.rings, this.opts); }
}

/**
 * Hull loft along Z from a list of sections:
 * {z, w, h, y?, x?, tw, bw, ct, cb}. Sections must be sorted by z (aft -> nose).
 */
export class Hull extends Surface {
  constructor(sections, opts = {}) {
    const rings = sections.map((s) => ringZ(profile8(s.w, s.h, s), s.z, s.x || 0, s.y || 0));
    super(rings, opts);
    this.sections = sections;
  }
  /** interpolated section at z (clamped) for attaching parts */
  at(z) {
    const S = this.sections;
    if (z <= S[0].z) return { ...S[0], z };
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      if (z <= b.z) {
        const t = (z - a.z) / (b.z - a.z || 1);
        const m = (k, d) => (a[k] ?? d) + ((b[k] ?? d) - (a[k] ?? d)) * t;
        return { z, w: m('w', 0), h: m('h', 0), y: m('y', 0), x: m('x', 0), tw: m('tw', 0.7), bw: m('bw', 0.7), ct: m('ct', 0.35), cb: m('cb', 0.35) };
      }
    }
    return { ...S[S.length - 1], z };
  }
  top(z) { const s = this.at(z); return (s.y || 0) + s.h; }
  bottom(z) { const s = this.at(z); return (s.y || 0) - s.h; }
  get zMin() { return this.sections[0].z; }
  get zMax() { return this.sections[this.sections.length - 1].z; }
}

// ---------- solids ----------
export function box(w, h, d) {
  const p = rectProfile(w / 2, h / 2);
  return loft([ringZ(p, -d / 2), ringZ(p, d / 2)]);
}

/** chamfered box (all 12 edges bevelled) */
export function cbox(w, h, d, c) {
  c = Math.min(c, w * 0.3, h * 0.3, d * 0.3);
  const full = chamferRect(w / 2, h / 2, c);
  const sx = (w / 2 - c) / (w / 2), sy = (h / 2 - c) / (h / 2);
  const inset = full.map(([x, y]) => [x * sx, y * sy]);
  return loft([ringZ(inset, -d / 2), ringZ(full, -d / 2 + c), ringZ(full, d / 2 - c), ringZ(inset, d / 2)]);
}

/** drum along Z centered on origin; r2 = radius at +Z end */
export function drum(r, length, seg = 10, { r2 = r, capStart = true, capEnd = true, ry = 1 } = {}) {
  return loft([ringZ(ngon(r, seg, Math.PI / seg, r * ry), -length / 2), ringZ(ngon(r2, seg, Math.PI / seg, r2 * ry), length / 2)], { capStart, capEnd });
}

/** drum with bevelled ends */
export function cdrum(r, length, seg = 10, c = r * 0.15) {
  c = Math.min(c, length * 0.3, r * 0.5);
  const P = (rr, z) => ringZ(ngon(rr, seg), z);
  return loft([P(r - c, -length / 2), P(r, -length / 2 + c), P(r, length / 2 - c), P(r - c, length / 2)]);
}

/** flat disc at depth z; facing = +1 (normal +Z) or -1 */
export function disc(r, seg, z, facing = 1) {
  return fan([], ringZ(ngon(r, seg), z), facing < 0);
}

/**
 * Engine / thruster. Mouth at z=0 opening toward -Z, body runs forward to +len.
 * The FORE end is capped; the aft mouth is open with an inner liner, and the
 * glow disc sits at the bottom of the mouth facing aft, so it reads from behind.
 */
export function engine(r, length, seg = 10, o = {}) {
  const lip = o.lip ?? 0.14;
  const ri = r * (1 - lip);
  // keep the glow shallow: it must sit aft of any hull cap the engine is buried in
  const d = o.depth ?? Math.min(length * 0.25, r * 0.3);
  const prof = o.profile || ((rad) => ngon(rad, seg));
  const P = (rad, z) => ringZ(prof(rad), z);
  const fl = o.flare ?? 1.06;
  const nozzle = loft([P(ri, d), P(ri, 0), P(r * fl, 0), P(r * fl, length * 0.18), P(r * 0.9, length * 0.24)], { capStart: false, capEnd: false });
  const body = loft([P(r * 0.9, length * 0.24), P(r * 0.96, length * 0.3), P(r * 0.96, length * 0.82), P(r * (o.tail ?? 0.62), length)], { capStart: false, capEnd: true });
  const glow = fan([], P(ri * 1.0, d * 0.98), true); // faces -Z
  return { nozzle, body, glow };
}

/**
 * Rectangular open-mouthed duct (intakes, mining maw). Mouth at z=0 opening
 * toward -Z, shell runs to +len. Returns {inner, lip, outer, back, lipSurface}.
 */
export function duct(hw, hh, length, o = {}) {
  const wall = o.wall ?? Math.min(hw, hh) * 0.18;
  const depth = o.depth ?? length * 0.7;
  const flare = o.flare ?? 1.0; // >1 widens mouth
  const c = o.chamfer ?? Math.min(hw, hh) * 0.25;
  const pr = (w, h) => chamferRect(w, h, c * Math.min(w / hw, h / hh));
  const innerDeep = ringZ(pr((hw - wall) * 0.9, (hh - wall) * 0.9), depth);
  const innerMouth = ringZ(pr((hw - wall) * flare, (hh - wall) * flare), 0);
  const outerMouth = ringZ(pr(hw * flare, hh * flare), 0);
  const outerMid = ringZ(pr(hw, hh), length * 0.35);
  const outerBack = ringZ(pr(hw * 0.94, hh * 0.94), length);
  return {
    inner: loft([innerDeep, innerMouth], { capStart: false, capEnd: false }),
    lip: loft([innerMouth, outerMouth], { capStart: false, capEnd: false }),
    lipSurface: new Surface([innerMouth, outerMouth]),
    outer: loft([outerMouth, outerMid, outerBack], { capStart: false, capEnd: true }),
    outerSurface: new Surface([outerMouth, outerMid, outerBack]),
    back: fan([], innerDeep, true),
  };
}

/**
 * Wing spanning +X from a root at the origin. sections: [{x, y, z, c, t}]
 * (c = chord, t = thickness, z = chord center). Hexagonal airfoil.
 * Face 3 of the resulting surface is the upper skin.
 */
export function wingSurface(sections) {
  const prof = (c, t) => ccw([[0, c / 2], [t / 2, c / 4], [t / 2, -c / 3], [0, -c / 2], [-t / 2, -c / 3], [-t / 2, c / 4]]);
  const rings = sections.map((s) => ringUV(prof(s.c, s.t), [s.x, s.y, s.z], [0, 1, 0], [0, 0, 1]));
  return new Surface(rings, { capStart: true, capEnd: true });
}
export const WING_TOP = 3;

/** ring swept around the Z axis (sensor hoops). prof = [[axial, radial], ...] */
export function torus(R, prof, seg = 32) {
  const p = ccw(prof);
  const rings = [];
  for (let k = 0; k < seg; k++) {
    const t = (k / seg) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    rings.push(ringUV(p, [R * c, R * s, 0], [0, 0, 1], [c, s, 0]));
  }
  return loft(rings, { closed: true });
}

// ---------- surface patches (plates, windows, stripes, greebles) ----------
export function bilerp(q, u, v) {
  return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
}
export function quadNormal(q) {
  return norm(cross(sub(q[2], q[0]), sub(q[3], q[1])));
}
/**
 * Raised slab on a quad. uvs: 4 [u,v] pairs ordered (u0,v0)(u1,v0)(u1,v1)(u0,v1).
 * h = height above surface, sink = depth below (hides seams), bevel = top inset.
 */
export function patch(q, uvs, h, sink = h, bevel = 0) {
  const n = quadNormal(q);
  const base = uvs.map(([u, v]) => bilerp(q, u, v));
  const bot = base.map((p) => madd(p, n, -sink));
  let top = base.map((p) => madd(p, n, h));
  if (bevel > 0) {
    const c = centroid(top);
    top = top.map((p) => lerp(p, c, bevel));
  }
  return loft([bot, top], { capStart: false, capEnd: true });
}
export const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/** quad for a face of an axis-aligned box centered at c (local coords) */
const FACES = {
  '+z': { n: [0, 0, 1], U: [1, 0, 0], V: [0, 1, 0] },
  '-z': { n: [0, 0, -1], U: [-1, 0, 0], V: [0, 1, 0] },
  '+x': { n: [1, 0, 0], U: [0, 0, -1], V: [0, 1, 0] },
  '-x': { n: [-1, 0, 0], U: [0, 0, 1], V: [0, 1, 0] },
  '+y': { n: [0, 1, 0], U: [1, 0, 0], V: [0, 0, -1] },
  '-y': { n: [0, -1, 0], U: [1, 0, 0], V: [0, 0, 1] },
};
export function boxFace(w, h, d, face, c = [0, 0, 0]) {
  const f = FACES[face];
  const half = [w / 2, h / 2, d / 2];
  const ext = (v) => Math.abs(v[0]) * half[0] + Math.abs(v[1]) * half[1] + Math.abs(v[2]) * half[2];
  const hn = ext(f.n), hu = ext(f.U), hv = ext(f.V);
  const A = add(c, add(mul(f.n, hn), add(mul(f.U, -hu), mul(f.V, -hv))));
  const B = madd(A, f.U, 2 * hu), D = madd(A, f.V, 2 * hv), C = madd(B, f.V, 2 * hv);
  return [A, B, C, D];
}

export function concat(...arrs) {
  const out = [];
  for (const a of arrs) if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
  return out;
}
