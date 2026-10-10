// On-screen-only engine exhaust: a soft additive plume + brighter core behind
// every engine glow disc, flickering gently. Never exported, never shadowed.
import * as THREE from 'three';

const vert = /* glsl */ `
  varying float vT;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vT = 1.0 - uv.y; // 0 at the nozzle, 1 at the tip
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPow;
  varying float vT;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float flick = 0.88 + 0.08 * sin(uTime * 31.0 + vT * 11.0) + 0.04 * sin(uTime * 13.0);
    float a = pow(1.0 - vT, uPow) * pow(facing, 1.4) * uOpacity * flick;
    gl_FragColor = vec4(uColor, a);
  }`;

// unit cone along -Z: radius 1 at z=0 (nozzle) tapering to the tip at z=-1
function unitCone(tip) {
  const g = new THREE.CylinderGeometry(1, tip, 1, 18, 1, true);
  g.rotateX(Math.PI / 2); // +Y (top, uv.y = 1) -> +Z
  g.translate(0, 0, -0.5);
  return g;
}

export class ExhaustFX {
  constructor(glowMaterial) {
    this.glow = glowMaterial;
    this.time = { value: 0 };
    this.color = { value: new THREE.Color() };
    this.coreColor = { value: new THREE.Color() };
    const mat = (color, opacity, pow) => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { uColor: color, uTime: this.time, uOpacity: { value: opacity }, uPow: { value: pow } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    this.plumeMat = mat(this.color, 0.48, 1.7);
    this.coreMat = mat(this.coreColor, 0.65, 2.6);
    this.plumeGeo = unitCone(0.3);
    this.coreGeo = unitCone(0.15);
    this.items = [];
  }

  /** build the plume group for one ship's engines (local ship coordinates) */
  build(engines) {
    const g = new THREE.Group();
    g.name = 'fx';
    g.userData.fx = true;
    engines.forEach((e, i) => {
      const len = e.r * 3.8;
      const phase = i * 1.7;
      for (const [geo, m, sr, sl] of [[this.plumeGeo, this.plumeMat, 1, 1], [this.coreGeo, this.coreMat, 0.55, 0.62]]) {
        const mesh = new THREE.Mesh(geo, m);
        mesh.userData.fx = true;
        mesh.position.set(e.x, e.y, e.z);
        mesh.scale.set(e.r * sr, e.r * sr * (e.ry || 1), len * sl);
        mesh.userData.len = len * sl;
        mesh.userData.phase = phase;
        mesh.renderOrder = 2;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        g.add(mesh);
      }
    });
    return g;
  }

  /** advance animation; groups = the fx groups currently on stage */
  tick(t, groups) {
    this.time.value = t;
    // follow the livery: plume = glow hue, core = whiter and hotter
    const em = this.glow.emissive;
    this.color.value.copy(em).multiplyScalar(1.1);
    this.coreColor.value.copy(em).lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(1.3);
    for (const g of groups) {
      for (const m of g.children) {
        const k = 1 + 0.07 * Math.sin(t * 9 + m.userData.phase) + 0.03 * Math.sin(t * 23 + m.userData.phase * 2);
        m.scale.z = m.userData.len * k;
      }
    }
  }
}
