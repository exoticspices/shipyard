// Renderer, camera, lights, ground grid, contact shadow and bloom.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

const BG = 0x131416;

function niceStep(x) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50];
  for (const s of steps) if (x / s <= 14) return s;
  return 100;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(BG);
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, autoRotate: true, autoRotateSpeed: 0.7, maxPolarAngle: Math.PI * 0.495, enablePan: true });
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; this.onUserOrbit?.(); this.anim = null; });
    this.controls.addEventListener('change', () => (this.dirty = true));

    // lights
    this.hemi = new THREE.HemisphereLight(0xd8e2ea, 0x2c2f34, 1.15);
    this.key = new THREE.DirectionalLight(0xfff1e0, 2.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.rim = new THREE.DirectionalLight(0x9cc2ff, 2.3);
    scene.add(this.hemi, this.key, this.key.target, this.rim);

    // world root holds the ship(s)
    this.root = new THREE.Group();
    scene.add(this.root);

    this._makeGrid();
    this._makeContactShadow();

    // post
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.3, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.dirty = true;
    this.anim = null;
    this.fxGroups = [];
    this.bob = null;
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _makeGrid() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uCell: { value: 1 }, uFade: { value: 50 }, uColor: { value: new THREE.Color(0x30343a) }, uMajor: { value: new THREE.Color(0x484d55) }, uFloor: { value: new THREE.Color(0x1d2023) }, uCenter: { value: new THREE.Vector2() } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        varying vec3 vW; uniform float uCell; uniform float uFade; uniform vec3 uColor; uniform vec3 uMajor; uniform vec3 uFloor; uniform vec2 uCenter;
        float line(vec2 p, float c){ vec2 q = p / c; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){
          float mn = line(vW.xz, uCell), mj = line(vW.xz, uCell * 5.0);
          float d = length(vW.xz - uCenter) / uFade;
          // gaussian falloffs: no point where the slope changes abruptly, so no visible rim
          float fade = exp(-3.2 * d * d);
          float floorA = exp(-2.6 * d * d) * 0.9;
          float lineA = max(mn * 0.35, mj * 0.7) * fade;
          vec3 col = mix(uFloor, mix(uColor, uMajor, mj), clamp(lineA * 1.6, 0.0, 1.0));
          float a = max(floorA, lineA);
          // ordered-ish dither kills 8-bit banding rings in the dark gradient (and in video encodes)
          float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
          a = clamp(a + n * (1.5 / 255.0), 0.0, 1.0);
          if (a < 0.002) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    this.grid.renderOrder = -2;
    this.scene.add(this.grid);
  }

  // Contact shadow: render the ship's depth from below into a texture, blur it,
  // and lay it on the ground. Re-rendered only when the content changes.
  _makeContactShadow() {
    const size = 512;
    this.csRT = new THREE.WebGLRenderTarget(size, size);
    this.csRT.texture.generateMipmaps = false;
    this.csBlurRT = new THREE.WebGLRenderTarget(size, size);
    this.csBlurRT.texture.generateMipmaps = false;
    this.csGroup = new THREE.Group();
    this.scene.add(this.csGroup);
    const planeMat = new THREE.MeshBasicMaterial({ map: this.csRT.texture, transparent: true, depthWrite: false, opacity: 0.85 });
    const pg = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2);
    this.csPlane = new THREE.Mesh(pg, planeMat);
    this.csPlane.renderOrder = -1;
    this.csGroup.add(this.csPlane);
    this.csBlurPlane = new THREE.Mesh(pg);
    this.csBlurPlane.visible = false;
    this.csGroup.add(this.csBlurPlane);
    this.csCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
    this.csCam.rotation.x = Math.PI / 2;
    this.csGroup.add(this.csCam);
    const dm = (this.csDepth = new THREE.MeshDepthMaterial());
    dm.userData.darkness = { value: 1.6 };
    dm.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = dm.userData.darkness;
      shader.fragmentShader = 'uniform float darkness;\n' + shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );',
      );
    };
    dm.depthTest = false; dm.depthWrite = false;
    this.hBlur = new THREE.ShaderMaterial(HorizontalBlurShader); this.hBlur.depthTest = false;
    this.vBlur = new THREE.ShaderMaterial(VerticalBlurShader); this.vBlur.depthTest = false;
  }

  _renderContactShadow() {
    const r = this.renderer, s = this.scene;
    const bg = s.background;
    s.background = null;
    this.grid.visible = false; this.csPlane.visible = false;
    for (const g of this.fxGroups) g.visible = false;
    s.overrideMaterial = this.csDepth;
    const clearAlpha = r.getClearAlpha();
    r.setClearAlpha(0);
    r.setRenderTarget(this.csRT);
    r.clear();
    r.render(s, this.csCam);
    s.overrideMaterial = null;
    const blur = (amount) => {
      this.csBlurPlane.visible = true;
      this.csBlurPlane.material = this.hBlur;
      this.hBlur.uniforms.tDiffuse.value = this.csRT.texture;
      this.hBlur.uniforms.h.value = amount / 256;
      r.setRenderTarget(this.csBlurRT); r.render(this.csBlurPlane, this.csCam);
      this.csBlurPlane.material = this.vBlur;
      this.vBlur.uniforms.tDiffuse.value = this.csBlurRT.texture;
      this.vBlur.uniforms.v.value = amount / 256;
      r.setRenderTarget(this.csRT); r.render(this.csBlurPlane, this.csCam);
    };
    blur(2.2); blur(0.9);
    this.csBlurPlane.visible = false;
    r.setRenderTarget(null);
    r.setClearAlpha(clearAlpha);
    s.background = bg;
    this.grid.visible = true; this.csPlane.visible = true;
    for (const g of this.fxGroups) g.visible = true;
  }

  /**
   * Replace the displayed content. objects: array of THREE.Object3D already
   * positioned in world space (bottom resting at hover height).
   * opts.reframe: 'reset' (default view direction) | 'keep' (keep user angle)
   * opts.dir: view direction used on 'reset' (defaults to a front 3/4 view)
   * Meshes flagged userData.fx (exhaust) use shared geometry: not disposed,
   * not shadowed, ignored for framing.
   */
  setContent(objects, { reframe = 'keep', dir = null } = {}) {
    // dispose previous geometry (materials are shared and persist)
    for (const child of [...this.root.children]) {
      child.traverse((o) => { if (o.isMesh && !o.userData.fx) o.geometry.dispose(); });
      this.root.remove(child);
    }
    this.fxGroups = [];
    this.bob = null;
    const box = new THREE.Box3();
    for (const o of objects) {
      o.traverse((m) => {
        if (m.userData.fx && !m.isMesh) this.fxGroups.push(m);
        if (m.isMesh && !m.userData.fx) { m.castShadow = true; m.receiveShadow = true; }
      });
      this.root.add(o);
      if (o.userData.box) box.union(o.userData.box.clone().translate(o.position));
      else box.expandByObject(o);
    }
    this.contentBox = box;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z);

    // grid + fade sized to content
    this.gridCell = niceStep(Math.max(size.x, size.z) * 0.9);
    const g = this.grid;
    g.scale.set(span * 12 + 100, 1, span * 12 + 100);
    g.position.set(center.x, 0, center.z);
    g.material.uniforms.uCell.value = this.gridCell / 5 >= 0.5 ? this.gridCell / 5 : this.gridCell;
    g.material.uniforms.uFade.value = span * 1.35 + 9;
    g.material.uniforms.uCenter.value.set(center.x, center.z);

    // contact shadow footprint
    const pad = 1.35;
    const sw = size.x * pad + size.y * 0.6, sd = size.z * pad + size.y * 0.6;
    this.csGroup.position.set(center.x, 0.001 * span, center.z);
    this.csPlane.scale.set(sw, -1, sd);
    this.csBlurPlane.scale.set(sw, 1, sd);
    Object.assign(this.csCam, { left: -sw / 2, right: sw / 2, top: sd / 2, bottom: -sd / 2, near: 0, far: box.max.y + 0.01 });
    this.csCam.updateProjectionMatrix();
    this._renderContactShadow();

    // key light + shadow camera fitted to content
    const rad = box.getBoundingSphere(new THREE.Sphere()).radius;
    this.key.position.copy(center).add(new THREE.Vector3(-0.6, 1.0, 0.55).multiplyScalar(rad * 2));
    this.key.target.position.copy(center);
    const sc = this.key.shadow.camera;
    Object.assign(sc, { left: -rad, right: rad, top: rad, bottom: -rad, near: rad * 0.5, far: rad * 4 });
    sc.updateProjectionMatrix();
    this.key.shadow.normalBias = rad * 0.0015;
    this.rim.position.copy(center).add(new THREE.Vector3(0.4, 0.5, -1).multiplyScalar(rad * 2));

    this.frame(box, reframe, dir);
    this.dirty = true;
  }

  /** gentle idle hover for a single displayed ship (amplitude in meters) */
  setBob(obj, amp) {
    this.bob = obj ? { obj, amp, y0: obj.position.y } : null;
  }

  /** camera distance needed to fit box from direction dir */
  _fitDistance(box, dir) {
    const cam = this.camera;
    const vf = THREE.MathUtils.degToRad(cam.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * cam.aspect);
    // project the 8 corners onto the camera basis, find needed distance
    const center = box.getCenter(new THREE.Vector3());
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    let need = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
      const x = Math.abs(p.dot(right)), y = Math.abs(p.dot(up)), z = p.dot(fwd);
      need = Math.max(need, x / Math.tan(hf) - z, y / Math.tan(vf) - z);
    }
    return need * 1.12;
  }

  fitDistance(box, dir) { return this._fitDistance(box, dir.clone().normalize()); }

  frame(box, mode = 'keep', resetDir = null) {
    const center = box.getCenter(new THREE.Vector3());
    let dir;
    if (mode === 'reset' || !this._hasFramed) dir = (resetDir ? resetDir.clone() : new THREE.Vector3(0.78, 0.42, 0.95)).normalize();
    else dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._hasFramed = true;
    const dist = this._fitDistance(box, dir);
    const toPos = center.clone().add(dir.multiplyScalar(dist));
    this.camera.near = Math.max(0.05, dist / 200);
    this.camera.far = dist * 30;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = dist * 0.15;
    this.controls.maxDistance = dist * 4;
    if (!this._animatedOnce || mode === 'instant') {
      this.camera.position.copy(toPos); this.controls.target.copy(center); this._animatedOnce = true;
    } else {
      this.anim = { t: 0, fromPos: this.camera.position.clone(), fromTgt: this.controls.target.clone(), toPos, toTgt: center };
    }
    this.dirty = true;
  }

  _resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  _loop(t) {
    requestAnimationFrame(this._loop);
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + 0.06);
      const e = 1 - Math.pow(1 - a.t, 3);
      this.camera.position.lerpVectors(a.fromPos, a.toPos, e);
      this.controls.target.lerpVectors(a.fromTgt, a.toTgt, e);
      if (a.t >= 1) this.anim = null;
      this.dirty = true;
    }
    this.controls.update();
    if (this.controls.autoRotate) this.dirty = true;
    const sec = t / 1000;
    if (this.bob && !document.hidden) {
      const { obj, amp, y0 } = this.bob;
      obj.position.y = y0 + amp * Math.sin(sec * 1.15);
      obj.rotation.z = 0.006 * Math.sin(sec * 0.8 + 0.6);
      obj.rotation.x = 0.004 * Math.sin(sec * 1.15 - 0.9);
      this.dirty = true;
    }
    if (this.fxGroups.length && this.onTick && !document.hidden) { this.onTick(sec, this.fxGroups); this.dirty = true; }
    if (!this.dirty || document.hidden) return;
    this.dirty = false;
    this.composer.render();
  }

  /** render immediately and return a PNG data URL */
  snapshot() {
    this.composer.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.root.children, true)[0];
    let o = hit?.object;
    while (o && !o.userData.ship) o = o.parent;
    return o || null;
  }
}
