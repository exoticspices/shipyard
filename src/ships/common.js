// Helpers shared by the ship classes.
import { Hull, FACE8, loft, ringZ, profile8 } from '../geom.js';
import { platePass } from '../details.js';

export { FACE8 };

/**
 * Lofted hull: dark 'structure' skin + plates in primary on chosen faces.
 * o: {label, plates: {...platePass opts} | false, base, capStart, capEnd}
 */
export function hull(b, sections, rng, density, o = {}) {
  const h = new Hull(sections, { capStart: o.capStart ?? true, capEnd: o.capEnd ?? true });
  const label = o.label || 'hull';
  b.add(o.base || 'structure', h.tris(), null, label);
  if (o.plates !== false) {
    platePass(b, h, rng.fork(label), { density, label: label + '-plates', ...(o.plates || {}) });
  }
  return h;
}

/** short octagonal collar ring around a hull station (overlaps hull) */
export function collar(b, h, z, depth, grow, ch = 'structure', label = 'collar') {
  const s = h.at(z);
  const p = { ...s, w: s.w * grow, h: s.h * grow };
  const rings = [ringZ(profile8(p.w, p.h, p), z - depth / 2, s.x || 0, s.y || 0), ringZ(profile8(p.w, p.h, p), z + depth / 2, s.x || 0, s.y || 0)];
  b.add(ch, loft(rings), null, label);
}

export const TIERS = ['S', 'M', 'L'];
