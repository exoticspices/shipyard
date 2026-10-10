// App state, permalink, and glue between generator, stage and UI.
import * as THREE from 'three';
import { generateShip, CLASSES, classById, DEFAULT_PARAMS } from './ships/index.js';
import { createMaterials, applyLivery, LIVERIES, liveryById } from './livery.js';
import { randomSeed } from './rng.js';
import { Stage } from './scene.js';
import { createUI } from './ui.js';
import { downloadGLB, glbBuffer, download } from './export.js';
import { ExhaustFX } from './fx.js';
import { zipStore } from './zip.js';

const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]dev\b/.test(location.search);
const TIER_KEYS = ['s', 'm', 'l'];
const VIEWS = ['ship', 'tiers', 'fleet'];
// clean-capture mode (no UI, no spin): ?shot or #...&ui=0
const SHOT = /[?&]shot/.test(location.search) || /(^|[#&])ui=0(&|$)/.test(location.hash);
if (SHOT) document.documentElement.classList.add('shot');

// ---------- permalink ----------
function parseHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const s = {};
  if (p.get('s')) s.seed = p.get('s').slice(0, 40);
  if (p.get('c') && CLASSES.some((c) => c.id === p.get('c'))) s.cls = p.get('c');
  if (p.has('t')) { const t = TIER_KEYS.indexOf(p.get('t')); if (t >= 0) s.tier = t; }
  if (p.get('l') && LIVERIES.some((l) => l.id === p.get('l'))) s.livery = p.get('l');
  if (VIEWS.includes(p.get('v'))) s.view = p.get('v');
  const num = (k, lo, hi) => { const v = parseFloat(p.get(k)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined; };
  const len = num('len', 0.8, 1.3), detail = num('d', 0, 1), append = num('a', 0.7, 1.4);
  if (len !== undefined) s.len = len;
  if (detail !== undefined) s.detail = detail;
  if (append !== undefined) s.append = append;
  return s;
}
function toHash(s) {
  const p = new URLSearchParams();
  p.set('s', s.seed); p.set('c', s.cls); p.set('t', TIER_KEYS[s.tier]); p.set('l', s.livery);
  if (s.len !== DEFAULT_PARAMS.len) p.set('len', s.len.toFixed(2));
  if (s.detail !== DEFAULT_PARAMS.detail) p.set('d', s.detail.toFixed(2));
  if (s.append !== DEFAULT_PARAMS.append) p.set('a', s.append.toFixed(2));
  if (s.view !== 'ship') p.set('v', s.view);
  if (SHOT && /(^|[#&])ui=0(&|$)/.test(location.hash)) p.set('ui', '0');
  return '#' + p.toString();
}

/** sibling seeds for the fleet view: kestrel-4821 -> kestrel-4822, ... */
function siblings(seed, n) {
  const m = seed.match(/^(.*?)(\d+)$/);
  const out = [];
  for (let i = 0; i < n; i++) out.push(m ? m[1] + (parseInt(m[2], 10) + i) : i === 0 ? seed : `${seed}-${i}`);
  return out;
}

// ---------- app ----------
const app = {
  state: {
    seed: 'kestrel-4821', cls: 'corvette', tier: 1, livery: 'industrial', view: 'ship',
    ...DEFAULT_PARAMS,
  },
  mats: createMaterials(),
  last: null,
};
Object.assign(app.state, parseHash());

const stage = new Stage(document.getElementById('view'));
const ui = createUI(app);
stage.onUserOrbit = () => ui.spin(false);
if (SHOT) { stage.controls.autoRotate = false; ui.spin(false); }

const fx = new ExhaustFX(app.mats.engineGlow);
stage.onTick = (t, groups) => fx.tick(t, groups);

/** build one ship group. opts.fx = add on-screen exhaust plumes (never for export) */
function makeShip(seed, cls, tier, { withFx = true } = {}) {
  const s = app.state;
  const r = generateShip({ seed, cls, tier, params: { len: s.len, detail: s.detail, append: s.append }, check: DEV });
  const g = new THREE.Group();
  g.name = `${r.cls}-${seed}`;
  let maxMesh = 0, meshes = 0;
  for (const [ch, geo] of Object.entries(r.geometries)) {
    const m = new THREE.Mesh(geo, app.mats[ch]);
    m.name = ch;
    g.add(m);
    meshes++;
    maxMesh = Math.max(maxMesh, geo.attributes.position.count / 3);
  }
  const box = new THREE.Box3().setFromObject(g);
  if (withFx && r.engines.length) g.add(fx.build(r.engines));
  g.userData = { ship: { seed, cls: r.cls, tier }, box, result: r };
  r.maxMesh = maxMesh; r.meshes = meshes;
  if (DEV && r.floating.length) console.warn(`[shipyard] floating parts in ${r.cls}/${seed}/t${tier}:`, [...new Set(r.floating)]);
  return g;
}
const disposeShip = (g) => g.traverse((o) => o.isMesh && !o.userData.fx && o.geometry.dispose());

const hoverOf = (size) => Math.max(0.25, size.y * 0.14);
/** place a ship so its bbox is centered at (x, z) and its bottom hovers above the ground */
function place(g, x, z) {
  const b = g.userData.box;
  const size = b.getSize(new THREE.Vector3());
  g.position.set(x - (b.min.x + b.max.x) / 2, hoverOf(size) - b.min.y, z - (b.min.z + b.max.z) / 2);
  return size;
}

// fleet camera: front 3/4, high enough that rows don't hide each other
const FLEET_DIR = new THREE.Vector3(0.3, 0.72, 1).normalize();

/**
 * Dock lineup: shelf-pack ships into rows by their real bounding boxes, try
 * every column count and keep the one that lets the camera get closest.
 * Rows are spaced so that, seen from FLEET_DIR, a front ship never covers
 * the ship parked behind it.
 */
function layoutFleet(objs) {
  const S = objs.map((g) => { const v = g.userData.box.getSize(new THREE.Vector3()); return { w: v.x, l: v.z, h: v.y + hoverOf(v) }; });
  const maxW = Math.max(...S.map((v) => v.w)), maxL = Math.max(...S.map((v) => v.l));
  const padX = Math.max(1, maxW * 0.16) + maxL * 0.06;
  const padZ = Math.max(1, maxL * 0.08);
  const cot = Math.sqrt(1 - FLEET_DIR.y ** 2) / FLEET_DIR.y; // cot(elevation)
  let best = null;
  for (let cols = 1; cols <= objs.length; cols++) {
    const rows = [];
    for (let i = 0; i < objs.length; i += cols) rows.push([...Array(Math.min(cols, objs.length - i)).keys()].map((k) => i + k));
    if (rows.length > 1 && rows[rows.length - 1].length < cols / 2 && cols > 3) continue; // avoid a lonely last row
    const rw = rows.map((r) => r.reduce((a, i) => a + S[i].w, 0) + padX * (r.length - 1));
    const rl = rows.map((r) => Math.max(...r.map((i) => S[i].l)));
    const rh = rows.map((r) => Math.max(...r.map((i) => S[i].h)));
    const zc = [0];
    for (let k = 1; k < rows.length; k++) zc.push(zc[k - 1] + rl[k - 1] / 2 + Math.max(padZ, rh[k] * cot * 0.9 + padZ * 0.5) + rl[k] / 2);
    const W = Math.max(...rw);
    const box = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -rl[0] / 2), new THREE.Vector3(W / 2, Math.max(...rh), zc[zc.length - 1] + rl[rl.length - 1] / 2));
    const dist = stage.fitDistance(box, FLEET_DIR);
    if (!best || dist < best.dist * 0.98) best = { dist, rows, rw, zc };
  }
  const zMid = best.zc[best.zc.length - 1] / 2;
  best.rows.forEach((r, k) => {
    let x = -best.rw[k] / 2;
    for (const i of r) { place(objs[i], x + S[i].w / 2, best.zc[k] - zMid); x += S[i].w + padX; }
  });
}

function rebuild(reframe = 'keep') {
  const s = app.state;
  const t0 = performance.now();
  let objs = [];
  if (s.view === 'ship') {
    const g = makeShip(s.seed, s.cls, s.tier);
    place(g, 0, 0);
    objs = [g];
  } else if (s.view === 'tiers') {
    objs = [0, 1, 2].map((t) => makeShip(s.seed, s.cls, t));
    const widths = objs.map((g) => g.userData.box.getSize(new THREE.Vector3()).x);
    const gap = Math.max(...widths) * 0.22 + 2;
    let x = 0;
    objs.forEach((g, i) => { place(g, x + widths[i] / 2, 0); x += widths[i] + gap; });
    const shift = (x - gap) / 2;
    objs.forEach((g) => (g.position.x -= shift));
  } else {
    objs = siblings(s.seed, 9).map((sd) => makeShip(sd, s.cls, s.tier));
    layoutFleet(objs);
  }
  const ms = performance.now() - t0;
  stage.setContent(objs, { reframe, dir: s.view === 'fleet' ? FLEET_DIR : null });
  if (s.view === 'ship') stage.setBob(objs[0], hoverOf(objs[0].userData.box.getSize(new THREE.Vector3())) * 0.22);
  const main = objs.find((g) => g.userData.ship.seed === s.seed && g.userData.ship.tier === s.tier) || objs[0];
  const r = main.userData.result;
  app.last = { main, objs };
  const dims = (() => { const v = main.userData.box.getSize(new THREE.Vector3()); return [v.z, v.x, v.y]; })();
  const tris = objs.reduce((a, g) => a + g.userData.result.tris, 0);
  const floating = DEV ? objs.flatMap((g) => g.userData.result.floating) : [];
  ui.readout({ state: s, main: r, count: objs.length, tris, ms, dims, grid: stage.gridCell, floating });
}

let hashTimer = null;
function writeHash() {
  const h = toHash(app.state);
  if (h !== location.hash) history.replaceState(null, '', h);
}

app.set = (patch, { live = false } = {}) => {
  const prev = { ...app.state };
  Object.assign(app.state, patch);
  const s = app.state;
  ui.sync(s);
  const geomChanged = ['seed', 'cls', 'tier', 'view', 'len', 'detail', 'append'].some((k) => prev[k] !== s[k]);
  if (prev.livery !== s.livery) applyLivery(app.mats, liveryById(s.livery)), (stage.dirty = true);
  if (geomChanged) rebuild(prev.view !== s.view ? 'reset' : 'keep');
  if (live) { clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 250); }
  else writeHash();
};
app.newSeed = () => app.set({ seed: randomSeed() });
app.cycleLivery = (d) => {
  const i = LIVERIES.findIndex((l) => l.id === app.state.livery);
  app.set({ livery: LIVERIES[(i + d + LIVERIES.length) % LIVERIES.length].id });
};
app.toggleSpin = () => {
  stage.controls.autoRotate = !stage.controls.autoRotate;
  ui.spin(stage.controls.autoRotate);
};
app.fileBase = () => `${app.state.cls}-${app.state.seed}`.replace(/[^a-z0-9_-]+/gi, '_');
app.exportGLB = async () => {
  const s = app.state;
  // always export the focused ship (in fleet/tier views too)
  const g = makeShip(s.seed, s.cls, s.tier, { withFx: false });
  const bytes = await downloadGLB(g, `${app.fileBase()}.glb`);
  disposeShip(g);
  ui.toast(`Saved ${app.fileBase()}.glb (${(bytes / 1024).toFixed(0)} KB)`);
};
/** all nine fleet siblings as GLBs in one store-only zip */
app.fleetZipName = () => `shipyard-${app.state.cls}-${app.state.seed}-fleet.zip`.replace(/[^a-z0-9_.-]+/gi, '_');
app.fleetZip = async () => {
  const s = app.state;
  const files = [];
  const seeds = siblings(s.seed, 9);
  for (const sd of seeds) {
    const g = makeShip(sd, s.cls, s.tier, { withFx: false });
    const name = `${s.cls}-${sd}`.replace(/[^a-z0-9_-]+/gi, '_');
    files.push({ name: name + '.glb', data: new Uint8Array(await glbBuffer(g, name)) });
    disposeShip(g);
  }
  const readme = [
    `Shipyard fleet: ${s.cls}, tier ${'SML'[s.tier]}, seeds ${seeds[0]} .. ${seeds[seeds.length - 1]}`,
    'Units: meters, Y-up, nose +Z. One mesh + one material per channel, box-mapped UVs.',
    'License: CC0 1.0 - these models are yours to use for anything, no attribution required.',
    `Regenerate: ${location.origin}${location.pathname}${toHash(s)}`,
  ];
  files.push({ name: 'README.txt', data: readme.join('\r\n') + '\r\n' });
  return zipStore(files);
};
app.exportFleet = async () => {
  ui.toast('Building fleet zip…');
  await new Promise((r) => setTimeout(r, 30)); // let the toast paint
  const zip = await app.fleetZip();
  download(new Blob([zip], { type: 'application/zip' }), app.fleetZipName());
  ui.toast(`Saved ${app.fleetZipName()} (${(zip.length / 1024).toFixed(0)} KB)`);
};
app.screenshot = () => {
  download(stage.snapshot(), `${app.fileBase()}${app.state.view !== 'ship' ? '-' + app.state.view : ''}.png`);
  ui.toast('Screenshot saved');
};
app.copyLink = async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); ui.toast('Link copied'); }
  catch { prompt('Copy this link', location.href); }
};

