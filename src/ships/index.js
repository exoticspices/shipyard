// Class registry + the single entry point that turns (seed, class, params)
// into merged per-channel geometry.
import { Rng } from '../rng.js';
import { ShipBuilder } from '../builder.js';
import { buildFighter } from './fighter.js';
import { buildHauler } from './hauler.js';
import { buildSurveyor } from './surveyor.js';
import { buildMiner } from './miner.js';
import { buildCorvette } from './corvette.js';
import { buildRacer } from './racer.js';

export const CLASSES = [
  { id: 'fighter', name: 'Fighter', note: 'interceptor', build: buildFighter },
  { id: 'hauler', name: 'Hauler', note: 'container freight', build: buildHauler },
  { id: 'surveyor', name: 'Surveyor', note: 'sensor ring', build: buildSurveyor },
  { id: 'miner', name: 'Miner', note: 'industrial', build: buildMiner },
  { id: 'corvette', name: 'Corvette', note: 'capital', build: buildCorvette },
  { id: 'racer', name: 'Racer', note: 'multi-hull', build: buildRacer },
];
export const classById = (id) => CLASSES.find((c) => c.id === id) || CLASSES[0];

export const DEFAULT_PARAMS = { len: 1, detail: 0.5, append: 1 };

/**
 * Deterministic: style stream depends only on seed + class, so a seed keeps
 * its family look across tiers; detail stream also depends on tier.
 */
export function generateShip({ seed, cls, tier = 1, params = DEFAULT_PARAMS, check = false }) {
  const t0 = performance.now();
  const def = classById(cls);
  const P = { ...DEFAULT_PARAMS, ...params };
  const style = new Rng(`${seed}|${def.id}|style`);
  const rng = new Rng(`${seed}|${def.id}|t${tier}|detail`);
  const b = new ShipBuilder();
  const meta = def.build(b, { style, rng, tier, P }) || {};
  const floating = check ? b.floatingParts() : [];
  const { geometries, tris } = b.build();
  const ms = performance.now() - t0;
  return { geometries, tris, meta, ms, floating, parts: b.parts.length, partList: b.parts, cls: def.id, seed, tier, engines: b.engines };
}
