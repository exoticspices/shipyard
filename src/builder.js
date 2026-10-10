// ShipBuilder collects triangle soups per material channel, applies part
// transforms (with optional X mirroring), and finally merges everything into
// ONE mesh per channel with flat normals and metric box-projected UVs.
import * as THREE from 'three';

export const CHANNELS = ['primary', 'structure', 'accent', 'accent2', 'glass', 'windows', 'engineGlow'];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function matrixFrom(xf) {
  if (!xf) return null;
  const p = xf.p || [0, 0, 0];
  const r = xf.r || [0, 0, 0];
  const s = xf.s === undefined ? [1, 1, 1] : typeof xf.s === 'number' ? [xf.s, xf.s, xf.s] : xf.s;
  _e.set(r[0], r[1], r[2], xf.order || 'XYZ');
  _q.setFromEuler(_e);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  return _m.elements.slice();
}

function transformSoup(src, e, mirrorX) {
  const out = new Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2];
    let X = x, Y = y, Z = z;
    if (e) {
      X = e[0] * x + e[4] * y + e[8] * z + e[12];
      Y = e[1] * x + e[5] * y + e[9] * z + e[13];
      Z = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    out[i] = mirrorX ? -X : X; out[i + 1] = Y; out[i + 2] = Z;
  }
  let flip = mirrorX;
  if (e) {
    const det = e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]);
    if (det < 0) flip = !flip;
  }
  if (flip) { // reverse winding: swap vertices b and c
    for (let i = 0; i < out.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; }
    }
  }
  return out;
}

export class ShipBuilder {
  constructor() {
    this.soups = {};
    for (const c of CHANNELS) this.soups[c] = [];
    this.parts = [];
    /** engine mouths {x, y, z, r, ry} for on-screen exhaust effects (never exported) */
    this.engines = [];
  }

  /**
   * add(channel, tris, xf, label) or add({channel: tris, ...}, xf, label)
   * xf = {p:[x,y,z], r:[rx,ry,rz], s, mirror:true}  mirror => also add an X-mirrored copy
   */
  add(chOrMap, trisOrXf, xfOrLabel, maybeLabel) {
    let map, xf, label;
    if (typeof chOrMap === 'string') { map = { [chOrMap]: trisOrXf }; xf = xfOrLabel; label = maybeLabel; }
    else { map = chOrMap; xf = trisOrXf; label = xfOrLabel; }
    const e = matrixFrom(xf);
    const sides = xf && xf.mirror ? [false, true] : [false];
    for (const m of sides) {
      const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      let any = false;
      for (const ch in map) {
        const src = map[ch];
        if (!src || !src.length) continue;
        if (!this.soups[ch]) throw new Error('unknown channel ' + ch);
        const t = transformSoup(src, e, m);
        for (let i = 0; i < t.length; i += 3) {
          if (t[i] < bb[0]) bb[0] = t[i]; if (t[i] > bb[3]) bb[3] = t[i];
          if (t[i + 1] < bb[1]) bb[1] = t[i + 1]; if (t[i + 1] > bb[4]) bb[4] = t[i + 1];
          if (t[i + 2] < bb[2]) bb[2] = t[i + 2]; if (t[i + 2] > bb[5]) bb[5] = t[i + 2];
        }
        this.soups[ch].push(t);
        any = true;
      }
      if (any) this.parts.push({ label: (label || 'part') + (m ? ' (L)' : ''), bb });
    }
  }

  /** dev sanity check: every part's bbox must connect (transitively) to the rest */
  floatingParts() {
    const P = this.parts, n = P.length;
    if (!n) return [];
    let size = 0;
    for (const p of P) size = Math.max(size, p.bb[3] - p.bb[0], p.bb[4] - p.bb[1], p.bb[5] - p.bb[2]);
    const eps = 0.002 * size + 0.005;
    const parent = P.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < n; i++) {
      const a = P[i].bb;
      for (let j = i + 1; j < n; j++) {
        const b = P[j].bb;
        if (a[0] - eps > b[3] || b[0] - eps > a[3] || a[1] - eps > b[4] || b[1] - eps > a[4] || a[2] - eps > b[5] || b[2] - eps > a[5]) continue;
        parent[find(i)] = find(j);
      }
    }
    const counts = {};
    for (let i = 0; i < n; i++) { const r = find(i); counts[r] = (counts[r] || 0) + 1; }
    let main = null;
    for (const r in counts) if (main === null || counts[r] > counts[main]) main = r;
    return P.filter((_, i) => String(find(i)) !== String(main)).map((p) => p.label);
  }

  /** merge into THREE.BufferGeometry per channel. returns {geometries, tris} */
  build() {
    const geometries = {};
    let tris = 0;
    for (const ch of CHANNELS) {
      const list = this.soups[ch];
      let count = 0;
      for (const s of list) count += s.length;
      if (!count) continue;
      const pos = new Float32Array(count);
      let o = 0;
      for (const s of list) { pos.set(s, o); o += s.length; }
      const nrm = new Float32Array(count);
      const uv = new Float32Array((count / 3) * 2);
      for (let i = 0, t = 0; i < count; i += 9, t += 6) {
        const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
        const ux = pos[i + 3] - ax, uy = pos[i + 4] - ay, uz = pos[i + 5] - az;
        const vx = pos[i + 6] - ax, vy = pos[i + 7] - ay, vz = pos[i + 8] - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        // box projection, 1 UV unit = 1 meter
        const X = Math.abs(nx), Y = Math.abs(ny), Z = Math.abs(nz);
        for (let k = 0; k < 3; k++) {
          const px = pos[i + k * 3], py = pos[i + k * 3 + 1], pz = pos[i + k * 3 + 2];
          nrm[i + k * 3] = nx; nrm[i + k * 3 + 1] = ny; nrm[i + k * 3 + 2] = nz;
          let u, v;
          if (X >= Y && X >= Z) { u = nx > 0 ? -pz : pz; v = py; }
          else if (Y >= Z) { u = px; v = ny > 0 ? -pz : pz; }
          else { u = nz > 0 ? px : -px; v = py; }
          uv[t + k * 2] = u; uv[t + k * 2 + 1] = v;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      geometries[ch] = g;
      tris += count / 9;
    }
    return { geometries, tris };
  }
}
