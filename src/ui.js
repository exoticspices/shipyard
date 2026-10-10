// Panel + overlay DOM: builds the controls, forwards user intent to the app
// via callbacks, and reflects state back into the DOM.
import { CLASSES } from './ships/index.js';
import { LIVERIES } from './livery.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

export function createUI(app) {
  // class grid
  const grid = $('classGrid');
  CLASSES.forEach((c, i) => {
    const b = document.createElement('button');
    b.dataset.cls = c.id;
    b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${c.name}</span><span class="d">${c.note}</span>`;
    b.addEventListener('click', () => app.set({ cls: c.id }));
    grid.appendChild(b);
  });
  // liveries
  const list = $('liveryList');
  for (const l of LIVERIES) {
    const b = document.createElement('button');
    b.dataset.livery = l.id;
    const chips = ['primary', 'accent', 'accent2', 'structure', 'windows', 'engineGlow']
      .map((k) => `<i style="background:${l.ch[k].emissive || l.ch[k].color}"></i>`).join('');
    b.innerHTML = `<span class="chips">${chips}</span><span class="name">${l.name}</span>`;
    b.addEventListener('click', () => app.set({ livery: l.id }));
    list.appendChild(b);
  }

  // seed field: apply on Enter / blur
  const seed = $('seed');
  const applySeed = () => { const v = seed.value.trim(); if (v && v !== app.state.seed) app.set({ seed: v }); };
  seed.addEventListener('keydown', (e) => { if (e.key === 'Enter') { applySeed(); seed.blur(); } if (e.key === 'Escape') { seed.value = app.state.seed; seed.blur(); } });
  seed.addEventListener('blur', applySeed);
  $('newBtn').addEventListener('click', () => app.newSeed());

  document.querySelectorAll('#tierSeg button').forEach((b) => b.addEventListener('click', () => app.set({ tier: +b.dataset.tier })));
  document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => app.set({ view: b.dataset.view })));
  $('spinBtn').addEventListener('click', () => app.toggleSpin());

  // sliders: live preview while dragging (cheap enough), commit to URL on change
  const sliders = [['sLen', 'oLen', 'len', (v) => v.toFixed(2) + '×'], ['sDetail', 'oDetail', 'detail', (v) => Math.round(v * 100) + '%'], ['sAppend', 'oAppend', 'append', (v) => v.toFixed(2) + '×']];
  for (const [id, out, key, f] of sliders) {
    const el = $(id);
    el.addEventListener('input', () => { $(out).textContent = f(+el.value); app.set({ [key]: +el.value }, { live: true }); });
    el.addEventListener('change', () => app.set({ [key]: +el.value }));
  }
  $('resetShape').addEventListener('click', () => app.set({ len: 1, detail: 0.5, append: 1 }));

  $('glbBtn').addEventListener('click', () => app.exportGLB());
  $('zipBtn').addEventListener('click', async () => {
    const btn = $('zipBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    try { await app.exportFleet(); } finally { btn.disabled = false; }
  });
  $('pngBtn').addEventListener('click', () => app.screenshot());
  $('linkBtn').addEventListener('click', () => app.copyLink());
  $('ghLink').addEventListener('click', (e) => { if ($('ghLink').getAttribute('href') === '#') e.preventDefault(); });

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); app.newSeed(); }
    else if (/^[1-6]$/.test(k)) app.set({ cls: CLASSES[+k - 1].id });
    else if (k === 'l') app.cycleLivery(e.shiftKey ? -1 : 1);
    else if (k === 't') app.set({ tier: (app.state.tier + (e.shiftKey ? 2 : 1)) % 3 });
    else if (k === 'v') { const v = ['ship', 'tiers', 'fleet']; app.set({ view: v[(v.indexOf(app.state.view) + 1) % 3] }); }
    else if (k === 'f') app.set({ view: app.state.view === 'fleet' ? 'ship' : 'fleet' });
    else if (k === 'r') app.toggleSpin();
  });

  let toastTimer;
  return {
    sync(state) {
      if (document.activeElement !== seed) seed.value = state.seed;
      for (const b of grid.children) b.setAttribute('aria-pressed', b.dataset.cls === state.cls);
      for (const b of list.children) b.setAttribute('aria-pressed', b.dataset.livery === state.livery);
      document.querySelectorAll('#tierSeg button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.tier === state.tier));
      document.querySelectorAll('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));
      for (const [id, out, key, f] of sliders) { $(id).value = state[key]; $(out).textContent = f(state[key]); }
    },
    spin(on) { $('spinBtn').setAttribute('aria-pressed', on); },
    readout({ state, main, count, tris, ms, dims, grid: cell, floating }) {
      const cls = CLASSES.find((c) => c.id === state.cls);
      const tier = 'SML'[state.tier];
      let html;
      if (state.view === 'ship') {
        html = `<b>${cls.name.toUpperCase()}</b> <span class="acc">${state.seed}</span> &middot; tier ${tier}<br>`
          + `L ${dims[0].toFixed(1)} &times; W ${dims[1].toFixed(1)} &times; H ${dims[2].toFixed(1)} m &middot; <b>${fmt(tris)}</b> tris &middot; ${main.meshes} meshes (max ${fmt(main.maxMesh)}/mesh)<br>`
          + `${main.meta.signature} &middot; built in ${ms.toFixed(1)} ms &middot; grid ${cell} m`;
      } else {
        html = `<b>${cls.name.toUpperCase()}</b> <span class="acc">${state.seed}</span> &middot; ${state.view === 'tiers' ? 'tier sweep S / M / L' : `fleet of ${count} sibling seeds, tier ${tier}`}<br>`
          + `<b>${fmt(tris)}</b> tris total &middot; built in ${ms.toFixed(1)} ms &middot; grid ${cell} m<br>click a ship to open it`;
      }
      if (floating && floating.length) html += `<br><span class="warn">dev: floating parts: ${[...new Set(floating)].join(', ')}</span>`;
      $('readout').innerHTML = html;
      $('sigVal').textContent = main.meta.signature;
    },
    toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
    },
    loaded() { $('loading').classList.add('done'); },
  };
}
