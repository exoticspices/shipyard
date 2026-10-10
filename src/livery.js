// Liveries: named palettes mapped onto the fixed material channels. One
// shared material per channel; switching livery mutates those materials in
// place, so geometry is never rebuilt.
import * as THREE from 'three';
import { CHANNELS } from './builder.js';

const solid = (color, metalness, roughness) => ({ color, metalness, roughness });
const glow = (emissive, intensity, color = '#0a0a0a') => ({ color, metalness: 0, roughness: 0.6, emissive, emissiveIntensity: intensity });

export const LIVERIES = [
  {
    id: 'industrial', name: 'Industrial',
    ch: {
      primary: solid('#8e949a', 0.55, 0.5), structure: solid('#2b2d30', 0.4, 0.7),
      accent: solid('#d9a11c', 0.3, 0.55), accent2: solid('#5d6369', 0.5, 0.55),
      glass: solid('#16232b', 0.2, 0.12), windows: glow('#ffb347', 3.2), engineGlow: glow('#57d5ff', 6),
    },
  },
  {
    id: 'navy', name: 'Navy',
    ch: {
      primary: solid('#58687a', 0.5, 0.48), structure: solid('#1c2229', 0.45, 0.65),
      accent: solid('#d4d7d1', 0.25, 0.5), accent2: solid('#a3352d', 0.3, 0.55),
      glass: solid('#14202b', 0.2, 0.1), windows: glow('#d6ecff', 3.2), engineGlow: glow('#6aa8ff', 6),
    },
  },
  {
    id: 'salvage', name: 'Salvage',
    ch: {
      primary: solid('#8a5232', 0.45, 0.72), structure: solid('#2a2522', 0.35, 0.8),
      accent: solid('#c99a3b', 0.3, 0.65), accent2: solid('#4d6a65', 0.4, 0.7),
      glass: solid('#26261e', 0.2, 0.2), windows: glow('#ffcf73', 3.2), engineGlow: glow('#ff8a3d', 6),
    },
  },
  {
    id: 'corporate', name: 'Corporate',
    ch: {
      primary: solid('#c8c6bf', 0.15, 0.45), structure: solid('#3a3d42', 0.4, 0.6),
      accent: solid('#f0661a', 0.15, 0.45), accent2: solid('#9ba2aa', 0.4, 0.45),
      glass: solid('#132029', 0.2, 0.08), windows: glow('#a8eaff', 3.2), engineGlow: glow('#8af3ff', 6),
    },
  },
  {
    id: 'stealth', name: 'Stealth',
    ch: {
      primary: solid('#3a3e44', 0.35, 0.52), structure: solid('#151618', 0.3, 0.75),
      accent: solid('#474c53', 0.4, 0.5), accent2: solid('#7a1e1e', 0.3, 0.55),
      glass: solid('#0d0f11', 0.3, 0.08), windows: glow('#ff4a3a', 3.2), engineGlow: glow('#ff5544', 6),
    },
  },
];

export function liveryById(id) {
  return LIVERIES.find((l) => l.id === id) || LIVERIES[0];
}

/** shared materials, named by channel so GLB imports show clean slots */
export function createMaterials() {
  const mats = {};
  for (const ch of CHANNELS) {
    mats[ch] = new THREE.MeshStandardMaterial({ name: ch, flatShading: true });
  }
  return mats;
}

export function applyLivery(mats, livery) {
  for (const ch of CHANNELS) {
    const d = livery.ch[ch];
    const m = mats[ch];
    m.color.set(d.color);
    m.metalness = d.metalness;
    m.roughness = d.roughness;
    if (d.emissive) {
      // normalise glow by luminance so every livery blooms about the same amount
      m.emissive.set(d.emissive);
      const c = m.emissive;
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const target = ch === 'engineGlow' ? 2.6 : 1.75;
      m.emissiveIntensity = target / Math.max(0.15, lum);
    }
    else { m.emissive.set('#000000'); m.emissiveIntensity = 1; }
    m.needsUpdate = false;
  }
}
