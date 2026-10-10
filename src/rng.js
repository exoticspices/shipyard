// Seeded randomness. Everything in the generator draws from Rng instances
// derived from strings, so the same seed + class + params always rebuilds
// the same ship, and independent streams (style / detail) don't disturb
// each other when one of them draws more numbers.

export function hashString(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(key) {
    this.key = String(key);
    this.next = mulberry32(hashString(this.key));
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); } // inclusive
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  /** weighted pick: entries = [[value, weight], ...] */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) { if ((r -= e[1]) <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
  /** independent sub-stream: same parent key + label => same numbers */
  fork(label) { return new Rng(this.key + '/' + label); }
}

const WORDS = [
  'kestrel', 'osprey', 'harrier', 'merlin', 'heron', 'petrel', 'tern', 'condor',
  'falcon', 'ibis', 'kite', 'magpie', 'raven', 'shrike', 'swift', 'wren',
  'vega', 'rigel', 'altair', 'deneb', 'castor', 'lyra', 'sirius', 'mira',
  'anvil', 'ballast', 'cinder', 'drover', 'ember', 'forge', 'girder', 'harrow',
  'ingot', 'jetty', 'keel', 'lathe', 'mallet', 'nadir', 'piston', 'quarry',
  'rivet', 'sextant', 'tamper', 'umber', 'vector', 'winch', 'yardarm', 'zenith',
  'bastion', 'cobalt', 'dynamo', 'flint', 'gantry', 'halyard', 'iron', 'juno',
  'kodiak', 'lumen', 'mako', 'nomad', 'onyx', 'pallas', 'quill', 'rook',
];

/** A fresh, human-friendly seed such as "kestrel-4821" (uses Math.random on purpose). */
export function randomSeed() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w}-${1000 + Math.floor(Math.random() * 9000)}`;
}