// click a ship in fleet / tier view to open it
let downAt = null;
stage.canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
stage.canvas.addEventListener('pointerup', (e) => {
  if (!downAt || app.state.view === 'ship') return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const o = stage.pick(e.clientX, e.clientY);
  if (o) app.set({ seed: o.userData.ship.seed, tier: o.userData.ship.tier, view: 'ship' });
});

window.addEventListener('hashchange', () => {
  const p = parseHash();
  if (Object.keys(p).some((k) => p[k] !== app.state[k])) app.set(p);
});

// boot
applyLivery(app.mats, liveryById(app.state.livery));
ui.sync(app.state);
rebuild('reset');
writeHash();
ui.loaded();

// handle for automated checks (headless screenshots / GLB validation)
window.__shipyard = {
  app, stage, ready: true,
  async glbBase64() {
    const s = app.state;
    const g = makeShip(s.seed, s.cls, s.tier, { withFx: false });
    const buf = await glbBuffer(g, app.fileBase());
    disposeShip(g);
    let bin = '';
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  },
  async fleetZipBase64() {
    const u8 = await app.fleetZip();
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { name: app.fleetZipName(), b64: btoa(bin) };
  },
  info() {
    const r = app.last.main.userData.result;
    return { tris: r.tris, ms: r.ms, floating: app.last.objs.flatMap((g) => g.userData.result.floating), sig: r.meta.signature, meshes: r.meshes, maxMesh: r.maxMesh };
  },
};
